function isIterable(obj) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

const handler={construct(){return handler}};
function isConstructable(x) {
    try{
        return !!(new (new Proxy(x,handler))())
    }catch(e){
        return false
    }
}

function Task(ctx) {
    const c = ctx.jobs.length;
    const controller = new AbortController();
    this.abortController = controller;
    let fn = ctx.fn;
    if(isConstructable(ctx.fn)) {
      try {
        const inst = new ctx.fn({ signal: controller.signal, worker: c });
        if(inst.run) {
          fn = inst.run.bind(inst);
        }
      } catch(e) {}
    }
    this.promise = (async () => {
        if(ctx.done) { // already done, no need to create another slot
            return;
        }
        await Promise.resolve(); // next tick
        ++ctx.active;
        if(ctx.fn.init) {
          ctx.fn.init({ signal: controller.signal, worker: c });
        }
        while(!ctx.done && !controller.signal.aborted) {
            const {value: item, done: d} = ctx.iterator.next(); // iterator protocol
            ctx.done ||= d;
            if(ctx.done) break;
            const localIdx = ctx.idxx++;
            ctx.log(`[${ctx.jobname} ${c}]: ${item}`);
            const meta = { idx: ctx.idxx, done: ctx.doneitems, active: ctx.active, idxArg: ctx.idxArg, results: [].concat(ctx.results), signal: controller.signal, worker: c };
            if(ctx.idxArg.length) {
                meta.waiting = ctx.idxArg.length - ctx.idxx;
                meta.total = ctx.idxArg.length;
            }
            try {
                const result = await fn(...ctx.applyArgs(item, ctx.commonArgs, meta));
                ctx.results[localIdx] = result;
            } catch(e) {
                ctx.errors[localIdx] = e;
                --ctx.active; // we're throwing which means, this task will stop processing
                // we don't increase doneitems, as the item has errored and isn't done
                if(ctx.fn.destroy) {
                  ctx.fn.destroy({ worker: c });
                }
                if(ctx.iterator.throw) {
                  ctx.iterator.throw(e);
                }
                throw e;
            }
            ctx.doneitems++;
            ctx.log(`${ctx.doneitems}${ctx.idxArg.length ? ` of ${ctx.idxArg.length}` : ''} done`)
        }
        if(ctx.iterator.return) {
          ctx.iterator.return();
        }
        if(ctx.fn.destroy) {
          ctx.fn.destroy({ worker: c });
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
    throw new Error(`'idxArg' must be iterable! Found ${idxArg}`);
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
        log(`Scaling down to ${Math.max(newValue, 0)}`)
        while(concurrent.jobs.length > newValue) {
          const oldTask = concurrent.jobs.pop()
          oldTask.abortController.abort();
          concurrent.oldTasks.push(oldTask);
        }
        log(`Scaled down to ${Math.max(newValue, 0)}`)
      } else if(newValue > concurrent.jobs.length) {
        log(`Scaling up to ${newValue}`)
        const newTasks = newValue - concurrent.jobs.length;
        Array.from({ length: newTasks }).map(() => new Task(concurrent));
        log(`Scaled up to ${newValue}`)
      }
      if(isPaused) {
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
  Object.defineProperty(this, Symbol.species, {
    get() {  return Promise; },
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
  Object.defineProperty(this, 'running', {
    get() {  return !concurrent.done },
    enumerable: false,
    configurable: false
  });
  Object.defineProperty(this, 'errors', {
    get() {  return concurrent.errors },
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
Object.defineProperty(ProcessConcurrently, Symbol.species, {
  get() {  return Promise; },
  enumerable: false,
  configurable: false
});

export default ProcessConcurrently;
