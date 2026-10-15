import { $, semver } from "bun"
import path from "node:path"
import { latestReleaseVersionFromReleases, type GithubReleaseVersion } from "./release-version"
import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  isBuddyDistributionId,
} from "./distribution"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg: {
  packageManager?: string
} = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(
    `This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`,
  )
}

const env = {
  BUDDY_BUMP: process.env.BUDDY_BUMP,
  BUDDY_TAG: process.env.BUDDY_TAG,
  BUDDY_VERSION: process.env.BUDDY_VERSION,
  BUDDY_RELEASE: process.env.BUDDY_RELEASE,
}

function cleanRepository(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function releaseRepo() {
  const channel = process.env.BUDDY_CHANNEL?.trim() || "prod"
  // Dev builds still derive numeric versions from prod, but cannot override its destination.
  if (channel !== "dev" && !isBuddyDistributionId(channel)) {
    throw new Error(`Release channel must be prod or beta, received ${channel}`)
  }
  const repo = formatReleaseRepositorySlug(
    BUDDY_DISTRIBUTIONS[channel === "beta" ? "beta" : "prod"],
  )
  for (const override of [process.env.BUDDY_RELEASE_REPO, process.env.GH_REPO]) {
    const candidate = cleanRepository(override)
    if (candidate && candidate !== repo) {
      throw new Error(`Release repository ${candidate} conflicts with ${channel}; expected ${repo}`)
    }
  }
  return repo
}

function normalizeVersion(input: string) {
  const trimmed = input.trim().replace(/^v/, "")
  if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
    throw new Error(`Invalid version: ${input}`)
  }
  return trimmed
}

function githubTagVersion() {
  if (process.env.GITHUB_REF_TYPE !== "tag") {
    return undefined
  }

  const refName = process.env.GITHUB_REF_NAME?.trim()
  if (!refName) {
    return undefined
  }

  if (process.env.BUDDY_CHANNEL?.trim() === "beta") {
    const prefix = BUDDY_DISTRIBUTIONS.beta.sourceTagPrefix
    if (!refName.startsWith(prefix)) {
      throw new Error(`Invalid Beta source tag: ${refName}`)
    }
    return normalizeVersion(refName.slice(prefix.length))
  }
  return normalizeVersion(refName)
}

async function getLatestReleaseVersion() {
  const repo = RELEASE_REPO
  const releases: GithubReleaseVersion[] =
    await $`gh release list --repo ${repo} --json tagName,isDraft,isPrerelease --limit 100`.json()
  return latestReleaseVersionFromReleases(releases)
}

function bumpVersion(version: string, bump: string | undefined) {
  const [major, minor, patch] = normalizeVersion(version)
    .split(".")
    .map((value) => Number.parseInt(value, 10))

  switch ((bump ?? "patch").toLowerCase()) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid BUDDY_BUMP value: ${bump}`)
  }
}

const CHANNEL = "latest"
const IS_PREVIEW = false

const RELEASE_REPO = releaseRepo()

const VERSION = await (async () => {
  if (env.BUDDY_VERSION) {
    return normalizeVersion(env.BUDDY_VERSION)
  }

  if (env.BUDDY_TAG) {
    return normalizeVersion(env.BUDDY_TAG)
  }

  const tagVersion = githubTagVersion()
  if (tagVersion) {
    return tagVersion
  }

  const latest = await getLatestReleaseVersion()
  if (!latest) {
    return "0.1.0"
  }

  return bumpVersion(latest, env.BUDDY_BUMP)
})()

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.BUDDY_RELEASE
  },
}
