// In-process coalescing of tasks by key.
//
// While a task for a key is running, further requests for that key do not run concurrently:
// they mark the key dirty and exactly one follow-up run starts once the current one settles
// (with the most recently requested task). Bursts (e.g. pipeline events pending → running →
// success) thus cost at most two runs, and the last run always starts after the last request,
// so it observes the newest state.
//
// `run(key, task)` resolves or rejects with the result of the run that covers the request: the
// current run for the first caller, the follow-up run for every caller that arrived meanwhile.

const noop = () => {};

const createCoalescer = () => {
  const entries = new Map();

  const execute = (key, entry, task) => {
    const promise = Promise.resolve().then(task);
    entry.running = promise; // eslint-disable-line no-param-reassign

    promise
      .finally(() => {
        if (entries.get(key) === entry && entry.running === promise && !entry.next) {
          entries.delete(key);
        }
      })
      .catch(noop);

    return promise;
  };

  const run = (key, task) => {
    let entry = entries.get(key);

    if (!entry) {
      entry = {
        running: null,
        next: null,
      };

      entries.set(key, entry);

      return execute(key, entry, task);
    }

    if (entry.next) {
      // Already dirty: the pending follow-up run picks the latest task
      entry.next.task = task;

      return entry.next.promise;
    }

    const next = {
      task,
    };

    next.promise = entry.running.catch(noop).then(() => {
      entry.next = null;

      return execute(key, entry, next.task);
    });

    entry.next = next;

    return next.promise;
  };

  return {
    run,
    isRunning: (key) => entries.has(key),
  };
};

module.exports = {
  createCoalescer,
};
