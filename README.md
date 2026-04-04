# iterate-async

Concurrent async iteration over any iterable — arrays, Sets, generators, async generators, Maps, strings, and custom iterators.

Like `await Promise.all(items.map(fn))` but with a concurrency limit, live progress, dynamic scaling, and support for infinite/lazy sequences.

## Installation

```sh
npm install iterate-async
```

```sh
yarn add iterate-async
```

```sh
pnpm add iterate-async
```

## Basic usage

```js
import ProcessConcurrently from 'iterate-async';

const results = await ProcessConcurrently(async (item) => {
  return item * 2;
}, [1, 2, 3, 4, 5, 6]);
// [2, 4, 6, 8, 10, 12]
```

CommonJS:

```js
const { ProcessConcurrently } = require('iterate-async');
```

## API

```ts
ProcessConcurrently(fn, iterable, options?) => ProcessConcurrentlyInstance<Result>
```

`ProcessConcurrentlyInstance` extends `Promise<Result[]>` — you can `await` it directly.

### Parameters

#### `fn`

The function called for each item. Receives `(item, commonArgs, meta)`.

```js
const fn = async (item, common, meta) => {
  // item    — current item from the iterable
  // common  — whatever you passed as options.commonArgs
  // meta    — live progress info (see Meta below)
  return processedValue;
};
```

`fn` can also be a **class** or a **function with static lifecycle hooks** — see [Lifecycle hooks](#lifecycle-hooks).

#### `iterable`

Any sync or async iterable: `Array`, `Set`, `Map`, `string`, generator, async generator, or any object implementing `[Symbol.iterator]` or `[Symbol.asyncIterator]`.

#### `options`

All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `4` | Max items processed simultaneously. Must be > 0. |
| `commonArgs` | `any` | `undefined` | Passed as the second argument to `fn` on every call. |
| `log` | `'log'`\|`'info'`\|`'warn'`\|`'error'`\|`fn` | `console.log` | Progress logger. Pass a no-op `() => {}` to silence. |
| `applyArgs` | `(item, common, meta) => [...args]` | — | Transform item into the spread argument list for `fn`. See [applyArgs](#applyargs). |

### Meta

The third argument to `fn` provides live progress information. All properties are read live at the moment you access them.

```ts
type Meta = {
  idx: number;       // 1-based index of the current item (increments as items are dispatched)
  done: number;      // count of successfully completed items
  active: number;    // count of items currently in-flight
  worker: number;    // 0-based index of the worker slot handling this item
  idxArg: any;       // the original iterable passed to ProcessConcurrently
  results: Result[]; // snapshot of results collected so far
  signal: AbortSignal; // aborted if this worker slot is scaled down or on error
  waiting?: number;  // items not yet started (only present when total is known)
  total?: number;    // total item count (only present for sized iterables such as arrays, Sets and strings)
}
```

`waiting` and `total` are absent for unsized iterables (generators, Maps, custom iterators).

### Instance properties

The returned instance is a `Promise<Result[]>` with additional live-readable properties:

```js
const job = ProcessConcurrently(fn, items, options);

job.concurrency  // current number of worker slots (writable — see Dynamic concurrency)
job.result       // snapshot of results collected so far
job.done         // count of completed items
job.active       // count of in-flight items
job.idx          // count of items dispatched so far
job.running      // true until all items are processed
job.errors       // array of errors (indexed by item position)
job.waiting      // items not yet started (sized iterables only)
job.total        // total item count (sized iterables only)

await job;       // resolves to Result[]
job.valueOf()    // returns the underlying Promise directly
```

### Dynamic concurrency

You can change the number of concurrent workers at any time by assigning to `.concurrency`:

```js
const job = ProcessConcurrently(fn, largeDataset, { concurrency: 4 });

// Scale up
job.concurrency = 10;

// Pause processing (scale to 0)
job.concurrency = 0;

// Resume
job.concurrency = 4;

await job;
```

Scaling down aborts the excess worker slots via their `AbortSignal`. Scaling up to 0 pauses until concurrency is increased again.

You can use this as a control feature, e.g., you can scale the concurrency down where there are many errors.

```js
if (errorRate > 0.1) job.concurrency = 2;
else job.concurrency = 10;
```

### applyArgs

Use `applyArgs` when `fn` expects a different argument signature than `(item, common, meta)`. It receives the same three arguments and must return an array that will be spread into `fn`.

```js
// fn expects (url, method, body) instead of (item, common, meta)
const fn = async (url, method, body) => { ... };

await ProcessConcurrently(fn, requests, {
  applyArgs: (item, common, meta) => [item.url, item.method, item.body],
});
```

### Lifecycle hooks

`fn` can expose `init` and `destroy` static methods (or class methods).

```js
// As a plain function with statics
async function fn(item, common, meta) { ... }
fn.init    = ({ signal, worker }) => { /* set up worker-local state */ };
fn.destroy = ({ worker, error }) => { /* tear down; error is set if the worker threw */ };

// As a class — constructor receives { signal, worker }, run() processes each item
class fn {
  constructor({ signal, worker }) { /* set up */ }
  init({ signal, worker })    { /* called before the worker loop starts */ }
  destroy({ worker, error })  { /* called when the worker loop ends */ }
  async run(item, common, meta)      { /* processes each item */ }
}

await ProcessConcurrently(fn, items, { concurrency: 4 });
// init/constructor called 4 times (once per slot), destroy called 4 times at the end
```

They are called once per worker slot, not once per item.

This means, this is really useful for setting up shared, but limited resources, such as:
- one DB connection per worker
- one browser tab per worker
- one GPU context per worker

```

class fn {
  constructor({ signal, worker }: { signal: AbortSignal; worker: number }) { console.log("CONSTRUCTOR", worker) }
  init({ signal, worker }: { signal: AbortSignal; worker: number })    { console.log("INIT", worker) }
  destroy({ worker, error }: { worker: number; error?: Error })  { console.log("DESTROY", worker) }
  async run(item: number, common: any, meta: any)      { console.log("RUN", item) }
}
ProcessConcurrently(fn, [1,2, 3, 4], { concurrency: 2, log: () => {} }).then(it => console.log(it))

/*
Logs: 
CONSTRUCTOR 0
CONSTRUCTOR 1
INIT 0
RUN 1
INIT 1
RUN 2
RUN 3
RUN 4
DESTROY 0
DESTROY 1
*/
```

#### Constructor vs init

When passing a class as the iterator function, the library may instantiate up to `<concurrency>` many instances, even when the number of tasks is smaller. This is due to the number of tasks not being limited (or even countable, e.g., in the case of an infinite iterator). Therefore, you should do heavy setup logic in `init` rather than the constructor. `init` is only called once the first task is allocated to the instance. This way you won't waste any resources.


### Pipelining model

Opposed to many other implementations, this library will "pipeline" items. That is, as soon as one item has been processed, the next one is started.
This ensures that there are always <concurrency> number of items being processed in parallel.
This is distinctly different from chunking. To understand more, see the practical example below.

#### Setup

```
const now = Date.now();
async function process(i) {
  const sleep = (i % 2) * 100 + 100;
  await new Promise(res => setTimeout(res, sleep));
  console.log(`Processed ${i} at ${Date.now() - now}`);
  return i;
}
```

#### One item after another

In this example, every item is strictly processed after the previous one is already finished. This is the same as `concurrency: 1` in `ProcessConcurrently`.

`1 ─200─> 2 ─100─> 3 ─200─> 4 ─100─> 5 ─200─> 6 ─100─> 7 ─200─> 8 ─100─> DONE`

```
const items = [1,2,3,4,5,6,7,8];
for(const i of items) {
  await process(i);
}
/*
Processed 1 at 203
Processed 2 at 311
Processed 3 at 527
Processed 4 at 637
Processed 5 at 842
Processed 6 at 951
Processed 7 at 1156
Processed 8 at 1265
*/
```

#### All items at once

In this example, no item waits for another - they are all running in parallel. This is the same as `concurrency: Infinity` in `ProcessConcurrently`.

```
t=0:
1(200) |
2(100) |
3(200) |
4(100) |
5(200) |
6(100) |
7(200) |
8(100) |

t=100: 2,4,6,8 done
t=200: 1,3,5,7 done → DONE
```

```
const items = [1,2,3,4,5,6,7,8];
await Promise.all(items.map(async i => process(i)));
/*
Processed 2 at 114
Processed 4 at 114
Processed 6 at 114
Processed 8 at 115
Processed 1 at 208
Processed 3 at 208
Processed 5 at 208
Processed 7 at 208
*/
```

Note that in the real world, this will go sideways real fast!
Think:
- APIs rate limiting
- DB connection pools
- file descriptor limits
- memory pressure

Concurrency is not only about speed - it's about not crashing your system.

#### One chunk at a time

In this example, items are split into chunks. All items within a chunk are processed in parallel. Each chunk waits for the prvious one to finish before starting the next.

Chunking is like shipping pallets - items are grouped and processed together.

```
Batch 1: [1,2]
1(200) |
2(100) |   → done at 200

Batch 2: [3,4]
3(200) |
4(100) |   → done at 200

Batch 3: [5,6]
5(200) |
6(100) |   → done at 200

Batch 4: [7,8]
7(200) |
8(100) |   → done at 200

TOTAL: 4 batches × 200ms = 800ms
```

```
function chunkArray(arr, size) {
  const chunkedArr = [];
  for (let i = 0; i < arr.length; i += size) {
    chunkedArr.push(arr.slice(i, i + size));
  }
  return chunkedArr;
}
const items = [1,2,3,4,5,6,7,8];
const chunks = chunkArray(items, 2); 
for(const chunk of chunks) {
  await Promise.all(chunk.map(async i => process(i)));
}
/*
Processed 2 at 107
Processed 1 at 215
Processed 4 at 325
Processed 3 at 418
Processed 6 at 527
Processed 5 at 620
Processed 8 at 728
Processed 7 at 822
*/
```

#### Pipelined

In this example, 2 pipelines are created. Each pipeline will pull items one after the other from the pool until all are processed. Pipelines don't wait for one another but are always keeping busy. This ensures consistent throughput without spikes or drops.

Pipelineing is like assembly lines - each item moves station to station continuously

```
t=0:
P1: 1(200)
P2: 2(100)

t=100:
P2 picks next → 3(200)

t=200:
P1 finishes → picks 4(100)
P2 still running 3

t=300:
P1 finishes → picks 5(200)
P2 finishes → picks 6(100)

t=400:
P2 finishes → picks 7(200)

t=500:
P1 finishes → picks 8(100)

t=600:
P1 finishes
t=700:
P2 finishes → DONE
```

```
P1: 1 ─200─> 4 ─100─> 5 ─200─> 8 ─100─> DONE (600ms)
P2: 2 ─100─> 3 ─200─> 6 ─100─> 7 ─200─> DONE (700ms)
```

```
const items = [1,2,3,4,5,6,7,8];
 await ProcessConcurrently(
  i => process(i),
  items,
  { concurrency: 2 }
);
/*
Processed 2 at 104
Processed 1 at 212
Processed 3 at 306
Processed 4 at 322
Processed 6 at 433
Processed 5 at 511
Processed 8 at 619
Processed 7 at 634
*/
```

#### Comparison

| Mode                               | Peak Running | Avg Running | Total Time |
|------------------------------------|-------------|------------|------------|
| Sequential (for-loop)              | 1           | 1.00       | 1200ms     |
| Full Parallel (Promise.all)        | 8           | 6.00       | 200ms      |
| Chunking (batch size = 2)          | 2           | 1.50       | 800ms      |
| Pipeline (concurrency = 2)         | 2           | 1.71       | 700ms      |
| Chunking (batch size = 3)          | 3           | 1.71       | 700ms      |
| Pipeline (concurrency = 3)         | 3           | 2.18       | 550ms      |

#### Example 2

Assume workloads are vastly uneven - this is how, in reality, many workloads (network requets, competing for physical resources, file-processing, ...) behave.

We will assume 1000 items to be processed. As an example formular we take `(i % 100)^2 + 1`, that is item 1 takes 2ms, item 2 takes 5ms, item 3 takes 10ms, ..., item 96 takes 9410ms, item 97 takes 9605ms, item 98 takes 9802ms, item 99 takes 1ms, item 100 takes 2ms and so on.

With this modelling, the table from above looks as follows.

| Mode                              | Peak Running | Avg Running | Total Time |
|-----------------------------------|-------------|------------|------------|
| Sequential                        | 1           | 1.00       | 3,284,500ms |
| Full Parallel                     | 1000        | 335.00     | 9,802ms     |
|-----------------------------------|-------------|------------|------------|
| Chunking (size = 2)               | 2           | 1.00       | 3,284,500ms |
| Chunking (size = 5)               | 5           | 2.50       | 1,313,800ms |
| Chunking (size = 10)              | 10          | 5.00       | 656,900ms   |
| Chunking (size = 20)              | 20          | 10.00      | 328,450ms   |
| Chunking (size = 50)              | 50          | 25.00      | 131,380ms   |
| Chunking (size = 100)             | 100         | 50.00      | 65,690ms    |
| Chunking (size = 200)             | 200         | 100.00     | 32,845ms    |
|-----------------------------------|-------------|------------|------------|
| Pipeline (concurrency = 2)        | 2           | 2.00       | 1,642,250ms |
| Pipeline (concurrency = 5)        | 5           | 5.00       | 656,900ms   |
| Pipeline (concurrency = 10)       | 10          | 10.00      | 328,450ms   |
| Pipeline (concurrency = 20)       | 20          | 20.00      | 164,225ms   |
| Pipeline (concurrency = 50)       | 50          | 50.00      | 65,690ms    |
| Pipeline (concurrency = 100)      | 100         | 100.00     | 32,845ms    |
| Pipeline (concurrency = 200)      | 200         | 200.00     | 16,423ms    |

Each chunk is only as fast as its _slowest_ item. Thus each chunking step is almost always blocked. Chunking cares about worst case in batch.

In contrast, the pipeline remains stable. Pipeline cares about average.

`Pipeline time ≈ total_work / concurrency`

This means, the gap between chunking and pipeline becomes extreme: In the above example, chunking is consistently ~2x slower!

#### Takeaway

Sequential is simplest but slow.

Full parallel is as fast as it gets, but unsafe due to uncontrolled parallelism.

Chunking is controlled, but inefficient - item-processors within a chunk will sit idle until each item in the chunk is done!

Pipelining is controlled and efficient. Every item-processors is always busy.

*Chunking is dominated by the slowest item in each group; pipelines smooth out variance by continuously redistributing work.*

## Examples

### Fetch with concurrency limit

```js
const results = await ProcessConcurrently(
  (id, { baseUrl }) => fetch(`${baseUrl}${id}`).then(r => r.json()),
  [1, 2, 3, 4, 5],
  { commonArgs: { baseUrl: 'https://api.example.com/items/' }, concurrency: 2 }
);
```

### Read files in Node.js

```js
import { readFile } from 'node:fs/promises';

const buffers = await ProcessConcurrently(
  (filename, { dir }) => readFile(`${dir}/${filename}`),
  ['a.txt', 'b.txt', 'c.txt'],
  { commonArgs: { dir: './data' } }
);
```

### Walk a directory tree with a generator

```js
import { readdirSync, statSync } from 'node:fs';

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const results = await ProcessConcurrently(uploadFile, walk('./src'), { concurrency: 8 });
```

### Walk a directory tree with an async generator

```js
import { readdir, stat } from 'node:fs/promises';

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const path = `${dir}/${entry}`;
    if ((await stat(path)).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const results = await ProcessConcurrently(uploadFile, walk('./src'), { concurrency: 8 });
```

### Progress indicator

```js
const fn = (item, { el }, meta) => {
  el.textContent = `${meta.done} / ${meta.total}`;
  return processItem(item);
};

await ProcessConcurrently(fn, items, {
  commonArgs: { el: document.querySelector('#progress') },
  concurrency: 4,
});
```

### Silence logging

```js
await ProcessConcurrently(fn, items, { log: () => {} });
```

### Use a custom logger

```js
await ProcessConcurrently(fn, items, { log: 'warn' });       // console.warn
await ProcessConcurrently(fn, items, { log: myLogger.info }); // custom function
```

## Browser

Use your bundler's ESM import. For direct browser use without a bundler:

```html
<script type="module">
  import ProcessConcurrently from './node_modules/iterate-async/build/index.mjs';
</script>
```

For legacy global-namespace use:

```html
<script src="./node_modules/iterate-async/build/index.js"></script>
<!-- window.ProcessConcurrently is now available -->
```

## Error handling

If `fn` throws or rejects, the error propagates out of `await job` and the iterator is closed. The error is also recorded in `job.errors` at the item's index position. Other in-flight items complete normally before the rejection settles.

```js
try {
  await ProcessConcurrently(fn, items);
} catch (e) {
  console.error(job.errors); // sparse array — only errored positions are set
}
```

Likewise, if you throw in any life-cycle hooks, the iteration will be cancelled and the iterator closed.

As general guidance, avoid throwing errors and rather return results of form `[OK, data]` and `[ERROR, e]` from `fn`.
You can additionally push failed items back into the task-iterable for re-try.

```
const items = [{i: 1, r: 0}, {i: 2, r: 0}, {i: 3, r: 0}, {i: 4, r: 0}];
const OK = Symbol('OK');
const ERROR = Symbol('ERROR');
await ProcessConcurrently(async (item) => {
  try {
    const result = await taskThatMightFail(item);
    return [OK, result]   
  } catch(e) {
    if(item.r < 10)
      items.push({...item, r: item.r + 1});
    return [ERROR, e];
  }
}, items);
```

## Typescript support

This library supports TypeScript natively.
Make sure you type your iterator function well!

```
import ProcessConcurrently from 'iterate-async';

ProcessConcurrently(async (arg, com, meta): Promise<string> => {
    console.log(com.hello); // type { hello: string }
    console.log({...meta}); // type as documented above
    return arg.toFixed(); // arg is number
}, [1, 2, 3, 4], {
    commonArgs: {
        hello: 'world'
    }
}).then((results) => { // results is string[] as the function returned string
  console.log(results);
});

ProcessConcurrently(async (arg, _, meta): Promise<string> => { // arg is number, _ is undefined (as we pass no commonArgs), meta is as above
    console.log({...meta})
    return arg.toFixed();
}, [1, 2, 3, 4], {
    concurrency: 2
}).then((results) => { // results is string
  console.log(results);
});

ProcessConcurrently(async (arg, common: {
    hello: string;
}, meta): Promise<string> => {
    console.log(common.hello);
    console.log({...meta})
    return arg.toFixed();
}, [1, 2, 3, 4], {
    concurrency: 2,
    commonArgs: {
        hello: 'world'
    }
}).then((results) => {
  console.log(results);
});

ProcessConcurrently(async (a: string, b: string): Promise<string> => { // arg-signature must match the return type of applyArgs
    console.log(a, b);
    return a + ', ' + b;
}, [1, 2, 3, 4], {
    commonArgs: {
        foo: 'bar'
    },
    concurrency: 1,
    applyArgs: (arg: number, common: { foo: string }) => [""+arg, common.foo] as [string, string]
}).then((results) => {
  console.log(results);
});
```

## Why iterate-async?

### Comparisons to libraries and frameworks

#### Quick comparison

- p-map → concurrent mapping over iterables  
- p-limit → concurrency limiter (primitive)  
- p-queue → full task queue (scheduler)  
- **iterate-async** → pipelined iterable processor (work-stealing)

#### Feature comparison

| Feature / Model                | iterate-async | p-map | p-limit | p-queue |
|-------------------------------|--------------|-------|--------|--------|
| Core abstraction              | Iterable pipeline | Array map | Function wrapper | Task queue |
| Works on any iterable         | ✅            | ✅ | ❌ | ❌ |
| Async generators / infinite   | ✅            | ✅ | ❌ | ❌ |
| Concurrency limiting          | ✅            | ✅ | ✅ | ✅ |
| Scheduling model              | Work-stealing pipeline | Batched mapping | Queue + Promise.all | Queue (FIFO / priority) |
| Dynamic concurrency           | ✅            | ❌ | ⚠️ (manual) | ⚠️ (config-driven) |
| Backpressure control          | ✅            | ❌ | ❌ | ✅ |
| Lifecycle hooks (per worker)  | ✅            | ❌ | ❌ | ❌ |
| Progress / live meta          | ✅            | ❌ | ❌ | ⚠️ events |
| Result ordering               | Stable        | Stable | Manual | Configurable |
| Pause / resume                | ✅ | ❌ | ❌ | ✅ |
| Rate limiting (time-based)    | ❌            | ❌ | ❌ | ✅ |

#### Key differences

##### vs p-map

- Processes a *fixed collection* with concurrency
- lacks progress reporting and lifecycle hooks

**Bottom line:**  
`p-map = concurrent map`  
`iterate-async = streaming pipeline`

##### vs p-limit

- `p-limit` is a **low-level primitive**
- You manually wrap functions and still rely on `Promise.all`

**Critical difference:**

```js
// p-limit → YOU manage the loop + scheduling
await Promise.all(items.map(item => limit(() => fn(item))));

// iterate-async → scheduling is built-in
await ProcessConcurrently(fn, items);
```

**Bottom line:**  
`p-limit = building block`
`iterate-async = system`

##### vs p-queue

p-queue is a task queue which focuses on priorities, pause/resume and rate limiting

iterate-async:
- No queue abstraction
- Focus is data flow, not job orchestration

Core difference:
- Queue → push tasks into system
- Pipeline → pull work from iterable

**Bottom line:**  
`p-queue = scheduler`
`iterate-async = processor`

##### When to use what

Use iterate-async when:
- You intend to process _something_ iterable
- Workloads are uneven or unpredictable
- One workload may spawn one or more other workload
- You want to dynamically control concurrency
- You can't use all-at-once or one-at-a-time
- You want one abstraction that just works

Use p-map when:
- You have a fixed-size iterable
- You just want `Promise.all` with limited concurrency

Use p-limit when:
- You already have a system
- You just need to cap concurrency

Use p-queue when:
- You need priorities / retries / scheduling
- You are building a job system

### iterate-async's pipelining implementation

This implementation is a *work-stealing scheduler over an iterable*.

It's not chunking; it's not like most naive concurrency pools; *there is no pre-partitioning, no fixed assignment - just pull-based scheduling.*

### In a nutshell

- No dependencies - no fuss
- Native - use with any native type. No fancy pipeline constructors, no wrappers. Just pure javascript
- Build in typescript
- Native es6 (.mjs) support
- One single, simple export - `ProcessConcurrently` - that can be directly awaited
- Iterate *anything* without prior conversion
- Small (4.33 kB raw /1.78 kB gzip)
- Well-tested
- Uses pipelining rather than chunking
