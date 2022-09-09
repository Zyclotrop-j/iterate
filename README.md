# iterate

Iterate of iterables using a given concurrency

## Example

```
import ProcessConcurrently from 'ProcessConcurrently';

type Ctx = {
  idx: number // index of the current item being processed
  done: number // count of items already processed
  active: number // count of items currently processing
  idxArg: T // the current item in raw being processed
  results: R[] // results so far
  signal: AbortSignal
  worker: number // count of jobs that have been spawned to handle items
  waiting?: number // count of items waiting to be processed - not present if not available
  total?: number // total count of items (in any state) - not present if not available
}
const fn = <T, C> async () => { // mandatory; type: function(item: T, common: C, ctx: Ctx)>): Promise<R> | R
  
};
const myIterable = [1, 2, 3, 4, 5, 6]; // type: Iterable<T>, so can be array, set, generator, ...
const options = { // all options are optional; further, options itself is optional
  commonArgs: { something: 3 }, // default: undefined; type = any
  concurrency: 28, // default: 4; type = positive integer
  log: () => void, // default: (...args) => console.log(...args); type = function(...args: any[]): void
};

const result = await ProcessConcurrently(fn, myIterable, options); // returns R[]
```
