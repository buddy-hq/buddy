import { afterAll } from "bun:test"
import {
  configureTestSandbox,
  createTestSandboxRoot,
  removeTestSandboxRoot,
  TEST_SANDBOX_ROOT_ENVIRONMENT_KEY,
  type TestSandbox,
} from "./test-sandbox"

const INTERRUPT_EXIT_CODE = 130
const TERMINATION_EXIT_CODE = 143

const configuredRoot = process.env[TEST_SANDBOX_ROOT_ENVIRONMENT_KEY]?.trim()
const ownsRoot = !configuredRoot
const root = configuredRoot || createTestSandboxRoot()
const sandbox = configureTestSandbox(root)

let cleaned = false

export function cleanupTestSandbox(): void {
  if (cleaned || !ownsRoot) return
  cleaned = true
  removeTestSandboxRoot(root)
}

process.once("exit", cleanupTestSandbox)
process.once("SIGINT", () => {
  cleanupTestSandbox()
  process.exit(INTERRUPT_EXIT_CODE)
})
process.once("SIGTERM", () => {
  cleanupTestSandbox()
  process.exit(TERMINATION_EXIT_CODE)
})
afterAll(cleanupTestSandbox)

export const TEST_SANDBOX: TestSandbox = sandbox
