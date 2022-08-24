import { Task } from "./Task.mjs";

export async function createLoop(concurrency, concurrent, pause) {
  for (let i = 0; i < concurrency; i++) {
    new Task(concurrent);
  }
  concurrent.log(`Awaiting ${concurrent.jobs.length} jobs to finish`);
  while (!concurrent.done) {
    await Promise.all([
      ...concurrent.oldTasks,
      ...concurrent.jobs,
    ].map(({ promise }) => promise));
    concurrent.oldTasks = []; // all old tasks have been awaited -> free memory
    if (!concurrent.done) {
      await pause();
    }
  }
  concurrent.log('Jobs finished');
  return concurrent.results;
}
