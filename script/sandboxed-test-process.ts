import os from "node:os"
import {
  createTestSandboxRoot,
  removeTestSandboxRoot,
  TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY,
  TEST_SANDBOX_ROOT_ENVIRONMENT_KEY,
} from "./test-sandbox"
import {
  runSupervisedTestProcess,
  type SupervisedTestProcessInput,
  type SupervisedTestProcessResult,
} from "./test-process"

export async function runSandboxedTestProcess(
  input: SupervisedTestProcessInput,
): Promise<SupervisedTestProcessResult> {
  const root = createTestSandboxRoot()
  const originalHome =
    input.env?.[TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY]?.trim() ||
    process.env[TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY]?.trim() ||
    os.homedir()

  try {
    return await runSupervisedTestProcess({
      ...input,
      env: {
        ...(input.env ?? process.env),
        [TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY]: originalHome,
        [TEST_SANDBOX_ROOT_ENVIRONMENT_KEY]: root,
      },
    })
  } finally {
    removeTestSandboxRoot(root)
  }
}
