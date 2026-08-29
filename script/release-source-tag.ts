import { $ } from "bun"
import { z } from "zod"

export type SourceTagState = "created" | "existing"

type GithubSourceTag = {
  sha: string
  type: string
}

const githubReferenceSchema = z.object({
  object: z.object({
    sha: z.string(),
    type: z.string(),
  }),
  ref: z.string(),
})

export function resolveSourceGithubToken(environment: NodeJS.ProcessEnv): string | undefined {
  return (
    environment.BUDDY_SOURCE_GH_TOKEN?.trim() ||
    environment.GITHUB_TOKEN?.trim() ||
    environment.GH_TOKEN?.trim() ||
    undefined
  )
}

export function assertGithubSourceTagReference(input: {
  reference: GithubSourceTag | undefined
  repository: string
  tag: string
  target: string
}): void {
  if (
    !input.reference ||
    input.reference.type !== "commit" ||
    input.reference.sha !== input.target
  ) {
    const actual = input.reference ? `${input.reference.type}:${input.reference.sha}` : "missing"
    throw new Error(
      `Source tag ${input.repository}@${input.tag} is ${actual}, expected commit:${input.target}`,
    )
  }
}

export async function resolveGithubSourceTag(input: {
  repository: string
  tag: string
}): Promise<GithubSourceTag | undefined> {
  const sourceToken = resolveSourceGithubToken(process.env)
  const environment = { ...process.env }
  if (sourceToken) environment.GH_TOKEN = sourceToken
  const result = await $`gh api ${`repos/${input.repository}/git/ref/tags/${input.tag}`}`
    .env(environment)
    .quiet()
    .nothrow()
  if (result.exitCode !== 0) return undefined
  const reference = githubReferenceSchema.parse(JSON.parse(result.text()))
  return reference.object
}

export async function ensureGithubSourceTag(input: {
  repository: string
  tag: string
  target: string
}): Promise<SourceTagState> {
  const existing = await resolveGithubSourceTag(input)
  if (existing) {
    assertGithubSourceTagReference({ ...input, reference: existing })
    return "existing"
  }

  const created =
    await $`gh api --method POST ${`repos/${input.repository}/git/refs`} -f ${`ref=refs/tags/${input.tag}`} -f ${`sha=${input.target}`}`
      .quiet()
      .nothrow()
  if (created.exitCode === 0) {
    const reference = githubReferenceSchema.parse(JSON.parse(created.text())).object
    assertGithubSourceTagReference({ ...input, reference })
    return "created"
  }

  const concurrent = await resolveGithubSourceTag(input)
  if (concurrent) {
    assertGithubSourceTagReference({ ...input, reference: concurrent })
    return "existing"
  }

  const detail = created.stderr.toString().trim()
  throw new Error(`Failed to create source tag ${input.tag}${detail ? `: ${detail}` : ""}`)
}

export async function assertGithubSourceTag(input: {
  repository: string
  tag: string
  target: string
}): Promise<void> {
  assertGithubSourceTagReference({
    ...input,
    reference: await resolveGithubSourceTag(input),
  })
}

if (import.meta.main) {
  const repository = process.env.BUDDY_RELEASE_SOURCE_REPOSITORY?.trim()
  const tag = process.env.BUDDY_RELEASE_TAG?.trim()
  const target = process.env.BUDDY_RELEASE_SOURCE_SHA?.trim().toLowerCase()
  if (!repository || !tag || !target || !/^[0-9a-f]{40}$/u.test(target)) {
    throw new Error(
      "BUDDY_RELEASE_SOURCE_REPOSITORY, BUDDY_RELEASE_TAG, and a full BUDDY_RELEASE_SOURCE_SHA are required",
    )
  }
  const state = await ensureGithubSourceTag({ repository, tag, target })
  console.log(`Source tag ${repository}@${tag} is ${state} at ${target}`)
}
