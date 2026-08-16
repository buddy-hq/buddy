import { isJsonObject, parseFiniteNumber, parseStringValue, type TJsonObject } from "./parse-external"

const FORK_TITLE_METADATA_KEY = "buddy.forkTitle"
const VENDOR_FORK_TITLE_PATTERN = /^(.*) \(fork #(\d+)\)$/u
const FIRST_COPY_NUMBER = 2

type TForkTitleLineage = {
  base: string
  copy: number
}

function parseForkTitleLineage<TValue>(value: TValue): TForkTitleLineage | undefined {
  if (!isJsonObject(value)) return undefined

  const base = parseStringValue(value.base)
  const copy = parseFiniteNumber(value.copy)
  if (base === undefined || copy === undefined || !Number.isSafeInteger(copy)) {
    return undefined
  }
  if (base.length === 0 || copy < FIRST_COPY_NUMBER) return undefined

  return { base, copy }
}

function readForkTitleLineage(metadata: TJsonObject | undefined) {
  return parseForkTitleLineage(metadata?.[FORK_TITLE_METADATA_KEY])
}

function readLegacyVendorLineage(title: string): TForkTitleLineage | undefined {
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
  metadata: TJsonObject | undefined
}) {
  const current = readForkTitleLineage(input.metadata) ?? readLegacyVendorLineage(input.title)
  const lineage: TForkTitleLineage = current
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

export function removeForkTitleLineage(metadata: TJsonObject | undefined) {
  if (!metadata || !(FORK_TITLE_METADATA_KEY in metadata)) return metadata
  const next: TJsonObject = { ...metadata }
  delete next[FORK_TITLE_METADATA_KEY]
  return Object.keys(next).length > 0 ? next : undefined
}
