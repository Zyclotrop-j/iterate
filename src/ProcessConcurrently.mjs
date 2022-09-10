import { isIterable } from "./isIterable.mjs";
import { Task } from "./Task.mjs";
import { createLoop } from "./createLoop.mjs";

const staticProps = {
  enumerable: false,
  configurable: false
};

export function ProcessConcurrently(fn, idxArg, {
  commonArgs,
  concurrency = 4,
  log = (...args) => console.log(...args),
  applyArgs = (item, common, ctx) => [item, common, ctx],
} = {}) {
  if (!this || !(this instanceof ProcessConcurrently)) {
    return new ProcessConcurrently(fn, idxArg, {
      commonArgs,
      concurrency,
      log,
      applyArgs,
    });
  }
  if (concurrency <= 0) {
    throw new TypeError(`'concurrency' must be > 0! Found ${concurrency}`);
  }
  if (!isIterable(idxArg)) {
    throw new TypeError(`'idxArg' must be iterable! Found ${idxArg}`);
  }
  const asyncIter = idxArg[Symbol.asyncIterator]?.bind(idxArg);
  const syncIter = idxArg[Symbol.iterator]?.bind(idxArg);
  const iter = syncIter ? syncIter() : asyncIter();
  const concurrent = {
    isAsyncIter: !syncIter && asyncIter,
    results: [],
    errors: [],
    jobs: [],
    oldTasks: [],
    doneitems: 0,
    idxx: 0,
    active: 0,
    done: false,
    iterator: iter, // magic is here
    log,
    applyArgs,
    commonArgs,
    idxArg,
    fn,
  };
  const unpausenoop = () => null;
  let unpause = unpausenoop;
  const pause = () => {
    return new Promise(res => {
      if (unpause) {
        unpause(); // ensure old promises are always resolved
      }
      unpause = () => {
        unpause = unpausenoop;
        res();
      };
    });
  };
  const loop = createLoop(concurrency, concurrent, pause);
  Object.defineProperty(this, 'concurrency', {
    get() { return concurrent.jobs.length; },
    set(newValue) {
      const isPaused = concurrent.jobs.length < 1;
      if (Math.max(newValue, 0) < concurrent.jobs.length) {
        log(`Scaling down to ${Math.max(newValue, 0)}`);
        while (concurrent.jobs.length > newValue) {
          const oldTask = concurrent.jobs.pop();
          oldTask.abortController.abort();
          concurrent.oldTasks.push(oldTask);
        }
        log(`Scaled down to ${Math.max(newValue, 0)}`);
      } else if (newValue > concurrent.jobs.length) {
        log(`Scaling up to ${newValue}`);
        const newTasks = newValue - concurrent.jobs.length;
        for(let i = 0; i < newTasks; i++){
          new Task(concurrent); // pushes itself to jobs upon creation
        }
        log(`Scaled up to ${newValue}`);
      }
      if (isPaused) {
        log('unpausing');
        unpause(); // resolve the promise that blocks checking job-complesion
      }
    },
    ...staticProps
  });
  Object.defineProperties(this, {
    then: {
      get() {
        return (thenFn, catchFn) => loop.then(thenFn, catchFn)
      },
      ...staticProps
    },
    catch: {
      get() {
        return (catchFn) => loop.catch(catchFn)
      },
      ...staticProps
    },
    valueOf: {
      get() { return () => loop; },
      ...staticProps
    },
    [Symbol.species]: {
      get() { return Promise; },
      ...staticProps
    },
    result: {
      get() { return [].concat(concurrent.results); },
      ...staticProps
    },
    done: {
      get() { return concurrent.doneitems; },
      ...staticProps,
    }, 
    active: {
      get() { return concurrent.active; },
      ...staticProps,
    }, 
    idx: {
      get() { return concurrent.idxx; },
      ...staticProps,
    }, 
    running: {
      get() { return !concurrent.done; },
      ...staticProps,
    }, 
    errors: {
      get() { return concurrent.errors; },
      ...staticProps,
    }, 

  });
  if (concurrent.idxArg.length) {
    Object.defineProperties(this, {
      waiting: {
        get() { return concurrent.idxArg.length - concurrent.idxx; },
        ...staticProps
      },
      total: {
        get() { return concurrent.idxArg.length; },
        ...staticProps
      },
    });
  }
}
;
Object.defineProperty(ProcessConcurrently, Symbol.species, {
  get() { return Promise; },
  enumerable: false,
  configurable: false
});
