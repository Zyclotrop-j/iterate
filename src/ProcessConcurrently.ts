import { isIterable } from "./isIterable.js";
import { Task } from "./Task.mjs";
import { createLoop } from "./createLoop.js";

const staticProps = {
  enumerable: false,
  configurable: false
};

export const defaultLogger = (...args: any[]) => console.log(...args);

export type Meta<Result, IdxArg = unknown> = {
  readonly idx: number;
  readonly done: number;
  readonly active: number;
  readonly idxArg: IdxArg;
  readonly results: Result[];
  signal: AbortSignal;
  readonly worker: number;
  readonly waiting?: number;
  readonly total?: number;
};

// The function that processes each item.
export type IteratorFunction<Input, Common, Result> =
  (input: Input, common: Common, ctx: Meta<Result>) => Promise<Result> | Result;
export type IteratorFunction2<Applied extends any[], Result> =
  (...args: Applied) => Promise<Result> | Result;
  

// applyArgs transforms (item, common, ctx) into the spread args for fn.
// Returns a tuple matching fn's parameter list.
export type ApplyArgsFn<Item, Common, Applied extends any[], Result> =
  (item: Item, common: Common, ctx: Meta<Result>) => Applied;

// Internal task handle — each Task pushes itself onto concurrent.jobs with this shape
export interface TaskHandle {
  promise: Promise<void>;
  abortController: AbortController;
}

// The shared context object passed between ProcessConcurrently, Task, and createLoop
export interface ConcurrentContext<Item, Common, Applied extends any[], Result> {
  isAsyncIter: boolean | ((...args: any[]) => AsyncIterator<any>) | undefined;
  results: Result[];
  errors: any[];
  jobs: TaskHandle[];
  oldTasks: TaskHandle[];
  doneitems: number;
  idxx: number;
  active: number;
  done: boolean;
  iterator: Iterator<any> | AsyncIterator<any>;
  log: (...args: any[]) => void;
  applyArgs: (item: Item, common: Common, meta: Meta<Result>) => Applied;
  commonArgs: Common;
  idxArg: Iterable<Item> | AsyncIterable<Item>;
  fn: IteratorFunction<Item, Common, Result> | IteratorFunction2<Applied, Result>;
}

// Properties added to the instance via Object.defineProperties
export interface ProcessConcurrentlyInstance<Result> extends Promise<Result[]> {
  concurrency: number;
  readonly result: Result[];
  readonly done: number;
  readonly active: number;
  readonly idx: number;
  readonly running: boolean;
  readonly errors: any[];
  readonly waiting?: number;
  readonly total?: number;
  valueOf(): Promise<Result[]>;
}

type LogOption = 'log' | 'info' | 'warn' | 'error' | ((...args: any[]) => void);

// Overload 1: With applyArgs — fn receives Input (first element of the tuple returned by applyArgs)
export function ProcessConcurrently<Item, Common, Applied extends any[], Result>(
  fn: IteratorFunction2<Applied, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options: {
    commonArgs?: Common;
    concurrency?: number;
    log?: LogOption;
    applyArgs: ApplyArgsFn<Item, Common, Applied, Result>;
  }
): ProcessConcurrentlyInstance<Result>;

// Overload 2: Without applyArgs — fn receives Item directly
export function ProcessConcurrently<Item, Common, Result>(
  fn: IteratorFunction<Item, Common, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options?: {
    commonArgs?: Common;
    concurrency?: number;
    log?: LogOption;
    applyArgs?: never;
  }
): ProcessConcurrentlyInstance<Result>;

// Implementation
export function ProcessConcurrently<Item, Common, Applied extends any[], Result>(
  fn: IteratorFunction<Item, Common, Result> | IteratorFunction2<Applied, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options: {
    commonArgs?: Common;
    concurrency?: number;
    log?: LogOption;
    applyArgs?: ApplyArgsFn<Item, Common, Applied, Result>;
  } = {}
) {
  const {
    commonArgs = {} as Common,
    concurrency = 4,
    applyArgs = (item: Item, common: Common, ctx: Meta<Result>) =>
      [item, common, ctx] as Applied,
  } = options;

  // Constructor Guard
  if (!(this instanceof ProcessConcurrently)) {
    return new (ProcessConcurrently as any)(fn, idxArg, options);
  }

  const self = this as ProcessConcurrentlyInstance<Result>;
  if (concurrency <= 0) {
    throw new TypeError(`'concurrency' must be > 0! Found ${concurrency}`);
  }
  if (!isIterable(idxArg)) {
    throw new TypeError(`'idxArg' must be iterable! Found ${idxArg}`);
  }

  let logger: (...args: any[]) => void;
  if (['info', 'log', 'warn', 'error'].includes(options.log as string)) {
    const logLevel = options.log as 'log' | 'info' | 'warn' | 'error';
    logger = console[logLevel].bind(console);
  } else if (typeof options.log === 'function') {
    logger = options.log;
  } else if (options.log == null) {
    logger = defaultLogger;
  } else {
    logger = () => {};
  }

  const asyncIter = (idxArg as AsyncIterable<Item>)[Symbol.asyncIterator]?.bind(idxArg);
  const syncIter = (idxArg as Iterable<Item>)[Symbol.iterator]?.bind(idxArg);
  const iter = syncIter ? syncIter() : asyncIter!();
  const concurrent = {
    isAsyncIter: !syncIter && asyncIter,
    results: [] as Result[],
    errors: [] as any[],
    jobs: [] as any[],
    oldTasks: [] as any[],
    doneitems: 0,
    idxx: 0,
    active: 0,
    done: false,
    iterator: iter,
    log: logger,
    applyArgs,
    commonArgs,
    idxArg,
    fn,
  } satisfies ConcurrentContext<Item, Common, Applied, Result>;
  const unpausenoop = () => null;
  let unpause: () => null | void = unpausenoop;
  const pause = () => {
    return new Promise<void>(res => {
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
    set(newValue: number) {
      const isPaused = concurrent.jobs.length < 1;
      if (Math.max(newValue, 0) < concurrent.jobs.length) {
        logger(`Scaling down to ${Math.max(newValue, 0)}`);
        while (concurrent.jobs.length > newValue) {
          const oldTask = concurrent.jobs.pop();
          oldTask.abortController.abort();
          concurrent.oldTasks.push(oldTask);
        }
        logger(`Scaled down to ${Math.max(newValue, 0)}`);
      } else if (newValue > concurrent.jobs.length) {
        logger(`Scaling up to ${newValue}`);
        const newTasks = newValue - concurrent.jobs.length;
        for (let i = 0; i < newTasks; i++) {
          new Task(concurrent); // pushes itself to jobs upon creation
        }
        logger(`Scaled up to ${newValue}`);
      }
      if (isPaused) {
        logger('unpausing');
        unpause(); // resolve the promise that blocks checking job-completion
      }
    },
    ...staticProps
  });
  Object.defineProperties(this, {
    then: {
      get() {
        return (thenFn: any, catchFn: any) => loop.then(thenFn, catchFn);
      },
      ...staticProps
    },
    catch: {
      get() {
        return (catchFn: any) => loop.catch(catchFn);
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
      get() { return ([] as Result[]).concat(concurrent.results); },
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
  if ((concurrent.idxArg as any).length) {
    Object.defineProperties(self, {
      waiting: {
        get() { return (concurrent.idxArg as any).length - concurrent.idxx; },
        ...staticProps
      },
      total: {
        get() { return (concurrent.idxArg as any).length; },
        ...staticProps
      },
    });
  }
};

Object.defineProperty(ProcessConcurrently, Symbol.species, {
  get() { return Promise; },
  enumerable: false,
  configurable: false
});
