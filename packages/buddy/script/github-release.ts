import { spawnSync } from "node:child_process"

const GITHUB_API_ROOT = "https://api.github.com"
const GITHUB_API_VERSION = "2022-11-28"
const GITHUB_API_USER_AGENT = "buddy-release-publisher"
const HTTP_STATUS_NOT_FOUND = 404
const COMMAND_SUCCESS_STATUS = 0

export type GitHubReleaseTarget = {
  environment: NodeJS.ProcessEnv
  notes: string
  repository: string
  tag: string
  title: string
}

export type GitHubReleaseDependencies = {
  createRelease: (target: GitHubReleaseTarget) => number | null
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function releaseApiUrl(target: GitHubReleaseTarget): string {
  return `${GITHUB_API_ROOT}/repos/${target.repository}/releases/tags/${encodeURIComponent(target.tag)}`
}

async function releaseExists(
  target: GitHubReleaseTarget,
  fetchImplementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<boolean> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": GITHUB_API_USER_AGENT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  })
  const token = target.environment.GH_TOKEN?.trim()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  let response: Response
  try {
    response = await fetchImplementation(releaseApiUrl(target), { headers })
  } catch (cause) {
    throw new Error(
      `Failed to query GitHub release ${target.repository}@${target.tag}: network request failed`,
      { cause },
    )
  }

  await response.body?.cancel()
  if (response.ok) return true
  if (response.status === HTTP_STATUS_NOT_FOUND) return false

  throw new Error(
    `Failed to query GitHub release ${target.repository}@${target.tag}: ${response.status} ${response.statusText}`,
  )
}

function createRelease(target: GitHubReleaseTarget): number | null {
  return spawnSync(
    "gh",
    [
      "release",
      "create",
      target.tag,
      "--repo",
      target.repository,
      "--title",
      target.title,
      "--notes",
      target.notes,
      "--prerelease",
      "--latest=false",
    ],
    {
      env: target.environment,
      stdio: "inherit",
    },
  ).status
}

const DEFAULT_DEPENDENCIES: GitHubReleaseDependencies = {
  createRelease,
  fetch: globalThis.fetch,
}

export async function ensureGitHubReleaseExists(
  target: GitHubReleaseTarget,
  dependencies: GitHubReleaseDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  if (await releaseExists(target, dependencies.fetch)) return

  const createStatus = dependencies.createRelease(target)
  if (createStatus === COMMAND_SUCCESS_STATUS) return

  // Another publisher may have created the release after our 404 response.
  if (await releaseExists(target, dependencies.fetch)) return

  const renderedStatus = createStatus === null ? "unknown" : String(createStatus)
  throw new Error(
    `Failed to create GitHub release ${target.repository}@${target.tag}: gh exited with status ${renderedStatus}`,
  )
}
