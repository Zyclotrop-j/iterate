import assert from 'node:assert';

import ProcessConcurrently from "./index.mjs";

// helpers
const noop = () => null;
const f = (x) => new Promise(res => setTimeout(() => res(x), 0)); // sample fn

export default test => {
    
  test('negative concurrency', async function() {
    const arr = [1, 2, 3];
    assert.throws(
      () => {
        ProcessConcurrently(f, arr, { log: noop, concurrency: -1 })
      },
      {
        name: 'TypeError',
        message: "'concurrency' must be > 0! Found -1",
      }
    );
  });
  test('non-iterable idxArg', async function() {
    assert.throws(
      () => {
        ProcessConcurrently(f, undefined, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found undefined",
      }
    );
    assert.throws(
      () => {
        ProcessConcurrently(f, null, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found null",
      }
    );
    assert.throws(
      () => {
        ProcessConcurrently(f, false, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found false",
      }
    );
    assert.throws(
      () => {
        ProcessConcurrently(f, true, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found true",
      }
    );
    assert.throws(
      () => {
        ProcessConcurrently(f, 1, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found 1",
      }
    );
    assert.throws(
      () => {
        ProcessConcurrently(f, {}, { log: noop })
      },
      {
        name: 'TypeError',
        message: "'idxArg' must be iterable! Found [object Object]",
      }
    );
  });
  test('test default logging', async function() {
    const old = global.console;
    let consoleTriggered = false;
    global.console = { log(x) {
      assert(x);
      consoleTriggered = true;
    } };
    const arr = [1, 2, 3];
    const result = await ProcessConcurrently(f, arr);
    assert.deepEqual(result, arr);
    assert(consoleTriggered);
    global.console = old;
  });
  test('ensure ProcessConcurrently is promise', async function() {
    assert.equal(ProcessConcurrently[Symbol.species], Promise);
  });





  // actual func
  test('iterate array', async function() {
      const arr = [1, 2, 3];
      const result = await ProcessConcurrently(f, arr, { log: noop });
      assert.deepEqual(result, arr);
  });
  test('iterate array sync function', async function() {
    const arr = [1, 2, 3];
    const result = await ProcessConcurrently(x => x, arr, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate empty array', async function() {
    const arr = [];
    const result = await ProcessConcurrently(f, arr, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate big array', async function() {
    const arr = Array.from({length: 100}).map((_, idx) => idx);
    const result = await ProcessConcurrently(f, arr, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate Set', async function() {
    const arr = [1, 2, 3];
    const set = new Set(arr);
    const result = await ProcessConcurrently(f, set, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate empty Set', async function() {
    const arr = [];
    const set = new Set(arr);
    const result = await ProcessConcurrently(f, set, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate big Set', async function() {
    const arr = Array.from({length: 100}).map((_, idx) => idx);
    const set = new Set(arr);
    const result = await ProcessConcurrently(f, set, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate generator', async function() {
    const arr = [1, 2, 3];
    function* generator() {
      yield arr[0];
      yield arr[1];
      yield arr[2];
    }
    const result = await ProcessConcurrently(f, generator(), { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate empty generator', async function() {
    const arr = [];
    function* generator() {}
    const result = await ProcessConcurrently(f, generator(), { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate giant generator', async function() {
    const arr = Array.from({length: 100}).map((_, idx) => idx);
    function* generator() {
      const a = [...arr];
      while(a.length) {
        yield a.shift();
      }
    }
    const result = await ProcessConcurrently(f, generator(), { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate map', async function() {
    const arr = [[1, 2], [3, 4]];
    const map = new Map(arr);
    const result = await ProcessConcurrently(f, map, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate string', async function() {
    const arr = [1, 2, 3, 4];
    const str = arr.join('');
    const result = await ProcessConcurrently(f, str, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate Int8Array', async function() {
    const arr = [1, 2, 3, 4];
    const typedArray = new Int8Array(arr.length);
    arr.forEach((v, idx) => {
      typedArray[idx] = v;
    });
    const result = await ProcessConcurrently(f, typedArray, { log: noop });
    assert.deepEqual(result, arr);
  });
  test('iterate custom iterator', async function() {
    function makeRangeIterator(start = 0, end = 4, step = 1) {
      let nextIndex = start;
      let iterationCount = 0;
      const rangeIterator = {
        next() {
          let result;
          if (nextIndex < end) {
            result = { value: nextIndex, done: false };
            nextIndex += step;
            iterationCount++;
            return result;
          }
          return { value: iterationCount, done: true };
        },
        [Symbol.iterator] () {
          return this;
        },
      };
      return rangeIterator;
    }
    const arr = [0, 1, 2, 3];
    const result = await ProcessConcurrently(f, makeRangeIterator(0, arr.length), { log: noop });
    assert.deepEqual(result, arr);
  });
  test('fn function args', async function() {
    const sample = {};
    const arr = [1, 2, 3];
    let active = 1;
    let waiting = arr.length;
    let done = 0;
    let idx = 1;
    const fn = (x, common, meta) => {
      assert.equal(common, sample);
      assert(meta.signal instanceof AbortSignal, 'meta.signal instanceof AbortSignal');
      delete meta.signal;
      waiting--;
      assert.deepEqual(meta, {
        active: active,
        done: done,
        idx: idx,
        idxArg: arr,
        results: [],
        total: arr.length,
        waiting: waiting,
        worker: active-1,
      });
      active++;
      idx++;
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    
    const result = await ProcessConcurrently(fn, arr, {
      commonArgs: sample,
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn concurrency 1', async function() {
    const arr = [1, 2, 3, 4, 5, 6];
    const fn = (x, common, meta) => {
      assert.equal(meta.worker, 0);
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 1,
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn concurrency 3', async function() {
    const arr = [1, 2, 3, 4, 5, 6];
    const fn = (x, common, meta) => {
      const worker = (x - 1) % 3; // 1 = worker-id 0; 3 = worker-id 0, etc
      assert.equal(meta.worker, worker);
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 3,
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn concurrency default=4', async function() {
    const arr = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
    const fn = (x, common, meta) => {
      assert.equal(meta.worker, x);
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    const result = await ProcessConcurrently(fn, arr, {
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn concurrency 5', async function() {
    const arr = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
    const fn = (x, common, meta) => {
      assert.equal(meta.worker, x);
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 5,
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn concurrency 100', async function() {
    const arr = [1, 2, 3, 4, 5, 6];
    const fn = (x, common, meta) => {
      assert.equal(meta.worker, x - 1);
      return x;
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 100,
      log: noop,
    });
    assert.deepEqual(result, arr);
  });
  test('fn is constructor', async function() {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7];
    let constructorCalled = 0;
    let initCalled = 0;
    let destroyCalled = 0;
    const fn = class {
      constructor() {
        constructorCalled++;
      }
      static init(args) {
        initCalled++;
      }
      static destroy(args) {
        destroyCalled++;
      }
      run(x) {
        return new Promise(res => setTimeout(() => res(x), 0));
      }
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 4,
      log: noop,
    });
    assert.equal(constructorCalled, 4)
    assert.equal(initCalled, 4)
    assert.equal(destroyCalled, 4)
    assert.deepEqual(result, arr);
  });
  test('fn is function', async function() {
    const arr = [0, 1, 2, 3, 4, 5, 6, 7];
    let initCalled = 0;
    let destroyCalled = 0;
    const fn = function(x) {
      return new Promise(res => setTimeout(() => res(x), 0));
    }
    fn.init = (args) => {
      initCalled++;
    }
    fn.destroy = (args) => {
      destroyCalled++;
    }
    const result = await ProcessConcurrently(fn, arr, {
      concurrency: 4,
      log: noop,
    });
    assert.equal(initCalled, 4)
    assert.equal(destroyCalled, 4)
    assert.deepEqual(result, arr);
  });
  test('iterate throwing fn', async function() {
    const error = {};
    let prom;
    let caught = false;
    let catchClause = false;
    try {
      prom = ProcessConcurrently(() => {
        throw error;
      }, [1], { log: noop });
      prom.catch((e) => {
        catchClause = true;
        assert.equal(e,error);
      });
      await prom.valueOf();
    } catch(e) {
      assert.equal(e, error);
      caught = true;
    }
    assert.equal(caught, true);
    assert.equal(catchClause, true);
    assert.deepEqual(prom.errors, [error]);
    assert.equal(prom[Symbol.species], Promise);
  });
  test('iterate throwing fn', async function() {
    const error = {};
    let prom;
    let caught = false;
    let destroyCalled = false;
    const fn = function() {
      throw error;
    }
    fn.destroy = (e) => {
      destroyCalled = true;
      assert.deepEqual(e, { worker: 0, error })
    }
    const iter = function*() {
      yield 1;
      yield 2;
    }
    const iterInst = iter();
    try {
      prom = ProcessConcurrently(fn, iterInst, { log: noop });
      await prom;
    } catch(e) {
      assert.equal(e, error);
      caught = true;
    }
    assert.equal(iterInst.next().done, true);
    assert.equal(caught, true);
    assert.equal(destroyCalled, true);
    assert.deepEqual(prom.errors, [error]);
  });
  test('iterate Promise-rejecting fn', async function() {
    const error = {};
    try {
      const result = await ProcessConcurrently(() => {
        return Promise.reject(error);
      }, [1], { log: noop });
    } catch(e) {
      assert.equal(e, error)
    }
  });
  test('iterate throwing generator', async function() {
    const error = {};
    let prom;
    let caught = false;
    function* generator() {
      yield 1;
      throw error;
    }
    try {
      prom = ProcessConcurrently(f, generator(), { log: noop });
      await prom;
    } catch(e) {
      assert.equal(e, error)
      caught = true;
    }
    assert.equal(caught, true);
    assert.deepEqual(prom.errors, []); // fn wasn't the one throwing, hence empty - this captures the errors of fn!
  });
  test('static value on promise return correct state of iter for 1 item', async function() {
    const arr = [1];
    const prom = ProcessConcurrently(x => {
      assert.deepEqual(prom.result, [])
      assert.equal(prom.done, 0)
      assert.equal(prom.active, 1)
      assert.equal(prom.idx, 1)
      assert.equal(prom.running, true)
      assert.equal(prom.waiting, 0)
      assert.equal(prom.total, 1)
      return Promise.resolve(x);
    }, arr, { log: noop });
    const result = await prom;
    assert.deepEqual(result, arr);
  });
  test('static value on promise return correct state of iter for 2 items', async function() {
    const arr = [{
      result: [],
      done: 0,
      active: 1,
      idx: 1,
      running: true,
      waiting: 1,
      total: 2,
    }, {
      result: [],
      done: 0,
      active: 2,
      idx: 2,
      running: true,
      waiting: 0,
      total: 2,
    }];
    const prom = ProcessConcurrently(x => {
      assert.deepEqual(prom.result, x.result)
      assert.equal(prom.done, x.done)
      assert.equal(prom.active, x.active)
      assert.equal(prom.idx, x.idx)
      assert.equal(prom.running, x.running)
      assert.equal(prom.waiting, x.waiting)
      assert.equal(prom.total, x.total)
      return Promise.resolve(x);
    }, arr, { log: noop });
    const result = await prom;
    assert.deepEqual(result, arr);
  });
  test('static value on promise return correct state of iter for 4 items and concurrency 2', async function() {
    const arr = [{
      result: [],
      done: 0,
      active: 1,
      idx: 1,
      running: true,
      waiting: 3,
      total: 4,
      v: 1,
    }, {
      result: [],
      done: 0,
      active: 2,
      idx: 2,
      running: true,
      waiting: 2,
      total: 4,
      v: 2,
    },
    {
      result: [1],
      done: 1,
      active: 2,
      idx: 3,
      running: true,
      waiting: 1,
      total: 4,
      v: 3,
    }, {
      result: [1, 2],
      done: 2,
      active: 2,
      idx: 4,
      running: true,
      waiting: 0,
      total: 4,
      v: 4,
    }];
    let called = 0;
    const prom = ProcessConcurrently(x => {
      assert.deepEqual(prom.result, x.result)
      assert.equal(prom.done, x.done)
      assert.equal(prom.active, x.active)
      assert.equal(prom.idx, x.idx)
      assert.equal(prom.running, x.running)
      assert.equal(prom.waiting, x.waiting)
      assert.equal(prom.total, x.total)
      called++;
      return Promise.resolve(x.v);
    }, arr, { log: noop, concurrency: 2 });
    const result = await prom;
    assert.deepEqual(prom.result, arr.map(i => i.v))
    assert.equal(prom.done, 4)
    assert.equal(prom.active, 0)
    assert.equal(prom.idx, 4)
    assert.equal(prom.running, false)
    assert.equal(prom.waiting, 0)
    assert.equal(prom.total, 4)
    assert.equal(called, 4);
    assert.deepEqual(result, arr.map(i => i.v));
  });


  test('pause and resume', async function() {
    const arr = [
      () => {
        prom.concurrency = 0;
        setTimeout(() => {
          prom.concurrency = 1;
        }, 5);
      },
      () => {},
      () => {
        prom.concurrency = 10;
      },
      () => {},
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    let called = 0;
    const fn = function (x) {
      x && x();
      called++;
      return Promise.resolve(x);
    };
    let init = 0;
    fn.init = () => {
      init++;
    };
    const prom = ProcessConcurrently(fn, arr, { log: noop, concurrency: 2 });
    await Promise.resolve(); // wait until the first job is runing
    assert.equal(prom.concurrency, 0);
    assert.equal(prom.active, 1); // the first job is finishing
    await new Promise(res => setTimeout(res, 2)); // wait until the first job has run and paused things
    assert.equal(prom.concurrency, 0);
    assert.equal(prom.active, 0);
    const result = await prom;
    assert.deepEqual(result, arr);
    assert.equal(called, arr.length)
    assert.equal(init, 2 + 0 + 1 + (10 - 1)); // first, goes up to two, as per concurrency setting, then scaled back to 0, then scaled to 1, then scaled to 10
  });

  return test;
}
