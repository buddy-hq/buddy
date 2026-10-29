import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isDeepEqual } from "remeda"
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode,
  visit,
  type ParseError as JsoncParseError,
} from "jsonc-parser"
import { ConfigSchema } from "./schema.js"
import { InvalidError, JsonError } from "./errors.js"
import { safeParsePersistedConfig, type TPersistedConfigParseOptions } from "./compatibility.js"
import {
  parseConfigJsonValue,
  parseConfigObject,
  parseNodeErrorCode,
  type TConfigJsonObject,
  type TConfigJsonValue,
} from "../parse-values.js"
import type { ZodType } from "zod"
import { readSecrets, SECRET_REFERENCE_PATTERN } from "../secrets/secret-store"

const BUDDY_CONFIG_SCHEMA_URL = "https://buddy/config.json"
const GLOBAL_ONLY_CONFIG_KEYS = new Set(["concise_responses", "experimental_features"])

type TConfigDocument = {
  $schema?: string
}

type TDuplicateConfigProperty = {
  key: string
  line: number
  column: number
}

const JSONC_FORMATTING = {
  insertSpaces: true,
  tabSize: 2,
} as const

function formatParseErrors(text: string, errors: JsoncParseError[]) {
  return errors
    .map((item) => {
      const beforeOffset = text.substring(0, item.offset).split("\n")
      const line = beforeOffset.length
      const column = beforeOffset[beforeOffset.length - 1].length + 1
      return `${printParseErrorCode(item.error)} at line ${line}, column ${column}`
    })
    .join("\n")
}

const GLOBAL_CONFIG_PARSE_OPTIONS = {} satisfies TPersistedConfigParseOptions
const PROJECT_CONFIG_PARSE_OPTIONS = {
  rejectedRootKeys: GLOBAL_ONLY_CONFIG_KEYS,
} satisfies TPersistedConfigParseOptions

async function loadConfigFileWithSchema<T extends TConfigDocument>(
  filepath: string,
  schema: ZodType<T>,
  parseOptions: TPersistedConfigParseOptions,
  options: { resolveSubstitutions?: boolean } = {},
): Promise<T> {
  const text = await fsp.readFile(filepath, "utf8").catch((error) => {
    if (parseNodeErrorCode(error) === "ENOENT") return undefined
    throw new JsonError({ path: filepath }, { cause: error })
  })

  if (!text) return schema.parse({})
  return loadConfigTextWithSchema(text, { path: filepath }, schema, parseOptions, options)
}

async function loadConfigTextWithSchema<T extends TConfigDocument>(
  text: string,
  options: { path: string } | { dir: string; source: string },
  schema: ZodType<T>,
  parseOptions: TPersistedConfigParseOptions,
  loadOptions: { resolveSubstitutions?: boolean } = {},
): Promise<T> {
  const configDir = "path" in options ? path.dirname(options.path) : options.dir
  const source = "path" in options ? options.path : options.source

  if (loadOptions.resolveSubstitutions !== false) {
    text = text.replace(/\{env:([^}]+)\}/g, (_, varName: string) => process.env[varName] ?? "")

    if (text.match(SECRET_REFERENCE_PATTERN)) {
      const secrets = await readSecrets()
      const missing = new Set<string>()
      text = text
        .split("\n")
        .map((line) => {
          if (line.trim().startsWith("//")) return line
          return line.replace(SECRET_REFERENCE_PATTERN, (reference, id: string) => {
            const value = Object.hasOwn(secrets, id) ? secrets[id] : undefined
            if (value !== undefined) return JSON.stringify(value).slice(1, -1)
            if (!missing.has(id)) {
              missing.add(id)
              console.warn(`Missing config secret in ${source}: ${id}`)
            }
            return reference
          })
        })
        .join("\n")
    }

    const fileMatches = text.match(/\{file:[^}]+\}/g)
    if (fileMatches) {
      const lines = text.split("\n")

      for (const match of fileMatches) {
        const lineIndex = lines.findIndex((line) => line.includes(match))
        if (lineIndex !== -1 && lines[lineIndex].trim().startsWith("//")) continue

        let filePath = match.replace(/^\{file:/, "").replace(/\}$/, "")
        if (filePath.startsWith("~/")) {
          filePath = path.join(os.homedir(), filePath.slice(2))
        }

        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(configDir, filePath)
        const content = await fsp.readFile(resolvedPath, "utf8").catch((error) => {
          const base = `bad file reference: "${match}"`
          if (parseNodeErrorCode(error) === "ENOENT") {
            throw new InvalidError(
              { path: source, message: `${base} ${resolvedPath} does not exist` },
              { cause: error },
            )
          }
          throw new InvalidError({ path: source, message: base }, { cause: error })
        })

        text = text.replace(match, () => JSON.stringify(content.trim()).slice(1, -1))
      }
    }
  }

  const errors: JsoncParseError[] = []
  const data = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new JsonError({
      path: source,
      message: `Invalid JSONC in ${source}: ${formatParseErrors(text, errors)}`,
    })
  }

  assertNoDuplicateConfigProperties(text, source)

  const parsed = safeParsePersistedConfig(parseConfigJsonValue(data), schema, parseOptions)
  if (!parsed.success) {
    throw new InvalidError({ path: source, issues: parsed.error.issues }, { cause: parsed.error })
  }

  const output = parsed.data
  output.$schema ??= BUDDY_CONFIG_SCHEMA_URL

  return output
}

export function loadConfigFile(
  filepath: string,
  options?: { resolveSubstitutions?: boolean },
): Promise<ConfigSchema.Info> {
  return loadConfigFileWithSchema(filepath, ConfigSchema.Info, GLOBAL_CONFIG_PARSE_OPTIONS, options)
}

export function loadProjectConfigFile(
  filepath: string,
  options?: { resolveSubstitutions?: boolean },
): Promise<ConfigSchema.ProjectInfo> {
  return loadConfigFileWithSchema(
    filepath,
    ConfigSchema.ProjectInfo,
    PROJECT_CONFIG_PARSE_OPTIONS,
    options,
  )
}

export function loadConfigText(
  text: string,
  options: { path: string } | { dir: string; source: string },
  loadOptions?: { resolveSubstitutions?: boolean },
): Promise<ConfigSchema.Info> {
  return loadConfigTextWithSchema(
    text,
    options,
    ConfigSchema.Info,
    GLOBAL_CONFIG_PARSE_OPTIONS,
    loadOptions,
  )
}

export function loadProjectConfigText(
  text: string,
  options: { path: string } | { dir: string; source: string },
  loadOptions?: { resolveSubstitutions?: boolean },
): Promise<ConfigSchema.ProjectInfo> {
  return loadConfigTextWithSchema(
    text,
    options,
    ConfigSchema.ProjectInfo,
    PROJECT_CONFIG_PARSE_OPTIONS,
    loadOptions,
  )
}

export function patchJsoncDocument<TPatch extends TConfigJsonValue | undefined>(
  input: string,
  patch: TPatch,
  patchPath: string[] = [],
): string {
  const record = parseConfigObject(patch)
  if (record === undefined) {
    return setJsoncDocumentValue(input, patchPath, patch)
  }

  return Object.entries(record).reduce((result, [key, value]) => {
    if (value === undefined) return result
    return patchJsoncDocument(result, value, [...patchPath, key])
  }, input)
}

function parseJsoncValue(text: string, filepath: string): TConfigJsonValue | undefined {
  const errors: JsoncParseError[] = []
  const value = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new JsonError({
      path: filepath,
      message: formatParseErrors(text, errors),
    })
  }

  assertNoDuplicateConfigProperties(text, filepath)

  if (value === undefined) return undefined
  const parsed = parseConfigJsonValue(value)
  if (parsed === undefined) {
    throw new JsonError({
      path: filepath,
      message: "Config document contains an unsupported JSON value",
    })
  }
  return parsed
}

function assertNoDuplicateConfigProperties(text: string, filepath: string): void {
  const duplicate = findDuplicateConfigProperty(text)
  if (duplicate === undefined) return

  throw new InvalidError({
    path: filepath,
    message:
      `Duplicate config key ${JSON.stringify(duplicate.key)} at line ` +
      `${duplicate.line}, column ${duplicate.column}. Remove duplicate keys and try again.`,
  })
}

// jsonc-parser edits the first matching key but resolves the last duplicate when parsing.
function findDuplicateConfigProperty(text: string): TDuplicateConfigProperty | undefined {
  const objectProperties: Set<string>[] = []
  let duplicate: TDuplicateConfigProperty | undefined

  visit(
    text,
    {
      onObjectBegin: () => {
        objectProperties.push(new Set())
      },
      onObjectProperty: (key, _offset, _length, startLine, startCharacter) => {
        if (duplicate !== undefined) return
        const properties = objectProperties.at(-1)
        if (properties === undefined) return
        if (!properties.has(key)) {
          properties.add(key)
          return
        }
        duplicate = {
          key,
          line: startLine + 1,
          column: startCharacter + 1,
        }
      },
      onObjectEnd: () => {
        objectProperties.pop()
      },
    },
    { allowTrailingComma: true },
  )

  return duplicate
}

export function updateKnownConfigDocument<TCurrent, TNext>(
  input: string,
  currentValue: TCurrent,
  nextValue: TNext,
  filepath: string,
): string {
  const inputRecord = parseConfigObject(parseJsoncValue(input, filepath))
  const currentRecord = parseConfigObject(currentValue)
  const nextRecord = parseConfigObject(nextValue)

  if (inputRecord === undefined || currentRecord === undefined || nextRecord === undefined) {
    throw new JsonError({
      path: filepath,
      message: "Config document must contain an object",
    })
  }

  return updateKnownConfigDocumentValue(input, inputRecord, currentRecord, nextRecord, [])
}

export function removeConfigDocumentValue(
  input: string,
  filepath: string,
  configPath: string[],
): string {
  let current = parseJsoncValue(input, filepath)
  for (const key of configPath) {
    const record = parseConfigObject(current)
    if (record === undefined || !Object.hasOwn(record, key)) return input
    current = record[key]
  }
  return removeJsoncDocumentValue(input, configPath)
}

function removeJsoncDocumentValue(input: string, configPath: string[]): string {
  return setJsoncDocumentValue(input, configPath, undefined)
}

function setJsoncDocumentValue(
  input: string,
  configPath: string[],
  value: TConfigJsonValue | undefined,
): string {
  const edits = modify(input, configPath, value, {
    formattingOptions: JSONC_FORMATTING,
  })
  return applyEdits(input, edits)
}

function updateKnownConfigDocumentValue(
  input: string,
  rawValue: TConfigJsonValue | undefined,
  currentValue: TConfigJsonValue | undefined,
  nextValue: TConfigJsonValue | undefined,
  patchPath: string[],
): string {
  if (isDeepEqual(currentValue, nextValue)) return input

  const rawRecord = parseConfigObject(rawValue)
  const currentRecord = parseConfigObject(currentValue)
  const nextRecord = parseConfigObject(nextValue)

  if (nextValue === undefined && rawRecord !== undefined && currentRecord !== undefined) {
    // Removing the raw parent would also remove properties this Buddy version cannot decode.
    if (!hasUnknownConfigProperties(rawRecord, currentRecord)) {
      return removeJsoncDocumentValue(input, patchPath)
    }

    return Object.entries(currentRecord).reduce(
      (result, [key, value]) =>
        updateKnownConfigDocumentValue(
          result,
          getOwnConfigProperty(rawRecord, key),
          value,
          undefined,
          [...patchPath, key],
        ),
      input,
    )
  }

  if (nextRecord === undefined) {
    return setJsoncDocumentValue(input, patchPath, nextValue)
  }

  if (rawRecord === undefined || currentRecord === undefined) {
    // Schema decoding can normalize shorthand into an object with a different raw shape.
    return setJsoncDocumentValue(input, patchPath, nextValue)
  }

  let result = input

  for (const key of Object.keys(currentRecord)) {
    if (Object.hasOwn(nextRecord, key)) {
      continue
    }

    result = updateKnownConfigDocumentValue(
      result,
      getOwnConfigProperty(rawRecord, key),
      currentRecord[key],
      undefined,
      [...patchPath, key],
    )
  }

  for (const [key, value] of Object.entries(nextRecord)) {
    result = updateKnownConfigDocumentValue(
      result,
      getOwnConfigProperty(rawRecord, key),
      currentRecord[key],
      value,
      [...patchPath, key],
    )
  }

  return result
}

function getOwnConfigProperty(
  record: TConfigJsonObject,
  key: string,
): TConfigJsonValue | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function hasUnknownConfigProperties(
  rawRecord: TConfigJsonObject,
  currentRecord: TConfigJsonObject,
): boolean {
  return Object.entries(rawRecord).some(([key, rawValue]) => {
    if (!Object.hasOwn(currentRecord, key)) return true

    const rawChild = parseConfigObject(rawValue)
    const currentChild = parseConfigObject(currentRecord[key])
    if (rawChild === undefined || currentChild === undefined) return false
    return hasUnknownConfigProperties(rawChild, currentChild)
  })
}
