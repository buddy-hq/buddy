/** Serialize all work, while allowing the queue to continue after a rejection. */
export function createSerialRunner() {
  let queue: Promise<unknown> = Promise.resolve()

  return {
    runExclusive: <TValue>(run: () => Promise<TValue>): Promise<TValue> => {
      const task = queue.then(run, run)
      queue = task.then(
        () => undefined,
        () => undefined,
      )
      return task
    },
  }
}
