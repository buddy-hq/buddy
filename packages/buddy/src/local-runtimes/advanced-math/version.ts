import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const RUNTIME_SOURCE_RELATIVE_PATH = "runtime/main.py"
const RUNTIME_BUILD_SCRIPT_RELATIVE_PATH = "../../../script/build-advanced-math-runtime.ts"
const RUNTIME_VERSION_BASE = "0.0.1"
const RUNTIME_VERSION_SEPARATOR = "-"
const RUNTIME_HASH_LENGTH = 12
const VERSION_INPUT_BLOCK_SEPARATOR = "\n\n"
const WINDOWS_LINE_ENDING = /\r\n/g
const UNIX_LINE_ENDING = "\n"
export const BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE =
  "BUDDY_ADVANCED_MATH_RUNTIME_BUNDLED_VERSION"
export const BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_SENTINEL =
  "__BUDDY_ADVANCED_MATH_RUNTIME_VERSION__"
export const ADVANCED_MATH_VERSION_OVERRIDE_ENV = "BUDDY_ADVANCED_MATH_VERSION"
declare const BUDDY_ADVANCED_MATH_RUNTIME_BUNDLED_VERSION: string | undefined

type RuntimeVersionInput = {
  id: string
  relativePath: string
}

const RUNTIME_VERSION_INPUTS: readonly RuntimeVersionInput[] = [
  {
    id: "runtime",
    relativePath: RUNTIME_SOURCE_RELATIVE_PATH,
  },
  {
    id: "build-script",
    relativePath: RUNTIME_BUILD_SCRIPT_RELATIVE_PATH,
  },
]

let cachedRuntimeVersion: string | undefined

function readVersionOverride() {
  const override = process.env[ADVANCED_MATH_VERSION_OVERRIDE_ENV]?.trim()
  return override && override.length > 0 ? override : undefined
}

function readBundledVersion() {
  if (typeof BUDDY_ADVANCED_MATH_RUNTIME_BUNDLED_VERSION !== "string") {
    return undefined
  }
  const bundled = BUDDY_ADVANCED_MATH_RUNTIME_BUNDLED_VERSION.trim()
  if (bundled.length === 0 || bundled === BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_SENTINEL) {
    return undefined
  }
  return bundled
}

function runtimeHash(content: string) {
  return createHash("sha256").update(content).digest("hex").slice(0, RUNTIME_HASH_LENGTH)
}

function versionInputPath(input: RuntimeVersionInput) {
  return path.resolve(import.meta.dir, input.relativePath)
}

function normalizeInputContent(content: string) {
  return content.replace(WINDOWS_LINE_ENDING, UNIX_LINE_ENDING)
}

function readVersionInputs() {
  return RUNTIME_VERSION_INPUTS.map((input) => {
    const filepath = versionInputPath(input)
    const content = fs.readFileSync(filepath, "utf8")
    return `${input.id}:${input.relativePath}${VERSION_INPUT_BLOCK_SEPARATOR}${normalizeInputContent(content)}`
  }).join(VERSION_INPUT_BLOCK_SEPARATOR)
}

function versionInputsExist() {
  return RUNTIME_VERSION_INPUTS.every((input) => fs.existsSync(versionInputPath(input)))
}

export function computeAdvancedMathRuntimeVersion() {
  const content = readVersionInputs()
  const hash = runtimeHash(content)
  return `${RUNTIME_VERSION_BASE}${RUNTIME_VERSION_SEPARATOR}${hash}`
}

export function resolveAdvancedMathRuntimeVersion() {
  const override = readVersionOverride()
  if (override) return override

  const bundled = readBundledVersion()
  if (bundled) return bundled

  if (cachedRuntimeVersion) return cachedRuntimeVersion

  cachedRuntimeVersion = versionInputsExist()
    ? computeAdvancedMathRuntimeVersion()
    : RUNTIME_VERSION_BASE
  return cachedRuntimeVersion
}
