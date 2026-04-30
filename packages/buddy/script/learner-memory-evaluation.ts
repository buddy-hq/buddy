import path from "node:path"
import { runLearnerMemoryEvaluation } from "../src/learning/learner-memory"

const OPTION_DIRECTORY = "--directory"
const OPTION_DETERMINISTIC = "--deterministic"

function readDirectory(args: readonly string[]): string {
  const index = args.indexOf(OPTION_DIRECTORY)
  const explicit = index >= 0 ? args[index + 1] : undefined
  return explicit ? path.resolve(explicit) : process.cwd()
}

const directory = readDirectory(process.argv.slice(2))
const extractionMode = process.argv.includes(OPTION_DETERMINISTIC) ? "deterministic" : "model"
const report = await runLearnerMemoryEvaluation({ directory, extractionMode })

console.log(JSON.stringify(report, null, 2))
process.exit(report.failures.length === 0 ? 0 : 1)
