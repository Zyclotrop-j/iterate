import { isIterable } from "./isIterable.js";
import { tryGetIn } from "./tryGetIn.js";
import { Task } from "./Task.js";
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
// `common` is typed as `Common | undefined` because `commonArgs` is optional in options.
export type IteratorFunction<Input, Common, Result> =
  (input: Input, common: Common, ctx: Meta<Result>) => Promise<Result> | Result;

// Variant used when applyArgs is provided: fn receives a custom spread argument tuple.
export type IteratorFunction2<Applied extends any[], Result> =
  (...args: Applied) => Promise<Result> | Result;

export interface IteratorFunctionClass<Input, Common, Result> extends FnLifecycle {
  new(arg: { signal: AbortSignal; worker: number }): { run: IteratorFunction<Input, Common, Result> };
}
export interface IteratorFunctionClass2<Applied extends any[], Result> extends FnLifecycle {
  new(arg: { signal: AbortSignal; worker: number }): { run: IteratorFunction2<Applied, Result> };
}

// applyArgs transforms (item, common, ctx) into the spread args for fn.
// Returns a tuple matching fn's parameter list.
export type ApplyArgsFn<Item, Common, Applied extends any[], Result> =
  (item: Item, common: Common | undefined, ctx: Meta<Result>) => Applied;

// Internal task handle — each Task pushes itself onto concurrent.jobs with this shape
export interface TaskHandle {
  promise: Promise<void>;
  abortController: AbortController;
}

// Optional lifecycle hooks that can be attached to the fn function or class.
export interface FnLifecycle {
  init?: (args: { signal: AbortSignal; worker: number }) => void;
  destroy?: (args: { worker: number; error?: unknown }) => void;
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
  applyArgs: (item: Item, common: Common | undefined, meta: Meta<Result>) => Applied;
  commonArgs: Common | undefined;
  idxArg: Iterable<Item> | AsyncIterable<Item>;
  fn: (IteratorFunction<Item, Common, Result> | IteratorFunction2<Applied, Result> | IteratorFunctionClass<Item, Common, Result> | IteratorFunctionClass2<Applied, Result>) & FnLifecycle;
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

// Overload 1a: Without applyArgs — fn receives Item directly - no common args
export function ProcessConcurrently<Item, Result>(
  iteratorFunction: IteratorFunction<Item, undefined, Result> | IteratorFunctionClass<Item, undefined, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options?: {
    concurrency?: number;
    log?: LogOption;
    applyArgs: never;
  }
): ProcessConcurrentlyInstance<Result>;
// Overload 1b: Without applyArgs — fn receives Item directly - with common args
export function ProcessConcurrently<Item, Common, Result>(
  iteratorFunction: IteratorFunction<Item, Common, Result> | IteratorFunctionClass<Item, Common, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options: {
    commonArgs: Common;
    concurrency?: number;
    log?: LogOption;
    applyArgs: never;
  }
): ProcessConcurrentlyInstance<Result>;
// Overload 2a: With applyArgs — fn receives Input (first element of the tuple returned by applyArgs) - no common args
export function ProcessConcurrently<Item, Applied extends any[], Result>(
  iteratorFunction: IteratorFunction2<Applied, Result> | IteratorFunctionClass2<Applied, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options?: {
    concurrency?: number;
    log?: LogOption;
    applyArgs?: ApplyArgsFn<Item, never, Applied, Result>;
  }
): ProcessConcurrentlyInstance<Result>;
// Overload 2b: With applyArgs — fn receives Input (first element of the tuple returned by applyArgs) - with common args
export function ProcessConcurrently<Item, Common, Applied extends any[], Result>(
  iteratorFunction: IteratorFunction2<Applied, Result> | IteratorFunctionClass2<Applied, Result>,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  options: {
    commonArgs: Common;
    concurrency?: number;
    log?: LogOption;
    applyArgs?: ApplyArgsFn<Item, Common, Applied, Result>;
  }
): ProcessConcurrentlyInstance<Result>;

// Implementation
export function ProcessConcurrently<Item, Common, Applied extends any[], Result>(
  this: ProcessConcurrentlyInstance<Result> | undefined,
  iteratorFunction: any,
  idxArg: Iterable<Item> | AsyncIterable<Item>,
  opts: any
) {
  const options = (opts ?? {}) as {
    commonArgs?: any;
    concurrency?: number;
    log?: LogOption;
    applyArgs?: ApplyArgsFn<Item, Common, Applied, Result>;
  };
  const fn = iteratorFunction as IteratorFunction<Item, Common, Result> | IteratorFunction2<Applied, Result> | IteratorFunctionClass<Item, Common, Result> | IteratorFunctionClass2<Applied, Result>;
  const {
    commonArgs: cAr,
    concurrency = 4,
    applyArgs = (item: Item, common: Common | undefined, ctx: Meta<Result>) =>
      [item, common, ctx] as Applied,
  } = options;
  const commonArgs = cAr as Common;

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
  let unpause: () => void = unpausenoop;
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
          new (Task as unknown as new (ctx: typeof concurrent) => void)(concurrent); // pushes itself to jobs upon creation
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
      get() { return [...concurrent.results]; },
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
  // Expose waiting/total only when the iterable has a known length.
  // Mirrors the same check in Task.mjs: covers arrays/strings (.length),
  // Sets (.size), and any object that has a 'length' property.
  const isSet = idxArg instanceof Set;
  const idxArgAny = idxArg as any;
  if (isSet || typeof idxArg === 'string' || tryGetIn('length', idxArgAny) || idxArgAny.length) {
    const getLen = () => isSet ? idxArgAny.size : idxArgAny.length;
    Object.defineProperties(self, {
      waiting: {
        get() { return getLen() - concurrent.idxx; },
        ...staticProps
      },
      total: {
        get() { return getLen(); },
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
