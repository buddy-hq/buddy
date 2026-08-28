import { describe, expect, test } from "bun:test"
import path from "node:path"
import { RELEASE_GATE_COMMAND_PLAN } from "./release-required-gates.ts"

const ROOT_DIRECTORY = path.resolve(import.meta.dir, "..")

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
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`)
  }
  return value
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This helper is the strict narrowing boundary for parsed YAML values.
function stringValue(value: unknown, label: string): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Runtime narrowing is required for the parsed YAML boundary.
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string`)
  }
  return value
}

async function workflowDocument(filename: string): Promise<JsonObject> {
  const source = await Bun.file(path.join(ROOT_DIRECTORY, ".github", "workflows", filename)).text()
  return objectValue(Bun.YAML.parse(source), `workflow ${filename}`)
}

function workflowJob(document: JsonObject, name: string): JsonObject {
  const jobs = objectValue(document.jobs, "workflow jobs")
  return objectValue(jobs[name], `workflow job ${name}`)
}

function workflowJobs(document: JsonObject): JsonObject[] {
  const jobs = objectValue(document.jobs, "workflow jobs")
  return Object.entries(jobs).map(([name, job]) => objectValue(job, `workflow job ${name}`))
}

function workflowSteps(job: JsonObject): JsonObject[] {
  return arrayValue(job.steps, "workflow job steps").map((step, index) =>
    objectValue(step, `workflow step ${index}`),
  )
}

function namedWorkflowStep(job: JsonObject, name: string): JsonObject {
  const step = workflowSteps(job).find((candidate) => candidate.name === name)
  return objectValue(step, `workflow step ${name}`)
}

describe("release skill artifacts", () => {
  test("gates desktop publication on the same-SHA skill artifact workflow", async () => {
    const document = await workflowDocument("publish-shared.yml")
    const preflightJob = workflowJob(document, "preflight")
    const artifactJob = workflowJob(document, "publish-skill-artifacts")
    const finalJob = workflowJob(document, "finalize-and-publish")
    const preflightValidationStep = namedWorkflowStep(
      preflightJob,
      "Validate repository and signed skill artifacts before platform builds",
    )

    expect(stringValue(preflightValidationStep.run, "preflight validation step run")).toBe(
      "bun run release:validate-skill-artifacts",
    )
    for (const platformJobName of [
      "build-electron-macos-arm64",
      "build-electron-macos-x64",
      "build-electron-windows-x64",
      "build-advanced-math-macos-arm64",
      "build-advanced-math-macos-x64",
    ]) {
      expect(
        arrayValue(workflowJob(document, platformJobName).needs, `${platformJobName}.needs`),
      ).toContain("preflight")
    }
    const artifactInputs = objectValue(artifactJob.with, "publish-skill-artifacts.with")
    expect(stringValue(artifactJob.uses, "publish-skill-artifacts.uses")).toBe(
      "./.github/workflows/publish-skill-artifacts.yml",
    )
    expect(artifactInputs.prevalidated).toBe(true)
    expect(stringValue(artifactInputs.publish, "publish-skill-artifacts.with.publish")).toBe(
      "${{ !inputs.dry_run }}",
    )
    expect(
      stringValue(
        artifactInputs.release_source_sha,
        "publish-skill-artifacts.with.release_source_sha",
      ),
    ).toBe("${{ github.sha }}")
    expect(
      stringValue(
        artifactInputs.release_source_mode,
        "publish-skill-artifacts.with.release_source_mode",
      ),
    ).toBe("${{ inputs.resume_draft && 'verify' || 'record' }}")
    expect(stringValue(artifactJob.secrets, "publish-skill-artifacts.secrets")).toBe("inherit")
    expect(arrayValue(finalJob.needs, "finalize-and-publish.needs")).toContain(
      "publish-skill-artifacts",
    )
    expect(stringValue(finalJob.if, "finalize-and-publish.if")).toContain(
      "needs.publish-skill-artifacts.result == 'success'",
    )
  })

  test("keeps manual and release-driven artifact builds on the triggering SHA", async () => {
    const document = await workflowDocument("publish-skill-artifacts.yml")
    const workflowTriggers = objectValue(document.on, "workflow triggers")
    const workflowCall = objectValue(workflowTriggers.workflow_call, "on.workflow_call")
    const workflowCallSecrets = objectValue(workflowCall.secrets, "on.workflow_call.secrets")
    const publishJob = workflowJob(document, "publish")
    const publishSteps = workflowSteps(publishJob)
    const checkoutStep = objectValue(
      publishSteps.find((step) => step.uses === "actions/checkout@v6"),
      "actions/checkout@v6 step",
    )
    const publishStep = namedWorkflowStep(
      publishJob,
      "Build and optionally publish signed skill artifacts",
    )
    const releaseSourceStep = namedWorkflowStep(
      publishJob,
      "Record or verify desktop release source",
    )
    const validationStep = namedWorkflowStep(
      publishJob,
      "Validate repository and signed skill artifacts",
    )

    expect(
      objectValue(workflowCallSecrets.BUDDY_SKILL_SIGNING_PRIVATE_KEY, "signing key").required,
    ).toBe(true)
    expect(
      objectValue(
        workflowCallSecrets.BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD,
        "signing key password",
      ).required,
    ).toBe(true)
    expect(
      objectValue(workflowCallSecrets.BUDDY_SKILLS_REPOSITORY_TOKEN, "repository token").required,
    ).toBe(false)
    const checkoutWith = objectValue(checkoutStep.with, "actions/checkout@v6.with")
    expect(stringValue(checkoutWith.ref, "actions/checkout@v6.with.ref")).toBe("${{ github.sha }}")
    expect(stringValue(releaseSourceStep.if, "release source step if")).toBe(
      "${{ inputs.release_source_mode != '' }}",
    )
    expect(stringValue(releaseSourceStep.run, "release source step run")).toBe(
      "bun ./script/release-source-metadata.ts",
    )
    expect(stringValue(validationStep.if, "validation step if")).toBe("${{ !inputs.prevalidated }}")
    expect(stringValue(validationStep.run, "validation step run")).toBe(
      "bun run release:validate-skill-artifacts",
    )
    const publishEnvironment = objectValue(publishStep.env, "publish step env")
    expect(stringValue(publishStep.run, "publish step run")).toContain(
      'if [[ "$INPUT_PUBLISH" == "true" ]]',
    )
    expect(stringValue(publishStep.run, "publish step run")).toContain(
      "bun ./script/publish-skill-artifacts.ts",
    )
    expect(
      stringValue(
        publishEnvironment.BUDDY_SKILLS_REPOSITORY_TOKEN,
        "publish step repository token",
      ),
    ).toBe("${{ secrets.BUDDY_SKILLS_REPOSITORY_TOKEN }}")
    expect(
      workflowJobs(document).some((job) =>
        workflowSteps(job).some(
          (step) =>
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Workflow action references are optional YAML fields.
            typeof step.uses === "string" &&
            (step.uses.startsWith("actions/upload-artifact") ||
              step.uses.startsWith("actions/download-artifact")),
        ),
      ),
    ).toBe(false)
  })

  test("keeps local cut-release and CI artifact gates aligned", async () => {
    expect(RELEASE_GATE_COMMAND_PLAN).toEqual([
      { command: "bun", args: ["run", "sdk:generate"] },
      { command: "bun", args: ["fmt"] },
      { command: "bun", args: ["lint"] },
      { command: "bun", args: ["typecheck"] },
      {
        command: "bun",
        args: ["run", "--cwd", "packages/buddy", "test:release-skill-artifacts"],
      },
      {
        command: "bun",
        args: ["run", "--cwd", "packages/buddy", "skill:artifacts:build"],
      },
    ])

    const packageManifest = objectValue(
      await Bun.file(path.join(ROOT_DIRECTORY, "package.json")).json(),
      "package manifest",
    )
    const scripts = objectValue(packageManifest.scripts, "package scripts")
    const ciGateCommand = RELEASE_GATE_COMMAND_PLAN.filter(
      (gate) => !(gate.command === "bun" && gate.args.length === 1 && gate.args[0] === "fmt"),
    )
      .map((gate) => [gate.command, ...gate.args].join(" "))
      .join(" && ")

    expect(
      stringValue(
        scripts["release:validate-skill-artifacts"],
        "release:validate-skill-artifacts script",
      ),
    ).toBe(ciGateCommand)
  })
})
