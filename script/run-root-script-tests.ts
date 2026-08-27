#!/usr/bin/env bun

import path from "node:path"
import { runSupervisedTestProcess } from "./test-process"
import { verifyTestTopology } from "./test-topology"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const ROOT_SCRIPT_OWNER_ID = "root-script"

const testFiles = (await verifyTestTopology())
  .filter((testFile) => testFile.owner.id === ROOT_SCRIPT_OWNER_ID)
  .map((testFile) => testFile.path)

if (testFiles.length === 0) {
  throw new Error("No root script tests found")
}

const result = await runSupervisedTestProcess({
  command: [process.execPath, "test", "--preload", "./script/test-preload.ts", ...testFiles],
  cwd: REPOSITORY_ROOT,
})

process.exitCode = result.exitCode
