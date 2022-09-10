# iterate-async

Iteration of iterables using a async function with concurrency

## Example

```
import ProcessConcurrently from 'ProcessConcurrently';


const result = await ProcessConcurrently(async (item) => {
  await Promise.resolve(); // do something async
  return item * 10
}, [1, 2, 3, 4, 5, 6]);
// result = [2, 4, 6, 8, 10, 12]
```

### Options

You can configure the behaviour of ProcessConcurrently using options (third argument to ProcessConcurrently).
All options are optional. Below you find the defaults.

```
const options = {
  commonArgs: undefined,  // type: any; anything additional you'd like to pass to the processing-function.
  concurrency = 4,  // default: 4; type = positive integer; how many items are processed at the same time
  log = (...args) => console.log(...args),  //  type = function(...args: any[]): void; logs to global console by default; attach your logger here!
};
const fn = async (item, commonArgs) => {
  // commonArgs is whatever you pass in options
  ...
};
const result = await ProcessConcurrently(fn, ..., options);
```

### Meta-information and context

The current progress-information is passed to the process-function as a third argument.
The following context information is available:

```
type Ctx = {
  idx: number // index of the current item being processed
  done: number // count of items already processed
  active: number // count of items currently processing
  idxArg: T // the current item in raw being processed
  results: R[] // whatever you have returned from the processing function
  signal: AbortSignal // if the current processing job was cancelled, this Abort-signal will go off; usefull to pass to network requests, e.g. fetch
  worker: number // index of current worker - same as count of jobs that have been spawned to handle items when this worker was instantiated
  waiting?: number // count of items waiting to be processed - not present if not available, e.g. because arr doesn't have a length
  total?: number // total count of items (in any state) - not present if not available, e.g. because arr doesn't have a length
}
const fn = async (item, commonArgs, metaInformation) => {
  // metaInformation has the form of Ctx above
  console.log(metaInformation.idxArg); // 1, 2, 3
  console.log(metaInformation.results); // [], [10], [10, 20]
  ...
  return Promise.resolve(item * 10)
};
const arr: T[] = [1, 2, 3];
const result = await ProcessConcurrently(fn, arr, { concurrency: 1 });
```

### Processing things other than arrays

You can process any iterable, not just arrays!
```
const result = await ProcessConcurrently(async (item) => {
  await Promise.resolve(); // do something async
  return item * 10
}, new Set([1, 2, 3, 4, 5, 6]));
// result = [2, 4, 6, 8, 10, 12]
```

```
const arr = function* () {
  yield 1;
  yield 2;
  yield 3;
  yield 4;
  yield 5;
  yield 6;
};
const result = await ProcessConcurrently(async (item) => {
  await Promise.resolve(); // do something async
  return item * 10
}, arr());
// result = [2, 4, 6, 8, 10, 12]
```

## Examples

Call an api in the browser.
```
const fn = (item, { url }) => {
  return fetch(`${url}${item}`)
    .then(response => response.json());
};
const result = await ProcessConcurrently(fn, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], {
  commonArgs: {
    url: 'https://jsonplaceholder.typicode.com/todos/'
  }
});
console.log(result);
```

File-system in nodejs.
```
const fs = require('node:fs/promises');

const fn = (item, { folder }) => {
  return fs.readFile(`${folder}${item}`);
};
const result = await ProcessConcurrently(fn, ['foo', 'bar'], {
  commonArgs: {
    folder: './'
  }
});
console.log(result);
```

Create more tasks from within the tasks.
```
const fs = require('node:fs');
const fsp = require('node:fs/promise');
const path = require('node:path');

const upload = async (file, fielname, target) => {
  ....
}
const fn = (filename, { target, source }) => {
  const file = await fsp.readFile(`${source}${filename}`);
  const isOK = await upload(file, filename, target);
  return isOK;
};

const iterateDir = function*(dir) {
  for(const fileOrDir of fs.readdirSync(dir)) {
    if (fs.statSync(p).isDirectory()) {
      return yield* iterateDir(p);
    } else {
      yield p;
    }    
  }
};

const result = await ProcessConcurrently(fn, iterateDir('./source'), {
  commonArgs: {
    target: 'https://myapi/upload'
    source: './source'
  }
});
console.log(result);
```

Using meta-information.
```
const fn = (item, { progressIndicator }, meta) => {
  progressIndicator.innerHTML = `Progress: ${(meta.done / meta.total * 100)}%`;
  .... // actually progress your item here
};
const result = await ProcessConcurrently(fn, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], {
  commonArgs: { progressIndicator: document.querySelector('#progressindicator') }
});
console.log(result);
```

