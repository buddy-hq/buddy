import path from "node:path"
import { withFileLock } from "../../../storage/file-lock"
import { LearnerMemoryPath } from "./paths"

const LEARNER_MEMORY_MUTATION_LOCK_FILE = ".mutation.lock"

export async function withLearnerMemoryMutationLock<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  return withFileLock(
    path.join(LearnerMemoryPath.root(directory), LEARNER_MEMORY_MUTATION_LOCK_FILE),
    task,
  )
}
