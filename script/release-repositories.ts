import { formatReleaseRepositorySlug } from "@buddy/script/distribution"
import { assertReleaseDestination, releaseDistribution } from "./release/distribution-guard"

const DEFAULT_SOURCE_REPOSITORY = "buddy-hq/buddy"

export type RepositoryParts = {
  owner: string
  repo: string
}

function cleanRepository(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export function sourceRepository(env: NodeJS.ProcessEnv = process.env): string {
  return (
    cleanRepository(env.BUDDY_SOURCE_REPO) ||
    cleanRepository(env.GITHUB_REPOSITORY) ||
    DEFAULT_SOURCE_REPOSITORY
  )
}

export function releaseRepository(env: NodeJS.ProcessEnv = process.env): string {
  const repository = formatReleaseRepositorySlug(releaseDistribution(env))
  assertReleaseDestination(repository, env)
  return repository
}

export function repositoryParts(repository: string): RepositoryParts {
  const [owner, repo, ...extra] = repository.split("/")
  if (!owner || !repo || extra.length > 0) {
    throw new Error(`Invalid GitHub repository: ${repository}`)
  }

  return { owner, repo }
}
