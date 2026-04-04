import { getLength } from "./getLength.js";
import { isConstructable } from "./isConstructable.js";
import { tryGetIn } from "./tryGetIn.js";
import type { ConcurrentContext, TaskHandle, Meta, IteratorFunction, IteratorFunction2, FnLifecycle } from "./ProcessConcurrently.js";

function ensureCallableFunction<Item, Common, Applied extends any[], Result>(controller: AbortController, c: number, ctx: ConcurrentContext<Item, Common, Applied, Result>):  FnLifecycle & (IteratorFunction<Item, Common, Result> | IteratorFunction2<Applied, Result>) {
  if (isConstructable(ctx.fn)) {
    try {
      const inst = new (ctx.fn as any)({ signal: controller.signal, worker: c });
      if (inst.run) {
        const run = inst.run.bind(inst);
        if(inst.init) run.init = inst.init.bind(inst);
        if(inst.destroy) run.destroy = inst.destroy.bind(inst);
        return run;
      }
    } catch (e) { }
  }
  return ctx.fn as any;
}

export function Task<Item, Common, Applied extends any[], Result>(this: TaskHandle, ctx: ConcurrentContext<Item, Common, Applied, Result>) {
  const c = ctx.jobs.length;
  const controller = new AbortController();
  this.abortController = controller;
  const fn = ensureCallableFunction(controller, c, ctx);
  this.promise = (async (): Promise<void> => {
    await Promise.resolve(); // next tick
    if (ctx.done) { // already done, no need to create another slot
      return;
    }
    let isSetup = false;
    const firstTimeSetup = () => {
      if(isSetup) return;
      ++ctx.active;
      if ('init' in ctx.fn && ctx.fn.init) {
        ctx.fn.init({ signal: controller.signal, worker: c });
      }
      if ('init' in fn && fn.init) {
        fn.init({ signal: controller.signal, worker: c });
      }
      isSetup = true;
    }
    while (!ctx.done && !controller.signal.aborted) {
      let nextValue = ctx.iterator.next(); // iterator protocol
      if (ctx.isAsyncIter) {
        nextValue = await nextValue;
      }
      const { value: item, done: d } = nextValue as IteratorResult<unknown>;
      ctx.done ||= !!d;
      if (ctx.done)
        break;
      firstTimeSetup();
      const localIdx = ctx.idxx++;
      ctx.log(`[SLOT ${c}]: ${item}`);
      const meta: Meta<Result> = {
        get idx() { return ctx.idxx; },
        get done() { return ctx.doneitems; },
        get active() { return ctx.active; },
        get idxArg() { return ctx.idxArg; },
        get results() { return [...ctx.results]; },
        signal: controller.signal,
        get worker() { return c; }
      };
      const isSet = ctx.idxArg instanceof Set;
      const idxArgAny = ctx.idxArg as any;
      if (isSet || typeof ctx.idxArg === 'string' || tryGetIn('length', idxArgAny) || idxArgAny.length) {
        Object.defineProperties(meta, {
          waiting: { get() { return getLength(isSet, ctx) - ctx.idxx; }, enumerable: true, configurable: true },
          total: { get() { return getLength(isSet, ctx); }, enumerable: true, configurable: true },
        });
      }
      try {
        const spreadArgs = ctx.applyArgs(item, ctx.commonArgs, meta);
        const result = await (fn as (...args: unknown[]) => unknown).apply(fn, spreadArgs) as Result;
        ctx.results[localIdx] = result;
      } catch (e) {
        ctx.errors[localIdx] = e;
        --ctx.active; // we're throwing which means, this task will stop processing
        // we don't increase doneitems, as the item has errored and isn't done
        if ('destroy' in ctx.fn && ctx.fn.destroy) { // we also invoke cleanup code, if defined
          ctx.fn.destroy({ worker: c, error: e });
        }
         if ('destroy' in fn && fn.destroy) { // we also invoke cleanup code, if defined
          fn.destroy({ worker: c, error: e });
        }
        if (ctx.iterator.throw) { // if the iterator can be set to done, we set it to done with error
          ctx.iterator.throw(e);
        }
        throw e; // we re-throw the error and let it bubble up, right to the top
      }
      ctx.doneitems++;
      const total = isSet ? idxArgAny.size : idxArgAny.length;
      ctx.log(`${ctx.doneitems}${total ? ` of ${total}` : ''} done`);
    }
    if (ctx.iterator.return) {
      ctx.iterator.return();
    }
    if ('destroy' in ctx.fn && ctx.fn.destroy) {
      ctx.fn.destroy({ worker: c });
    }
    if ('destroy' in fn && fn.destroy) {
      fn.destroy({ worker: c });
    }
    --ctx.active;
  })();
  ctx.jobs.push(this);
}
