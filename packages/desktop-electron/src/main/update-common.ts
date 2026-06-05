import { verifySignedMessage } from "./minisign"

const SIGNATURE_SUFFIX = ".sig"
const GITHUB_RELEASES_API_ACCEPT_HEADER = "application/vnd.github+json"
const GITHUB_RELEASES_API_VERSION_HEADER = "2022-11-28"
const GITHUB_RELEASES_API_USER_AGENT = "Buddy-Updater"
const LATEST_PRERELEASE_SEARCH_LIMIT = 100

export const RELEASE_REPOSITORY_OWNER = "prashantbhudwal"
export const RELEASE_REPOSITORY_NAME = "buddy"
export const RELEASE_REPOSITORY = `${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}`
export const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"
export const BUDDY_MINISIGN_PUBLIC_KEY = "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f"

type GithubRelease = {
  draft: boolean
  prerelease: boolean
  publishedAt: string
  tagName: string
}

export function resolveLatestReleaseAssetUrl(filename: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/${filename}`
}

export function resolveReleaseDownloadBaseUrl(version: string): string {
  return resolveReleaseTagDownloadBaseUrl(`v${version}`)
}

export function resolveReleaseAssetUrl(version: string, filename: string): string {
  return resolveReleaseTagAssetUrl(`v${version}`, filename)
}

export function resolveReleaseTagDownloadBaseUrl(tag: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/${tag}/`
}

export function resolveReleaseTagAssetUrl(tag: string, filename: string): string {
  if (isAbsoluteUrl(filename)) {
    return filename
  }

  return new URL(filename, resolveReleaseTagDownloadBaseUrl(tag)).toString()
}

export async function resolveLatestPrereleaseAssetUrl(filename: string): Promise<string> {
  const release = await fetchLatestGithubPrerelease()
  return resolveReleaseTagAssetUrl(release.tagName, filename)
}

async function fetchLatestGithubPrerelease(): Promise<GithubRelease> {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases?per_page=${LATEST_PRERELEASE_SEARCH_LIMIT}`,
    {
      headers: {
        Accept: GITHUB_RELEASES_API_ACCEPT_HEADER,
        "Cache-Control": "no-cache",
        "User-Agent": GITHUB_RELEASES_API_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_RELEASES_API_VERSION_HEADER,
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub releases: ${response.status} ${response.statusText}`)
  }

  const body: unknown = await response.json()
  if (!Array.isArray(body)) {
    throw new Error("GitHub releases response was not an array")
  }

  let latestPrerelease: GithubRelease | undefined
  for (const item of body) {
    const release = parseGithubRelease(item)
    if (!release || release.draft || !release.prerelease) continue
    if (
      !latestPrerelease ||
      releasePublishedAtTime(release) > releasePublishedAtTime(latestPrerelease)
    ) {
      latestPrerelease = release
    }
  }

  if (!latestPrerelease) {
    throw new Error("No published GitHub prerelease found")
  }

  return latestPrerelease
}

function releasePublishedAtTime(release: GithubRelease): number {
  const time = Date.parse(release.publishedAt)
  return Number.isNaN(time) ? 0 : time
}

function parseGithubRelease(value: unknown): GithubRelease | undefined {
  if (!isRecord(value)) return undefined

  const draft = Reflect.get(value, "draft")
  const prerelease = Reflect.get(value, "prerelease")
  const publishedAt = Reflect.get(value, "published_at")
  const tagName = Reflect.get(value, "tag_name")
  if (
    typeof draft !== "boolean" ||
    typeof prerelease !== "boolean" ||
    typeof publishedAt !== "string" ||
    typeof tagName !== "string" ||
    tagName.length === 0
  ) {
    return undefined
  }

  return {
    draft,
    prerelease,
    publishedAt,
    tagName,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export async function fetchSignedText(input: { publicKey?: string; url: string }): Promise<string> {
  const [contentResponse, signatureResponse] = await Promise.all([
    fetch(input.url, {
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
    fetch(`${input.url}${SIGNATURE_SUFFIX}`, {
      headers: {
        Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
  ])

  if (!contentResponse.ok) {
    throw new Error(
      `Failed to fetch signed update content: ${contentResponse.status} ${contentResponse.statusText}`,
    )
  }

  if (!signatureResponse.ok) {
    throw new Error(
      `Failed to fetch update signature: ${signatureResponse.status} ${signatureResponse.statusText}`,
    )
  }

  const [contentText, signatureOuterText] = await Promise.all([
    contentResponse.text(),
    signatureResponse.text(),
  ])

  const verified = await verifySignedMessage({
    message: Buffer.from(contentText, "utf8"),
    publicKey: input.publicKey ?? BUDDY_MINISIGN_PUBLIC_KEY,
    signatureFileText: decodeTauriSignatureOuterText(signatureOuterText),
  })

  if (!verified) {
    throw new Error("Signed update content verification failed")
  }

  return contentText
}

export async function fetchSignedElectronUpdateManifest(input: {
  publicKey?: string
  url: string
}): Promise<{ content: string; version: string }> {
  const content = await fetchSignedText(input)
  const version = parseElectronUpdateManifestVersion(content)
  return {
    content,
    version,
  }
}

export function parseElectronUpdateManifestVersion(content: string): string {
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("version:")) continue

    const version = trimmed.slice("version:".length).trim().replace(/^['"]|['"]$/gu, "")
    if (version.length > 0) {
      return version
    }
  }

  throw new Error("Signed update manifest is missing version")
}

export function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://")
}

function decodeTauriSignatureOuterText(signatureOuterText: string): string {
  return Buffer.from(signatureOuterText.trim(), "base64").toString("utf8")
}
