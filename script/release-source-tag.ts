import { $ } from "bun"

const SOURCE_REMOTE = "origin"
const TAG_REF_PREFIX = "refs/tags/"
const PUSH_CREATED_FLAG = "*"
const PUSH_EXISTING_FLAG = "="

export type SourceTagState = "created" | "existing"

type SourceTagInput = {
  rootDir: string
  tag: string
  target: string
}

type SourceTagPublication = {
  isPublished: () => Promise<boolean>
  publish: () => Promise<void>
}

function tagRef(tag: string): string {
  return `${TAG_REF_PREFIX}${tag}`
}

function peeledTagRef(tag: string): string {
  return `${tagRef(tag)}^{}`
}

function conflictingSourceTagError(input: SourceTagInput, existingSha: string): Error {
  return new Error(
    `Source tag ${input.tag} already exists at ${existingSha}, expected ${input.target}`,
  )
}

export async function resolveRemoteSourceTagSha(
  input: Pick<SourceTagInput, "rootDir" | "tag">,
): Promise<string | undefined> {
  const ref = tagRef(input.tag)
  const peeledRef = peeledTagRef(input.tag)
  const output =
    await $`git ls-remote ${SOURCE_REMOTE} ${ref} ${peeledRef}`.cwd(input.rootDir).text()
  let directSha: string | undefined

  for (const line of output.split(/\r?\n/)) {
    const [sha, remoteRef] = line.trim().split(/\s+/)
    if (!sha || !remoteRef) continue
    if (remoteRef === peeledRef) return sha
    if (remoteRef === ref) directSha = sha
  }

  return directSha
}

function sourceTagStateFromPushOutput(output: string): SourceTagState | undefined {
  for (const line of output.split(/\r?\n/)) {
    const [flag] = line.split("\t")
    if (flag === PUSH_CREATED_FLAG) return "created"
    if (flag === PUSH_EXISTING_FLAG) return "existing"
  }

  return undefined
}

export async function ensureSourceTag(input: SourceTagInput): Promise<SourceTagState> {
  const existingSha = await resolveRemoteSourceTagSha(input)
  if (existingSha) {
    if (existingSha === input.target) return "existing"
    throw conflictingSourceTagError(input, existingSha)
  }

  const pushResult =
    await $`git push --porcelain ${SOURCE_REMOTE} ${`${input.target}:${tagRef(input.tag)}`}`
      .cwd(input.rootDir)
      .quiet()
      .nothrow()

  if (pushResult.exitCode === 0) {
    const state = sourceTagStateFromPushOutput(pushResult.text())
    if (state) return state
    throw new Error(`Could not determine whether source tag ${input.tag} was created`)
  }

  const currentSha = await resolveRemoteSourceTagSha(input)
  if (currentSha === input.target) return "existing"
  if (currentSha) throw conflictingSourceTagError(input, currentSha)

  const detail = pushResult.stderr.toString().trim()
  throw new Error(`Failed to create source tag ${input.tag}${detail ? `: ${detail}` : ""}`)
}

export async function removeSourceTag(input: SourceTagInput): Promise<void> {
  const existingSha = await resolveRemoteSourceTagSha(input)
  if (!existingSha) return
  if (existingSha !== input.target) {
    throw new Error(
      `Refusing to remove source tag ${input.tag} at ${existingSha}; expected ${input.target}`,
    )
  }

  await $`git push ${SOURCE_REMOTE} ${`:${tagRef(input.tag)}`}`.cwd(input.rootDir)
}

export async function publishWithSourceTag(
  input: SourceTagInput,
  publication: SourceTagPublication,
): Promise<void> {
  const sourceTagState = await ensureSourceTag(input)

  try {
    await publication.publish()
  } catch (publishError) {
    let isPublished: boolean
    try {
      isPublished = await publication.isPublished()
    } catch (verificationError) {
      throw new Error(
        `Failed to publish ${input.tag}; its publication state is unknown, so the source tag was preserved. Publish error: ${String(publishError)}`,
        { cause: verificationError },
      )
    }

    if (isPublished) return

    if (sourceTagState === "created") {
      try {
        await removeSourceTag(input)
      } catch (cleanupError) {
        throw new Error(
          `Failed to publish ${input.tag} and remove its source tag. Publish error: ${String(publishError)}`,
          { cause: cleanupError },
        )
      }
    }
    throw publishError
  }
}
