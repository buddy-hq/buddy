const FORK_TITLE_METADATA_KEY = "buddy.forkTitle"
const VENDOR_FORK_TITLE_PATTERN = /^(.*) \(fork #(\d+)\)$/u
const FIRST_COPY_NUMBER = 2

type ForkTitleLineage = {
  base: string
  copy: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readForkTitleLineage(metadata: Record<string, unknown> | undefined) {
  const value: unknown = metadata?.[FORK_TITLE_METADATA_KEY]
  if (!isRecord(value)) return undefined

  const base = value.base
  const copy = value.copy
  if (typeof base !== "string" || typeof copy !== "number" || !Number.isSafeInteger(copy)) {
    return undefined
  }
  if (base.length === 0 || copy < FIRST_COPY_NUMBER) return undefined

  return { base, copy } satisfies ForkTitleLineage
}

function readLegacyVendorLineage(title: string): ForkTitleLineage | undefined {
  const match = title.match(VENDOR_FORK_TITLE_PATTERN)
  const base = match?.[1]
  const vendorForkNumber = match?.[2]
  if (!base || !vendorForkNumber) return undefined

  const parsed = Number.parseInt(vendorForkNumber, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined
  return { base, copy: parsed + 1 }
}

/** Creates Buddy's compact fork title and records explicit lineage for later forks. */
export function createForkedSessionTitle(input: {
  title: string
  metadata: Record<string, unknown> | undefined
}) {
  const current = readForkTitleLineage(input.metadata) ?? readLegacyVendorLineage(input.title)
  const lineage: ForkTitleLineage = current
    ? { base: current.base, copy: current.copy + 1 }
    : { base: input.title, copy: FIRST_COPY_NUMBER }

  return {
    title: `${lineage.base} (${lineage.copy})`,
    metadata: {
      ...input.metadata,
      [FORK_TITLE_METADATA_KEY]: lineage,
    },
  }
}

export function removeForkTitleLineage(metadata: Record<string, unknown> | undefined) {
  if (!metadata || !(FORK_TITLE_METADATA_KEY in metadata)) return metadata
  const next = { ...metadata }
  delete next[FORK_TITLE_METADATA_KEY]
  return Object.keys(next).length > 0 ? next : undefined
}
