import { $ } from "bun"
import { z } from "zod"
import type { InstalledStableRelease } from "./installed-stable-readers"
import type { SharedReleaseRepository } from "./shared-repository-guard"

/** A classified GitHub command or response failure at the publication boundary. */
export class SharedReleaseGithubError extends Error {
  /** Stable error identity for release callers. */
  readonly _tag = "SharedReleaseGithubError" as const

  /** Describe the failed command or response without exposing release credentials. */
  constructor(operation: string, detail: string) {
    super(`${operation}: ${detail}`)
  }
}

/** GitHub operations return expected command and parsing failures as values. */
export type ReleaseGithubResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: SharedReleaseGithubError }

/** The sole external command boundary, replaceable with an offline GitHub in tests. */
export type ReleaseGithubCommand = (args: readonly string[]) => Promise<ReleaseGithubResult<string>>

/** Execute gh with escaped arguments and contain failures at the external boundary. */
export const runReleaseGithubCommand: ReleaseGithubCommand = async (args) => {
  try {
    return { ok: true, value: await $`gh ${args}`.quiet().text() }
  } catch {
    return {
      ok: false,
      error: new SharedReleaseGithubError("GitHub release command failed", args.join(" ")),
    }
  }
}

const apiReleaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  body: z.string().nullish(),
  html_url: z.string(),
})

const releaseViewSchema = z.object({
  tagName: z.string(),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  body: z.string().nullish(),
  url: z.string(),
})

function parseGithubResponse<Value>(
  text: string,
  schema: z.ZodType<Value>,
  operation: string,
): ReleaseGithubResult<Value> {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: new SharedReleaseGithubError(operation, "expected JSON") }
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      error: new SharedReleaseGithubError(operation, "unexpected release record shape"),
    }
  }
  return { ok: true, value: parsed.data }
}

/** Read every authenticated API page in order and resolve latest independently. */
export async function readSharedReleaseRepository(
  repository: string,
  command: ReleaseGithubCommand = runReleaseGithubCommand,
): Promise<ReleaseGithubResult<SharedReleaseRepository>> {
  const list = await command([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repository}/releases?per_page=100`,
  ])
  if (!list.ok) return list
  const pages = parseGithubResponse(
    list.value,
    z.array(z.array(apiReleaseSchema)),
    "Invalid GitHub release list",
  )
  if (!pages.ok) return pages
  const latest = await command(["api", `repos/${repository}/releases/latest`])
  if (!latest.ok) return latest
  const latestRecord = parseGithubResponse(
    latest.value,
    apiReleaseSchema,
    "Invalid GitHub latest release",
  )
  if (!latestRecord.ok) return latestRecord
  if (latestRecord.value.draft || latestRecord.value.prerelease) {
    return {
      ok: false,
      error: new SharedReleaseGithubError(
        "Invalid GitHub latest release",
        "latest must be non-draft and non-prerelease",
      ),
    }
  }
  return {
    ok: true,
    value: {
      latestTag: latestRecord.value.tag_name,
      releases: pages.value.flat().map((release) => ({
        tagName: release.tag_name,
        isDraft: release.draft,
        isPrerelease: release.prerelease,
        body: release.body ?? "",
        url: release.html_url,
      })),
    },
  }
}

/** Read the exact published body and flags, rather than trusting the edit response. */
export async function readSharedRelease(
  repository: string,
  tag: string,
  command: ReleaseGithubCommand = runReleaseGithubCommand,
): Promise<ReleaseGithubResult<InstalledStableRelease>> {
  const response = await command([
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "isDraft,isPrerelease,tagName,body,url",
  ])
  if (!response.ok) return response
  const release = parseGithubResponse(
    response.value,
    releaseViewSchema,
    `Invalid GitHub release ${tag}`,
  )
  if (!release.ok) return release
  return { ok: true, value: { ...release.value, body: release.value.body ?? "" } }
}
