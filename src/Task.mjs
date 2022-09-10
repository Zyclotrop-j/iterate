import { getLength } from "./getLength.mjs";
import { isConstructable } from "./isConstructable.mjs";
import { tryGetIn } from "./tryGetIn.mjs";

export function Task(ctx) {
  const c = ctx.jobs.length;
  const controller = new AbortController();
  this.abortController = controller;
  let fn = ctx.fn;
  if (isConstructable(ctx.fn)) {
    try {
      const inst = new ctx.fn({ signal: controller.signal, worker: c });
      if (inst.run) {
        fn = inst.run.bind(inst);
      }
    } catch (e) { }
  }
  this.promise = (async () => {
    await Promise.resolve(); // next tick
    if (ctx.done) { // already done, no need to create another slot
      return;
    }
    ++ctx.active;
    if (ctx.fn.init) {
      ctx.fn.init({ signal: controller.signal, worker: c });
    }
    while (!ctx.done && !controller.signal.aborted) {
      let nextValue = ctx.iterator.next(); // iterator protocol
      if(ctx.isAsyncIter) {
        nextValue = await nextValue;
      }
      const { value: item, done: d } = nextValue;
      ctx.done ||= d;
      if (ctx.done)
        break;
      const localIdx = ctx.idxx++;
      ctx.log(`[SLOT ${c}]: ${item}`);
      const meta = { 
        get idx() { return ctx.idxx; }, 
        get done() { return ctx.doneitems; }, 
        get active() { return ctx.active; }, 
        get idxArg() { return ctx.idxArg; }, 
        get results() { return [].concat(ctx.results); }, 
        signal: controller.signal, 
        get worker() { return c; }
      };
      const isSet = ctx.idxArg instanceof Set;
      if (isSet || typeof ctx.idxArg === 'string' || tryGetIn('length', ctx.idxArg) || ctx.idxArg.length) {
        Object.defineProperties(meta, {
          waiting: { get() { return getLength(isSet, ctx) - ctx.idxx; }, enumerable: true, configurable: true },
          total: { get() { return getLength(isSet, ctx); }, enumerable: true, configurable: true },
        });
      }
      try {
        const result = await fn(...ctx.applyArgs(item, ctx.commonArgs, meta));
        ctx.results[localIdx] = result;
      } catch (e) {
        ctx.errors[localIdx] = e;
        --ctx.active; // we're throwing which means, this task will stop processing
        // we don't increase doneitems, as the item has errored and isn't done
        if (ctx.fn.destroy) { // we also invoke cleanup code, if defined
          ctx.fn.destroy({ worker: c, error: e });
        }
        if (ctx.iterator.throw) { // if the iterator can be set to done, we set it to done with error
          ctx.iterator.throw(e);
        }
        throw e; // we re-throw the error and let it bubble up, right to the top
      }
      ctx.doneitems++;
      ctx.log(`${ctx.doneitems}${ctx.idxArg.length ? ` of ${ctx.idxArg.length}` : ''} done`);
    }
    if (ctx.iterator.return) {
      ctx.iterator.return();
    }
    if (ctx.fn.destroy) {
      ctx.fn.destroy({ worker: c });
    }
    --ctx.active;
  })();
  ctx.jobs.push(this);
}
