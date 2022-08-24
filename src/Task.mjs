import { isConstructable } from "./isConstructable.mjs";

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
      const { value: item, done: d } = ctx.iterator.next(); // iterator protocol
      ctx.done ||= d;
      if (ctx.done)
        break;
      const localIdx = ctx.idxx++;
      ctx.log(`[${ctx.jobname} ${c}]: ${item}`);
      const meta = { idx: ctx.idxx, done: ctx.doneitems, active: ctx.active, idxArg: ctx.idxArg, results: [].concat(ctx.results), signal: controller.signal, worker: c };
      if (ctx.idxArg.length) {
        meta.waiting = ctx.idxArg.length - ctx.idxx;
        meta.total = ctx.idxArg.length;
      }
      try {
        const result = await fn(...ctx.applyArgs(item, ctx.commonArgs, meta));
        ctx.results[localIdx] = result;
      } catch (e) {
        ctx.errors[localIdx] = e;
        --ctx.active; // we're throwing which means, this task will stop processing

        // we don't increase doneitems, as the item has errored and isn't done
        if (ctx.fn.destroy) {
          ctx.fn.destroy({ worker: c, error: e });
        }
        if (ctx.iterator.throw) {
          ctx.iterator.throw(e);
        }
        throw e;
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
