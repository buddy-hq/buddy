import { describe, expect, test } from "bun:test"
import path from "node:path"

const ROOT_DIRECTORY = path.resolve(import.meta.dir, "..")

async function workflowSource(filename: string): Promise<string> {
  return await Bun.file(path.join(ROOT_DIRECTORY, ".github", "workflows", filename)).text()
}

function jobSource(source: string, jobName: string): string {
  const marker = `  ${jobName}:\n`
  const start = source.indexOf(marker)
  if (start < 0) {
    throw new Error(`Workflow job not found: ${jobName}`)
  }

  const remaining = source.slice(start + marker.length)
  const nextJobOffset = remaining.search(/^  [a-z0-9-]+:\n/m)
  return nextJobOffset < 0
    ? source.slice(start)
    : source.slice(start, start + marker.length + nextJobOffset)
}

describe("release skill artifacts", () => {
  test("gates desktop publication on the same-SHA skill artifact workflow", async () => {
    const source = await workflowSource("publish-shared.yml")
    const artifactJob = jobSource(source, "publish-skill-artifacts")
    const finalJob = jobSource(source, "finalize-and-publish")

    expect(artifactJob).toContain("uses: ./.github/workflows/publish-skill-artifacts.yml")
    expect(artifactJob).toContain("publish: ${{ !inputs.dry_run }}")
    expect(artifactJob).toContain("release_source_sha: ${{ github.sha }}")
    expect(artifactJob).toContain(
      "release_source_mode: ${{ inputs.resume_draft && 'verify' || 'record' }}",
    )
    expect(artifactJob).toContain("secrets: inherit")
    expect(finalJob).toContain("needs.publish-skill-artifacts.result == 'success'")
    expect(finalJob).toContain("- publish-skill-artifacts")
  })

  test("keeps manual and release-driven artifact builds on the triggering SHA", async () => {
    const source = await workflowSource("publish-skill-artifacts.yml")

    expect(source).toContain("workflow_call:")
    expect(source).toContain("BUDDY_SKILL_SIGNING_PRIVATE_KEY:")
    expect(source).toContain("BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD:")
    expect(source).toContain("ref: ${{ github.sha }}")
    expect(source).toContain("if: ${{ inputs.release_source_mode != '' }}")
    expect(source).toContain("run: bun ./script/release-source-metadata.ts")
    expect(source).toContain('if [[ "$INPUT_PUBLISH" == "true" ]]')
    expect(source).not.toContain("actions/upload-artifact")
    expect(source).not.toContain("actions/download-artifact")
  })
})
