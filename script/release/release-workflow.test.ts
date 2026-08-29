import { describe, expect, test } from "bun:test"
import path from "node:path"
import { RELEASE_GATE_COMMAND_PLAN } from "../release-required-gates.ts"

const ROOT_DIRECTORY = path.resolve(import.meta.dir, "../..")

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

function namedWorkflowStepIndex(job: JsonObject, name: string): number {
  const index = workflowSteps(job).findIndex((candidate) => candidate.name === name)
  if (index < 0) throw new Error(`Workflow step ${name} is missing`)
  return index
}

describe("release workflow", () => {
  test("accepts only an explicit version and pinned green main source", async () => {
    const document = await workflowDocument("publish.yml")
    const triggers = objectValue(document.on, "publish workflow triggers")
    const dispatch = objectValue(triggers.workflow_dispatch, "workflow_dispatch")
    const inputs = objectValue(dispatch.inputs, "workflow_dispatch inputs")
    const sourceSha = objectValue(inputs.source_sha, "source_sha input")
    const publishJob = workflowJob(document, "publish")
    const publishSecrets = objectValue(publishJob.secrets, "publish job secrets")
    const permissions = objectValue(document.permissions, "publish workflow permissions")

    expect(Object.keys(triggers)).toEqual(["workflow_dispatch"])
    expect(sourceSha.required).toBe(true)
    expect(permissions).toEqual({ actions: "read", checks: "read", contents: "write" })
    expect(stringValue(publishJob.uses, "publish job reusable workflow")).toBe(
      "./.github/workflows/publish-shared.yml",
    )
    expect(
      stringValue(
        objectValue(publishJob.with, "publish job inputs").source_sha,
        "publish source SHA",
      ),
    ).toBe("${{ inputs.source_sha }}")
    expect(Object.keys(publishSecrets).toSorted()).toEqual([
      "BUDDY_RELEASE_TOKEN",
      "BUDDY_SKILLS_REPOSITORY_TOKEN",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD",
      "TAURI_SIGNING_PRIVATE_KEY",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      "TAURI_SIGNING_PRIVATE_KEY_PATH",
    ])
  })

  test("declares every release credential before starting runners", async () => {
    const document = await workflowDocument("publish-shared.yml")
    const triggers = objectValue(document.on, "publish-shared workflow triggers")
    const workflowCall = objectValue(triggers.workflow_call, "publish-shared workflow_call")
    const secrets = objectValue(workflowCall.secrets, "publish-shared workflow_call secrets")

    for (const secretName of [
      "BUDDY_RELEASE_TOKEN",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD",
      "BUDDY_SKILLS_REPOSITORY_TOKEN",
      "TAURI_SIGNING_PRIVATE_KEY",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ]) {
      expect(objectValue(secrets[secretName], secretName).required).toBe(true)
    }
  })

  test("fails before expensive builders and preserves completed target checkpoints", async () => {
    const document = await workflowDocument("publish-shared.yml")
    const preflightJob = workflowJob(document, "preflight")
    const prepareMathJob = workflowJob(document, "prepare-math")
    const validationJobs = ["validate-skills", "validate-updater", "validate-backend"].map((name) =>
      workflowJob(document, name),
    )
    const workflowEnvironment = objectValue(document.env, "publish-shared environment")

    for (const validationJob of validationJobs) {
      expect(validationJob.needs).toBe("preflight")
      expect(stringValue(validationJob.if, "validation job if")).toBe(
        "needs.preflight.outputs.frozen != 'true'",
      )
    }
    expect(workflowEnvironment.RUNNER_MACOS_ARM64).toBe("macos-26")
    expect(workflowEnvironment.RUNNER_MACOS_X64).toBe("macos-26-intel")
    expect(workflowEnvironment.RUNNER_WINDOWS_X64).toBe("windows-2025-vs2026")
    expect(
      stringValue(namedWorkflowStep(preflightJob, "Resolve recoverable build plan").run, "plan"),
    ).toContain("build-plan.ts non-math")
    expect(
      objectValue(
        namedWorkflowStep(preflightJob, "Resolve recoverable build plan").env,
        "preflight build plan environment",
      ).BUDDY_RELEASE_SOURCE_REPOSITORY,
    ).toBe("${{ github.repository }}")
    expect(prepareMathJob.needs).toBe("preflight")
    expect(stringValue(prepareMathJob.if, "prepare-math.if")).toBe(
      "needs.preflight.outputs.frozen != 'true'",
    )
    expect(
      workflowSteps(preflightJob).some((step) =>
        step.run === undefined
          ? false
          : stringValue(step.run, "preflight step run").includes("reuse-advanced-math.ts"),
      ),
    ).toBe(false)
    expect(
      stringValue(
        namedWorkflowStep(prepareMathJob, "Reuse unchanged advanced math runtimes").run,
        "math reuse",
      ),
    ).toContain("reuse-advanced-math.ts")
    expect(
      stringValue(
        namedWorkflowStep(prepareMathJob, "Resolve recoverable advanced math plan").run,
        "math plan",
      ),
    ).toContain("build-plan.ts advanced-math")
    for (const [jobName, checkpointStepName, condition, needs] of [
      [
        "build-electron",
        "Upload and checkpoint target",
        "needs.preflight.outputs.any_electron == 'true'",
        ["preflight", "validate-skills", "validate-updater", "validate-backend"],
      ],
      [
        "build-advanced-math",
        "Upload and checkpoint native runtime",
        "needs.prepare-math.outputs.any_math == 'true'",
        ["preflight", "prepare-math", "validate-skills", "validate-updater", "validate-backend"],
      ],
      [
        "build-standards",
        "Upload and checkpoint standards",
        "needs.preflight.outputs.build_standards == 'true'",
        ["preflight", "validate-skills", "validate-updater", "validate-backend"],
      ],
    ] as const) {
      const job = workflowJob(document, jobName)
      expect(arrayValue(job.needs, `${jobName}.needs`)).toEqual([...needs])
      expect(stringValue(job.if, `${jobName}.if`)).toBe(condition)
      expect(
        stringValue(
          namedWorkflowStep(job, checkpointStepName).run,
          `${jobName} checkpoint command`,
        ),
      ).toContain("checkpoint.ts record")
    }
    const electronJob = workflowJob(document, "build-electron")
    expect(electronJob["timeout-minutes"]).toBe(45)
    expect(
      objectValue(
        objectValue(electronJob.defaults, "electron defaults").run,
        "electron run defaults",
      ).shell,
    ).toBe("bash")

    expect(objectValue(electronJob.strategy, "electron strategy")["fail-fast"]).toBe(false)
    expect(
      objectValue(workflowJob(document, "build-advanced-math").strategy, "advanced math strategy")[
        "fail-fast"
      ],
    ).toBe(false)
    for (const job of workflowJobs(document)) {
      if (!Array.isArray(job.steps)) continue
      for (const step of workflowSteps(job)) {
        if (step.run !== undefined) {
          expect(stringValue(step.run, "release workflow run step")).not.toContain("${{ matrix.")
        }
      }
    }
  })

  test("freezes verified bytes before publishing and verifies the public Preview afterward", async () => {
    const document = await workflowDocument("publish-shared.yml")
    const finalJob = workflowJob(document, "finalize-and-publish")
    const draftVerification = namedWorkflowStepIndex(
      finalJob,
      "Deep-verify downloaded draft assets",
    )
    const freeze = namedWorkflowStepIndex(finalJob, "Freeze verified release bytes")
    const sourceTag = namedWorkflowStepIndex(finalJob, "Create or verify source provenance tag")
    const publish = namedWorkflowStepIndex(finalJob, "Publish Preview")
    const publicVerification = namedWorkflowStepIndex(finalJob, "Verify published Preview bytes")

    expect(draftVerification).toBeLessThan(freeze)
    expect(freeze).toBeLessThan(sourceTag)
    expect(sourceTag).toBeLessThan(publish)
    expect(publish).toBeLessThan(publicVerification)
    const publishEnvironment = objectValue(
      namedWorkflowStep(finalJob, "Publish Preview").env,
      "publish step environment",
    )
    const sourceTagEnvironment = objectValue(
      namedWorkflowStep(finalJob, "Create or verify source provenance tag").env,
      "source tag step environment",
    )
    expect(stringValue(publishEnvironment.BUDDY_RELEASE_PLAN_DIGEST, "publish plan digest")).toBe(
      "${{ needs.preflight.outputs.plan_digest }}",
    )
    expect(sourceTagEnvironment.GH_TOKEN).toBe("${{ github.token }}")
    expect(publishEnvironment.GH_TOKEN).toBe("${{ secrets.BUDDY_RELEASE_TOKEN }}")
    const publicVerifyEnvironment = objectValue(
      namedWorkflowStep(finalJob, "Verify published Preview bytes").env,
      "public verification environment",
    )
    expect(publicVerifyEnvironment.BUDDY_SOURCE_GH_TOKEN).toBe("${{ github.token }}")
    expect(publicVerifyEnvironment.GH_TOKEN).toBe("${{ secrets.BUDDY_RELEASE_TOKEN }}")
    for (const verificationName of [
      "Deep-verify downloaded draft assets",
      "Verify published Preview bytes",
    ]) {
      const verification = namedWorkflowStep(finalJob, verificationName)
      expect(stringValue(verification.run, `${verificationName}.run`)).not.toContain("${{")
      expect(objectValue(verification.env, `${verificationName}.env`).SOURCE_SHA).toBe(
        "${{ inputs.source_sha }}",
      )
    }
    const finalCondition = stringValue(finalJob.if, "finalize-and-publish.if")
    expect(finalCondition).toContain("always()")
    expect(finalCondition).toContain(
      "needs.preflight.outputs.frozen == 'true' && needs.prepare-math.result == 'skipped'",
    )
    expect(finalCondition).toContain(
      "needs.preflight.outputs.frozen == 'true' && needs.validate-skills.result == 'skipped'",
    )
  })
})

describe("release skill artifacts", () => {
  test("publishes signed skills only after the pinned Preview succeeds", async () => {
    const document = await workflowDocument("publish-shared.yml")
    const validateJob = workflowJob(document, "validate-skills")
    const artifactJob = workflowJob(document, "publish-skill-artifacts")
    const validationStep = namedWorkflowStep(validateJob, "Build signed skill artifacts")

    expect(stringValue(validationStep.run, "signed skill validation step run")).toBe(
      "bun run --cwd packages/buddy skill:artifacts:build",
    )
    const artifactInputs = objectValue(artifactJob.with, "publish-skill-artifacts.with")
    const artifactSecrets = objectValue(artifactJob.secrets, "publish-skill-artifacts.secrets")
    expect(stringValue(artifactJob.uses, "publish-skill-artifacts.uses")).toBe(
      "./.github/workflows/publish-skill-artifacts.yml",
    )
    expect(Object.keys(artifactSecrets).toSorted()).toEqual([
      "BUDDY_SKILLS_REPOSITORY_TOKEN",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD",
    ])
    expect(artifactInputs.prevalidated).toBe(true)
    expect(stringValue(artifactInputs.publish, "publish-skill-artifacts.with.publish")).toBe(
      "${{ !inputs.dry_run }}",
    )
    expect(
      stringValue(
        artifactInputs.release_source_sha,
        "publish-skill-artifacts.with.release_source_sha",
      ),
    ).toBe("${{ inputs.source_sha }}")
    expect(arrayValue(artifactJob.needs, "publish-skill-artifacts.needs")).toEqual([
      "preflight",
      "finalize-and-publish",
    ])
    expect(stringValue(artifactJob.if, "publish-skill-artifacts.if")).toContain(
      "needs.finalize-and-publish.result == 'success'",
    )
  })

  test("keeps manual and release-driven artifact builds on the triggering SHA", async () => {
    const document = await workflowDocument("publish-skill-artifacts.yml")
    const workflowTriggers = objectValue(document.on, "workflow triggers")
    const workflowCall = objectValue(workflowTriggers.workflow_call, "on.workflow_call")
    const workflowCallSecrets = objectValue(workflowCall.secrets, "on.workflow_call.secrets")
    const publishJob = workflowJob(document, "publish")
    const concurrency = objectValue(document.concurrency, "skill artifact concurrency")
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
    expect(concurrency.group).toBe("publish-skill-artifacts")
    expect(concurrency["cancel-in-progress"]).toBe(false)

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
    expect(stringValue(checkoutWith.ref, "actions/checkout@v6.with.ref")).toBe(
      "${{ inputs.release_source_sha || github.sha }}",
    )
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
      { command: "bun", args: ["fmt:check"] },
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
    const ciGateCommand = RELEASE_GATE_COMMAND_PLAN.map((gate) =>
      [gate.command, ...gate.args].join(" "),
    ).join(" && ")

    expect(
      stringValue(
        scripts["release:validate-skill-artifacts"],
        "release:validate-skill-artifacts script",
      ),
    ).toBe(ciGateCommand)
  })
})
