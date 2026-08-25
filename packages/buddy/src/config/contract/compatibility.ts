import z from "zod"
import {
  parseConfigObject,
  type TConfigJsonObject,
  type TConfigJsonValue,
} from "../parse-values.js"
import type { ZodIssue, ZodSafeParseResult, ZodType } from "zod"

const ConfigPathSegment = z.union([
  z.string().transform((key) => ({ kind: "property" as const, key })),
  z.number().int().nonnegative().transform((index) => ({ kind: "index" as const, index })),
])
const ConfigPath = z.array(ConfigPathSegment)
type TConfigPath = z.output<typeof ConfigPath>

export type TPersistedConfigParseOptions = {
  rejectedRootKeys?: ReadonlySet<string>
}

function parseIssuePath(pathValue: ZodIssue["path"]): TConfigPath | undefined {
  const parsed = ConfigPath.safeParse(pathValue)
  return parsed.success ? parsed.data : undefined
}

function getConfigValueAtPath(
  input: TConfigJsonValue,
  configPath: TConfigPath,
): TConfigJsonValue | undefined {
  let current: TConfigJsonValue | undefined = input
  for (const segment of configPath) {
    if (segment.kind === "index") {
      if (!Array.isArray(current)) return undefined
      current = current[segment.index]
      continue
    }

    const record: TConfigJsonObject | undefined = parseConfigObject(current)
    if (record === undefined) return undefined
    current = record[segment.key]
  }
  return current
}

function deleteConfigPropertyAtPath(
  input: TConfigJsonValue,
  objectPath: TConfigPath,
  key: string,
): boolean {
  const record = parseConfigObject(getConfigValueAtPath(input, objectPath))
  if (record === undefined || !Object.hasOwn(record, key)) return false
  delete record[key]
  return true
}

function removeUnknownConfigKeys(
  input: TConfigJsonValue,
  issue: Extract<ZodIssue, { code: "unrecognized_keys" }>,
  options: TPersistedConfigParseOptions,
): boolean {
  const issuePath = parseIssuePath(issue.path)
  if (issuePath === undefined) return false

  let changed = false
  for (const key of issue.keys) {
    if (
      issuePath.length === 0 &&
      options.rejectedRootKeys !== undefined &&
      options.rejectedRootKeys.has(key)
    ) {
      continue
    }
    changed = deleteConfigPropertyAtPath(input, issuePath, key) || changed
  }
  return changed
}

function removeUnknownConfigIssues(
  input: TConfigJsonValue,
  issues: ZodIssue[],
  options: TPersistedConfigParseOptions,
): boolean {
  let changed = false
  for (const issue of issues) {
    if (issue.code !== "unrecognized_keys") continue
    changed = removeUnknownConfigKeys(input, issue, options) || changed
  }
  return changed
}

export function safeParsePersistedConfig<TConfig>(
  input: TConfigJsonValue | undefined,
  schema: ZodType<TConfig>,
  options: TPersistedConfigParseOptions,
): ZodSafeParseResult<TConfig> {
  if (input === undefined) return schema.safeParse(input)

  const candidate = structuredClone(input)
  while (true) {
    const parsed = schema.safeParse(candidate)
    if (parsed.success) return parsed
    if (!removeUnknownConfigIssues(candidate, parsed.error.issues, options)) return parsed
  }
}
