import { releaseTagDistribution } from "@buddy/script/release-stream"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  evaluatePlannedBetaPublication,
  evaluateSharedReleaseRepository,
  type SharedRepositoryGuardReport,
} from "./shared-repository-guard"
import {
  readSharedRelease,
  readSharedReleaseRepository,
  runReleaseGithubCommand,
  SharedReleaseGithubError,
  type ReleaseGithubCommand,
  type ReleaseGithubResult,
} from "./shared-repository-github"

async function publishValidatedBetaBody(
  input: { readonly repository: string; readonly tag: string; readonly body: string },
  command: ReleaseGithubCommand,
): Promise<ReleaseGithubResult<string>> {
  try {
    const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-beta-publication-"))
    try {
      const notesPath = path.join(directory, "notes.md")
      await writeFile(notesPath, input.body, "utf8")
      return await command([
        "release",
        "edit",
        input.tag,
        "--draft=false",
        "--prerelease",
        "--latest=false",
        "--notes-file",
        notesPath,
        "--repo",
        input.repository,
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  } catch (error) {
    return {
      ok: false,
      error: new SharedReleaseGithubError(
        "Publish validated Beta body",
        error instanceof Error ? error.message : String(error),
      ),
    }
  }
}

/** Publication either verifies safely or reports whether compensation succeeded. */
export type SharedBetaPublicationResult =
  | { readonly ok: true; readonly report: SharedRepositoryGuardReport }
  | {
      readonly ok: false
      readonly errors: readonly string[]
      readonly revertedToDraft: boolean
    }

/** Publish Beta only after simulation, then verify and immediately compensate on failure. */
export async function publishBetaToSharedRepository(
  input: { readonly repository: string; readonly tag: string },
  command: ReleaseGithubCommand = runReleaseGithubCommand,
): Promise<SharedBetaPublicationResult> {
  if (releaseTagDistribution(input.tag) !== "beta") {
    return {
      ok: false,
      errors: [`Beta publication requires a beta-vX.Y.Z tag: ${input.tag}`],
      revertedToDraft: false,
    }
  }
  const release = await readSharedRelease(input.repository, input.tag, command)
  if (!release.ok) return { ok: false, errors: [release.error.message], revertedToDraft: false }
  if (release.value.tagName !== input.tag) {
    return {
      ok: false,
      errors: [`Release tag mismatch: expected ${input.tag}, received ${release.value.tagName}`],
      revertedToDraft: false,
    }
  }
  const before = await readSharedReleaseRepository(input.repository, command)
  if (!before.ok) return { ok: false, errors: [before.error.message], revertedToDraft: false }
  const planned = evaluatePlannedBetaPublication(before.value, release.value)
  if (planned.errors.length > 0)
    return { ok: false, errors: planned.errors, revertedToDraft: false }

  const errors: string[] = []
  if (release.value.isDraft) {
    const published = await publishValidatedBetaBody(
      { ...input, body: release.value.body },
      command,
    )
    if (!published.ok) errors.push(published.error.message)
  }
  let report = planned
  if (errors.length === 0) {
    const afterRelease = await readSharedRelease(input.repository, input.tag, command)
    if (!afterRelease.ok) {
      errors.push(afterRelease.error.message)
    } else {
      const actual = afterRelease.value
      if (actual.body !== release.value.body) {
        errors.push(`Published Beta ${input.tag} body differs from the validated body`)
      }
      if (actual.isDraft || !actual.isPrerelease || actual.tagName !== input.tag) {
        errors.push(
          `Expected ${input.tag} to be a published Beta pre-release; received tag=${actual.tagName} draft=${actual.isDraft} prerelease=${actual.isPrerelease}`,
        )
      }
      const after = await readSharedReleaseRepository(input.repository, command)
      if (!after.ok) {
        errors.push(after.error.message)
      } else {
        if (after.value.latestTag === input.tag)
          errors.push(`Beta ${input.tag} became GitHub latest`)
        if (
          after.value.releases.some(
            (candidate) => candidate.tagName === input.tag && candidate.body !== release.value.body,
          )
        ) {
          errors.push(
            `Published Beta ${input.tag} body in the full release list differs from the validated body`,
          )
        }
        if (
          !after.value.releases.some(
            (candidate) => candidate.tagName === input.tag && !candidate.isDraft,
          )
        ) {
          errors.push(`Published Beta ${input.tag} is missing from the full release list`)
        }
        report = evaluateSharedReleaseRepository({
          latestTag: after.value.latestTag,
          releases: after.value.releases.map((candidate) =>
            candidate.tagName === input.tag ? actual : candidate,
          ),
        })
        errors.push(...report.errors)
        errors.push(...evaluateSharedReleaseRepository(after.value).errors)
      }
    }
  }
  if (errors.length === 0) return { ok: true, report }

  const reverted = await command([
    "release",
    "edit",
    input.tag,
    "--draft=true",
    "--repo",
    input.repository,
  ])
  if (!reverted.ok) {
    errors.push(`URGENT: could not revert ${input.tag} to draft: ${reverted.error.message}`)
  }
  return { ok: false, errors: [...new Set(errors)], revertedToDraft: reverted.ok }
}
