#!/usr/bin/env bun

import { runSandboxedTestProcess } from "./sandboxed-test-process"

const COMMAND_SEPARATOR = "--"

const args = Bun.argv.slice(2)
const command = args[0] === COMMAND_SEPARATOR ? args.slice(1) : args
if (command.length === 0) {
  throw new Error("Usage: bun ./script/run-test-command.ts -- <command> [...args]")
}
const result = await runSandboxedTestProcess({ command })
process.exitCode = result.exitCode
