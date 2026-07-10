import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError as JsoncParseError,
} from "jsonc-parser"
import { ConfigSchema } from "./schema.js"
import { InvalidError, JsonError } from "./errors.js"
import type { ZodType } from "zod"

const BUDDY_CONFIG_SCHEMA_URL = "https://buddy/config.json"

type ConfigDocument = {
  $schema?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function formatParseErrors(text: string, errors: JsoncParseError[]) {
  const lines = text.split("\n")
  return errors
    .map((item) => {
      const beforeOffset = text.substring(0, item.offset).split("\n")
      const line = beforeOffset.length
      const column = beforeOffset[beforeOffset.length - 1].length + 1
      const problemLine = lines[line - 1]
      const error = `${printParseErrorCode(item.error)} at line ${line}, column ${column}`

      if (!problemLine) return error
      return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`
    })
    .join("\n")
}

async function loadConfigFileWithSchema<T extends ConfigDocument>(
  filepath: string,
  schema: ZodType<T>,
): Promise<T> {
  const text = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
    const maybe = err as { code?: string }
    if (maybe.code === "ENOENT") return undefined
    throw new JsonError({ path: filepath }, { cause: err })
  })

  if (!text) return schema.parse({})
  return loadConfigTextWithSchema(text, { path: filepath }, schema)
}

async function loadConfigTextWithSchema<T extends ConfigDocument>(
  text: string,
  options: { path: string } | { dir: string; source: string },
  schema: ZodType<T>,
): Promise<T> {
  const original = text
  const configDir = "path" in options ? path.dirname(options.path) : options.dir
  const source = "path" in options ? options.path : options.source
  const isFile = "path" in options

  text = text.replace(/\{env:([^}]+)\}/g, (_, varName: string) => process.env[varName] ?? "")

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

      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
      const content = await fsp.readFile(resolvedPath, "utf8").catch((error: unknown) => {
        const err = error as { code?: string }
        const base = `bad file reference: "${match}"`
        if (err.code === "ENOENT") {
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

  const errors: JsoncParseError[] = []
  const data = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new JsonError({
      path: source,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${formatParseErrors(text, errors)}\n--- End ---`,
    })
  }

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new InvalidError({ path: source, issues: parsed.error.issues }, { cause: parsed.error })
  }

  const output = parsed.data
  if (!output.$schema && isFile) {
    output.$schema = BUDDY_CONFIG_SCHEMA_URL
    const updated = original.replace(/^\s*\{/, `{\n  "$schema": "${BUDDY_CONFIG_SCHEMA_URL}",`)
    await fsp.writeFile(options.path, updated, "utf8").catch(() => undefined)
  }

  return output
}

function parseConfigTextWithSchema<T>(text: string, filepath: string, schema: ZodType<T>): T {
  const errors: JsoncParseError[] = []
  const data = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    throw new JsonError({
      path: filepath,
      message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${formatParseErrors(text, errors)}\n--- End ---`,
    })
  }

  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new InvalidError({ path: filepath, issues: parsed.error.issues }, { cause: parsed.error })
  }

  return parsed.data
}

export function loadConfigFile(filepath: string): Promise<ConfigSchema.Info> {
  return loadConfigFileWithSchema(filepath, ConfigSchema.Info)
}

export function loadProjectConfigFile(filepath: string): Promise<ConfigSchema.ProjectInfo> {
  return loadConfigFileWithSchema(filepath, ConfigSchema.ProjectInfo)
}

export function loadConfigText(
  text: string,
  options: { path: string } | { dir: string; source: string },
): Promise<ConfigSchema.Info> {
  return loadConfigTextWithSchema(text, options, ConfigSchema.Info)
}

export function parseConfigText(text: string, filepath: string): ConfigSchema.Info {
  return parseConfigTextWithSchema(text, filepath, ConfigSchema.Info)
}

export function parseProjectConfigText(
  text: string,
  filepath: string,
): ConfigSchema.ProjectInfo {
  return parseConfigTextWithSchema(text, filepath, ConfigSchema.ProjectInfo)
}

export function patchJsoncDocument(
  input: string,
  patch: unknown,
  patchPath: string[] = [],
): string {
  if (!isRecord(patch)) {
    const edits = modify(input, patchPath, patch, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    return applyEdits(input, edits)
  }

  return Object.entries(patch).reduce((result, [key, value]) => {
    if (value === undefined) return result
    return patchJsoncDocument(result, value, [...patchPath, key])
  }, input)
}

function parseJsoncValue(text: string): unknown {
  const errors: JsoncParseError[] = []
  const value = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    throw new JsonError({
      path: "<inline>",
      message: formatParseErrors(text, errors),
    })
  }
  return value
}

export function replaceJsoncDocument(
  input: string,
  nextValue: unknown,
  patchPath: string[] = [],
): string {
  const currentValue = patchPath.length === 0 ? parseJsoncValue(input) : undefined
  return replaceJsoncDocumentValue(input, currentValue, nextValue, patchPath)
}

function replaceJsoncDocumentValue(
  input: string,
  currentValue: unknown,
  nextValue: unknown,
  patchPath: string[],
): string {
  if (!isRecord(nextValue)) {
    const edits = modify(input, patchPath, nextValue, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    return applyEdits(input, edits)
  }

  const currentRecord = isRecord(currentValue) ? currentValue : {}
  let result = input

  for (const key of Object.keys(currentRecord)) {
    if (key in nextValue) {
      continue
    }

    const edits = modify(result, [...patchPath, key], undefined, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    result = applyEdits(result, edits)
  }

  for (const [key, value] of Object.entries(nextValue)) {
    result = replaceJsoncDocumentValue(result, currentRecord[key], value, [...patchPath, key])
  }

  return result
}
