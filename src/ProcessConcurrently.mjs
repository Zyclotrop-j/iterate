import { isIterable } from "./isIterable.mjs";
import { Task } from "./Task.mjs";

export function ProcessConcurrently(fn, idxArg, {
  commonArgs, concurrency = 4, jobname = "SLOT", log = (...args) => console.log(...args), applyArgs = (item, common, ctx) => [item, common, ctx],
} = {}) {
  if (!this || !(this instanceof ProcessConcurrently)) {
    return new ProcessConcurrently(fn, idxArg, {
      commonArgs,
      concurrency,
      jobname,
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
  const concurrent = {
    results: [],
    errors: [],
    jobs: [],
    oldTasks: [],
    doneitems: 0,
    idxx: 0,
    active: 0,
    done: false,
    iterator: idxArg[Symbol.iterator](),
    log,
    applyArgs,
    commonArgs,
    jobname,
    idxArg,
    fn,
  };
  const unpausenoop = () => { };
  let unpause = unpausenoop;
  const pause = () => {
    return new Promise(res => {
      if (unpause) {
        unpause();
      }
      unpause = () => {
        unpause = unpausenoop;
        res();
      };
    });
  };
  const loop = (async () => {
    Array.from({ length: concurrency }).map(() => new Task(concurrent));
    concurrent.log(`Awaiting ${concurrent.jobs.length} jobs to finish`);
    while (!concurrent.done) {
      await Promise.all(concurrent.jobs.map(({ promise }) => promise));
      await Promise.all(concurrent.oldTasks.map(({ promise }) => promise));
      if (!concurrent.done) {
        await pause();
      }
    }
    concurrent.log('Jobs finished');
    return concurrent.results;
  })();
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
        Array.from({ length: newTasks }).map(() => new Task(concurrent));
        log(`Scaled up to ${newValue}`);
      }
      if (isPaused) {
        log('unpausing');
        unpause(); // resolve the promise that blocks checking job-complesion
      }
    },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'valueOf', {
    get() { return () => loop; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'then', {
    get() {
      return (thenFn, catchFn) => {
        loop.then(thenFn, catchFn);
      };
    },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'catch', {
    get() {
      return (catchFn) => {
        loop.catch(catchFn);
      };
    },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, Symbol.species, {
    get() { return Promise; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'result', {
    get() { return [].concat(concurrent.results); },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'done', {
    get() { return concurrent.doneitems; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'active', {
    get() { return concurrent.active; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'idx', {
    get() { return concurrent.idxx; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'running', {
    get() { return !concurrent.done; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'errors', {
    get() { return concurrent.errors; },
    enumerable: false,
    configurable: false
  });
  if (concurrent.idxArg.length) {
    Object.defineProperty(this, 'waiting', {
      get() { return concurrent.idxArg.length - concurrent.idxx; },
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, 'total', {
      get() { return concurrent.idxArg.length; },
      enumerable: false,
      configurable: false
    });
  }
}
;
Object.defineProperty(ProcessConcurrently, Symbol.species, {
  get() { return Promise; },
  enumerable: false,
  configurable: false
});
