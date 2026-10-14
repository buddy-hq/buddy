#!/usr/bin/env bun

import path from "node:path"
import { runSupervisedTestProcess } from "./test-process"
import { verifyTestTopology } from "./test-topology"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const ROOT_SCRIPT_OWNER_ID = "root-script"

const requestedFiles = Bun.argv.slice(2).filter((argument) => argument !== "--")

const testFiles = (await verifyTestTopology())
  .filter((testFile) => testFile.owner.id === ROOT_SCRIPT_OWNER_ID)
  .map((testFile) => testFile.path)
  .filter((file) => requestedFiles.length === 0 || requestedFiles.includes(file))

if (requestedFiles.some((file) => !testFiles.includes(file))) {
  throw new Error("Requested files must be owned root script tests")
}

if (testFiles.length === 0) {
  throw new Error("No root script tests found")
}

const result = await runSupervisedTestProcess({
  command: [process.execPath, "test", "--preload", "./script/test-preload.ts", ...testFiles],
  cwd: REPOSITORY_ROOT,
})

process.exitCode = result.exitCode
