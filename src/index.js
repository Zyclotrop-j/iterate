function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

function Task(ctx) {
    const c = ctx.jobs.length;
    const controller = new AbortController();
    this.abortController = controller;
    this.promise = (async () => {
        if(ctx.done) { // already done, no need to create another slot
            return;
        }
        await Promise.resolve(); // next tick
        while(!ctx.done && !controller.signal.aborted) {
            const {value: item, done: d} = ctx.iterator.next(); // iterator protocol
            ctx.done ||= d;
            if(ctx.done) return;
            const localIdx = ctx.idxx++;
            ctx.log(`[${ctx.jobname} ${c}]: ${item}`);
            const meta = { idx: ctx.idxx, done: ctx.doneitems, active: ctx.active, idxArg: ctx.idxArg, results: [].concat(ctx.results), signal: controller.signal };
            if(ctx.idxArg.length) {
                meta.waiting = ctx.idxArg.length - ctx.idxx;
                meta.total = ctx.idxArg.length;
            }
            try {
                const result = await ctx.fn(...ctx.applyArgs(item, ctx.commonArgs, meta));
                ctx.results[localIdx] = result;
            } catch(e) {
                ctx.errors[localIdx] = result;
                --ctx.active; // we're throwing which means, this task will stop processing
                // we don't increase doneitems, as the item has errored and isn't done
                throw e;
            }
            ctx.doneitems++;
            ctx.log(`${ctx.doneitems}${ctx.idxArg.length ? ` of ${ctx.idxArg.length}` : ''} done`)
        }
        --ctx.active;
    })();
    ctx.jobs.push(this);
}

function ProcessConcurrently(fn, idxArg, {
  commonArgs, 
  concurrency = 4, 
  jobname = "SLOT",
  log = (...args) => console.log(...args),
  applyArgs = (item, common, ctx) => [item, common, ctx],
} = {}) {
	if(!this || !(this instanceof ProcessConcurrently)) {
  	return new ProcessConcurrently(fn, idxArg, {
      commonArgs, 
      concurrency, 
      jobname,
      log,
      applyArgs,
    });
  }
  if(concurrency <= 0) {
    throw new Error(`'concurrency' must be > 0! Found ${concurrency}`);
  }
  if(!isIterable(idxArg)) {
    throw new Error(`'idxArg' must be iterable! Found ${concurrency}`);
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
    jobname,
    idxArg,
    fn,
  };
  const unpausenoop = () => {concurrent.log('Already unpaused - this is a noop')}
  let unpause = unpausenoop;
  const pause = () => {
  	return new Promise(res => {
    	if(unpause) {
      	unpause();
      }
      unpause = () => {
      	unpause = unpausenoop;
      	res();
      };
    });
  }
  const loop = (async () => {
    Array.from({ length: concurrency }).map(() => new Task(concurrent));
    concurrent.log(`Awaiting ${concurrent.jobs.length} jobs to finish`);
    while(!concurrent.done) {
      await Promise.all(concurrent.jobs.map(({promise}) => promise));
      await Promise.all(concurrent.oldTasks.map(({promise}) => promise));
      while(!concurrent.done) {
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
      if(Math.max(newValue, 0) < concurrent.jobs.length) {
        while(concurrent.jobs.length > newValue) {
          const oldTask = concurrent.jobs.pop()
          oldTask.abortController.abort();
          concurrent.oldTasks.push(oldTask);
        }
      } else if(newValue > concurrent.jobs.length) {
        const newTasks = newValue - concurrent.jobs.length;
        Array.from({ length: newTasks }).map(() => new Task(concurrent));
      }
      if(isPaused) {
        unpause(); // resolve the promise that blocks checking job-complesion
      }
    },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'valueOf', {
    get() { return loop; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'then', {
    get() { return (thenFn, catchFn) => {
    	loop.then(thenFn, catchFn);
    }; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'catch', {
    get() {  return (catchFn) => {
    	loop.catch(catchFn);
    }; },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'result', {
    get() {  return [].concat(concurrent.results); },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'done', {
    get() {  return concurrent.doneitems },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'active', {
    get() {  return concurrent.active },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'idx', {
    get() {  return concurrent.idxx },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'hasWaiting', {
    get() {  return !concurrent.done },
    enumerable: false,
    configurable: false
  });
  if(concurrent.idxArg.length) {
    Object.defineProperty(this, 'waiting', {
      get() {  return concurrent.idxArg.length - concurrent.idxx },
      enumerable: false,
      configurable: false
    });
    Object.defineProperty(this, 'total', {
      get() {  return concurrent.idxArg.length },
      enumerable: false,
      configurable: false
    });
  }
};


// test
const f = (x) => new Promise(res => setTimeout(() => res(x), 100)); // sample fn
(async () => {
	const arr = [1, 2, 3];
  const qq = ProcessConcurrently(f, arr);
  arr.push(...Array.from({length: 20}).map((_, idx) => idx+1+3));
  console.log('qq', qq);
	const q = await qq;
  arr.push(5);
  console.log('q', q);
	
})();
