# iterate-async

Concurrent async iteration over any iterable — arrays, Sets, generators, async generators, Maps, strings, and custom iterators.

Like `await Promise.all(items.map(fn))` but with a concurrency limit, live progress, dynamic scaling, and support for infinite/lazy sequences.

## Installation

```sh
npm install iterate-async
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
  total?: number;    // total item count (only present for sized iterables: arrays, Sets, strings)
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
await ProcessConcurrently(fn, items, { log: false });       // disable logging
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

## Typescript support

This library supports TypeScript natively.
Make sure you type your iterator function well!

```
import ProcessConcurrently from 'iterate-async';

ProcessConcurrently(async (arg, com, meta): Promise<string> => {
    console.log(com.hello);
    console.log({...meta});
    return arg.toFixed();
}, [1, 2, 3, 4], {
    commonArgs: {
        hello: 'world'
    }
}).then((results) => {
  console.log(results);
});

ProcessConcurrently(async (arg, _, meta): Promise<string> => {
    console.log({...meta})
    return arg.toFixed();
}, [1, 2, 3, 4], {
    concurrency: 2
}).then((results) => {
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

ProcessConcurrently(async (a: string, b: string): Promise<string> => {
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
