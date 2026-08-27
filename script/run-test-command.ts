#!/usr/bin/env bun

import os from "node:os"
import {
  createTestSandboxRoot,
  removeTestSandboxRoot,
  TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY,
  TEST_SANDBOX_ROOT_ENVIRONMENT_KEY,
} from "./test-sandbox"
import { runSupervisedTestProcess } from "./test-process"

const COMMAND_SEPARATOR = "--"

const args = Bun.argv.slice(2)
const command = args[0] === COMMAND_SEPARATOR ? args.slice(1) : args
if (command.length === 0) {
  throw new Error("Usage: bun ./script/run-test-command.ts -- <command> [...args]")
}
const root = createTestSandboxRoot()
const originalHome = os.homedir()
let cleaned = false

function cleanup(): void {
  if (cleaned) return
  cleaned = true
  removeTestSandboxRoot(root)
}

try {
  const result = await runSupervisedTestProcess({
    command,
    env: {
      ...process.env,
      [TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY]: originalHome,
      [TEST_SANDBOX_ROOT_ENVIRONMENT_KEY]: root,
    },
  })
  process.exitCode = result.exitCode
} finally {
  cleanup()
}
