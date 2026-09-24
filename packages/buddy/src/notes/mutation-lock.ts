const mutationTails = new Map<string, Promise<void>>()

/** Serializes changes that can move or rewrite files in the same Notes library. */
export async function withNotesMutationLock<T>(root: string, task: () => Promise<T>): Promise<T> {
  const previous = mutationTails.get(root) ?? Promise.resolve()
  const run = previous.then(task, task)
  const tail = run.then(
    () => undefined,
    () => undefined,
  )
  mutationTails.set(root, tail)
  try {
    return await run
  } finally {
    if (mutationTails.get(root) === tail) mutationTails.delete(root)
  }
}
