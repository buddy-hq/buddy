import { describe, expect, test } from "bun:test"
import path from "node:path"

const ROOT_DIRECTORY = path.resolve(import.meta.dir, "..")
const WORKFLOW_DIRECTORY = path.join(ROOT_DIRECTORY, ".github", "workflows")

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Parsed YAML entries are narrowed field-by-field below.
type JsonObject = Record<string, unknown>

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper is the strict narrowing boundary for parsed YAML values.
function isJsonObject(value: unknown): value is JsonObject {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Runtime narrowing is required for the parsed YAML boundary.
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper is the strict narrowing boundary for parsed YAML values.
function objectValue(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error(`Expected ${label} to be an object`)
  }
  return value
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper is the strict narrowing boundary for parsed YAML values.
function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Expected ${label} to be an array`)
  return value
}

async function ciWorkflow(): Promise<JsonObject> {
  const source = await Bun.file(path.join(WORKFLOW_DIRECTORY, "ci.yml")).text()
  return objectValue(Bun.YAML.parse(source), "CI workflow")
}

function workflowJobs(document: JsonObject): JsonObject {
  return objectValue(document.jobs, "CI workflow jobs")
}

function workflowJob(jobs: JsonObject, name: string): JsonObject {
  return objectValue(jobs[name], `CI workflow job ${name}`)
}

function workflowSteps(job: JsonObject): JsonObject[] {
  return arrayValue(job.steps, "CI workflow job steps").map((step, index) =>
    objectValue(step, `CI workflow step ${index}`),
  )
}

describe("CI workflow", () => {
  test("runs static analysis, tests, and the vendor guard in parallel behind one final gate", async () => {
    const document = await ciWorkflow()
    const jobs = workflowJobs(document)
    const staticJob = workflowJob(jobs, "static")
    const testsJob = workflowJob(jobs, "tests")
    const vendorGuardJob = workflowJob(jobs, "vendor_guard")
    const checkJob = workflowJob(jobs, "check")

    expect(Object.keys(jobs)).toEqual(["static", "tests", "vendor_guard", "check"])
    expect(staticJob.needs).toBeUndefined()
    expect(testsJob.needs).toBeUndefined()
    expect(vendorGuardJob.needs).toBeUndefined()
    expect(vendorGuardJob.name).toBe("vendor-guard")
    expect(checkJob.name).toBe("Check")
    expect(checkJob.if).toBe("${{ always() }}")
    expect(arrayValue(checkJob.needs, "check.needs")).toEqual([
      "static",
      "tests",
      "vendor_guard",
    ])
  })

  test("keeps the PR workflow read-only and avoids the oversized dependency cache", async () => {
    const document = await ciWorkflow()
    const triggers = objectValue(document.on, "CI workflow triggers")
    const push = objectValue(triggers.push, "CI push trigger")
    const permissions = objectValue(document.permissions, "CI permissions")
    const environment = objectValue(document.env, "CI environment")
    const jobs = workflowJobs(document)
    const actionReferences = Object.values(jobs).flatMap((job, index) =>
      workflowSteps(objectValue(job, `CI workflow job ${index}`)).flatMap((step) =>
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Workflow action references are optional YAML fields.
        typeof step.uses === "string" ? [step.uses] : [],
      ),
    )

    expect(triggers).toHaveProperty("pull_request")
    expect(arrayValue(push.branches, "CI push branches")).toEqual(["main"])
    expect(permissions.contents).toBe("read")
    expect(environment.BUDDY_TEST_CONCURRENCY).toBeUndefined()
    expect(actionReferences.some((reference) => reference.startsWith("actions/cache@"))).toBe(false)
    expect(await Bun.file(path.join(WORKFLOW_DIRECTORY, "vendor-guard.yml")).exists()).toBe(false)
  })

  test("shards backend and web tests across dedicated runners with matrix fail-fast", async () => {
    const document = await ciWorkflow()
    const testsJob = workflowJob(workflowJobs(document), "tests")
    const strategy = objectValue(testsJob.strategy, "tests strategy")
    const matrix = objectValue(strategy.matrix, "tests matrix")
    const jobEnvironment = objectValue(testsJob.env, "tests environment")
    const shards = arrayValue(matrix.include, "tests matrix includes").map((entry, index) =>
      objectValue(entry, `tests matrix entry ${index}`),
    )

    expect(strategy["fail-fast"]).toBe(true)
    expect(shards.map((shard) => shard.name)).toEqual([
      "backend 1/2",
      "backend 2/2",
      "web 1/2",
      "web 2/2",
      "remaining",
    ])
    expect(shards.filter((shard) => shard.owners === "backend")).toHaveLength(2)
    expect(shards.filter((shard) => shard.owners === "web")).toHaveLength(2)
    expect(shards.filter((shard) => shard.install_ripgrep === true)).toHaveLength(2)
    expect(shards.filter((shard) => shard.prepare_generated === true)).toHaveLength(2)
    expect(jobEnvironment.BUDDY_TEST_CONCURRENCY).toBe("${{ matrix.test_concurrency }}")
    expect(jobEnvironment.BUDDY_TEST_OWNERS).toBe("${{ matrix.owners }}")
    expect(jobEnvironment.BUDDY_TEST_SHARD_COUNT).toBe("${{ matrix.shard_count }}")
    expect(jobEnvironment.BUDDY_TEST_SHARD_INDEX).toBe("${{ matrix.shard_index }}")
  })

  test("prepares generated OpenAPI SDK and web route tree once before isolated test processes", async () => {
    const packageJson = objectValue(
      await Bun.file(path.join(ROOT_DIRECTORY, "package.json")).json(),
      "root package.json",
    )
    const scripts = objectValue(packageJson.scripts, "root package.json scripts")

    expect(scripts["test:prepare"]).toBe(
      "bun run sdk:generate && bun run --cwd packages/web prepare:web:typecheck",
    )
    expect(scripts.test).toBe("bun run test:prepare && bun ./script/run-tests.ts")
    expect(scripts["test:baseline"]).toBe(
      "bun run test:prepare && bun ./script/run-tests.ts --per-file",
    )
  })
})
