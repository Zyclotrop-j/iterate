import { Task } from "./Task.js";
import type { ConcurrentContext } from "./ProcessConcurrently.js";

export async function createLoop<Item, Common, Applied extends any[], Result>(
  concurrency: number,
  concurrent: ConcurrentContext<Item, Common, Applied, Result>,
  pause: () => Promise<void>
): Promise<Result[]> {
  const safeConcurrency = Math.min(concurrency, Number.MAX_SAFE_INTEGER);
  for (let i = 0; i < safeConcurrency; i++) {
    new (Task as unknown as new (ctx: ConcurrentContext<Item, Common, Applied, Result>) => void)(concurrent);
    await Promise.resolve();
    if(concurrent.done) break;
  }
  concurrent.log(`Awaiting ${concurrent.jobs.length} jobs to finish`);
  while (!concurrent.done) {
    await Promise.all(
      [...concurrent.oldTasks, ...concurrent.jobs].map(({ promise }) => promise)
    );
    concurrent.oldTasks = []; // all old tasks have been awaited -> free memory
    if (!concurrent.done) {
      await pause();
    }
  }
  concurrent.log('Jobs finished');
  return concurrent.results;
}
