import createIndigoRuntime from "indigo-ketcher"
import type {
  IndigoWorkerRenderFailure,
  IndigoWorkerRenderRequest,
  IndigoWorkerRenderSuccess,
} from "./worker-protocol"

const INDIGO_VALIDATION_CHECKS = [
  "valence",
  "stereo",
  "overlapping_atoms",
  "overlapping_bonds",
] as const
const INDIGO_RENDER_OPTIONS = {
  "render-coloring": "true",
  "render-output-format": "svg",
} as const
const MAX_RENDERED_SVG_BYTES = 4 * 1024 * 1024
const MAX_INDIGO_WARNINGS = 16
const MAX_INDIGO_WARNING_CHARACTERS = 1_000
const MAX_INDIGO_ERROR_CHARACTERS = 2_000
const SVG_DATA_URL_PREFIX = "data:image/svg+xml;base64,"
const XML_DECLARATION_PATTERN = /^\s*<\?xml\b[\s\S]*?\?>\s*/iu
const INDIGO_SEMANTIC_FORMATS = ["smiles", "ket"] as const

type IndigoRuntime = Awaited<ReturnType<typeof createIndigoRuntime>>
type IndigoRenderErrorCode = IndigoWorkerRenderFailure["code"]

class IndigoRenderError extends Error {
  readonly code: IndigoRenderErrorCode

  constructor(code: IndigoRenderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "IndigoRenderError"
    this.code = code
  }
}

let runtimePromise: Promise<IndigoRuntime> | undefined

function loadIndigoRuntime(): Promise<IndigoRuntime> {
  if (!runtimePromise) {
    runtimePromise = createIndigoRuntime().catch((error: unknown) => {
      runtimePromise = undefined
      throw error
    })
  }
  return runtimePromise
}

function decodeSvgBase64(value: string): string {
  const encoded = value.startsWith(SVG_DATA_URL_PREFIX)
    ? value.slice(SVG_DATA_URL_PREFIX.length)
    : value
  let binary: string
  try {
    binary = atob(encoded)
  } catch (error) {
    throw new IndigoRenderError("indigo_render_failed", "Indigo returned malformed SVG data.", {
      cause: error,
    })
  }
  if (binary.length > MAX_RENDERED_SVG_BYTES) {
    throw new IndigoRenderError(
      "indigo_render_failed",
      "Rendered chemistry SVG exceeds the safe output limit.",
    )
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(XML_DECLARATION_PATTERN, "")
      .trim()
  } catch (error) {
    throw new IndigoRenderError("indigo_render_failed", "Indigo returned malformed SVG text.", {
      cause: error,
    })
  }
}

function createIndigoOptions(runtime: IndigoRuntime) {
  const options = new runtime.MapStringString()
  for (const [key, value] of Object.entries(INDIGO_RENDER_OPTIONS)) {
    options.set(key, value)
  }
  return options
}

function readWarnings(value: string): string[] {
  if (!value.trim()) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return normalizeWarnings(Object.values(parsed))
    }
  } catch {
    // Some Indigo builds return a plain warning string.
  }
  return normalizeWarnings([value])
}

function normalizeWarnings(values: readonly unknown[]): string[] {
  return values
    .flatMap((value) => (typeof value === "string" && value.trim() ? [value.trim()] : []))
    .slice(0, MAX_INDIGO_WARNINGS)
    .map((warning) => warning.slice(0, MAX_INDIGO_WARNING_CHARACTERS))
}

function isIndigoSemanticFormat(value: unknown): value is IndigoWorkerRenderRequest["format"] {
  return typeof value === "string" && INDIGO_SEMANTIC_FORMATS.some((format) => format === value)
}

export function indigoErrorMessage(error: unknown): string {
  let message: string
  if (error instanceof Error && error.message.trim()) {
    message = error.message.trim()
  } else if (typeof error === "string" && error.trim()) {
    message = error.trim()
  } else {
    message = "Indigo could not render this chemistry source."
  }
  return message.slice(0, MAX_INDIGO_ERROR_CHARACTERS)
}

export function indigoErrorCode(error: unknown): IndigoRenderErrorCode {
  return error instanceof IndigoRenderError ? error.code : "indigo_render_failed"
}

export function isIndigoRenderRequest(value: unknown): value is IndigoWorkerRenderRequest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  return (
    "type" in value &&
    value.type === "render" &&
    "requestID" in value &&
    typeof value.requestID === "string" &&
    "source" in value &&
    typeof value.source === "string" &&
    "format" in value &&
    isIndigoSemanticFormat(value.format)
  )
}

export async function renderWithIndigo(
  request: IndigoWorkerRenderRequest,
): Promise<IndigoWorkerRenderSuccess> {
  let runtime: IndigoRuntime
  try {
    runtime = await loadIndigoRuntime()
  } catch (error) {
    throw new IndigoRenderError("indigo_runtime_unavailable", indigoErrorMessage(error), {
      cause: error,
    })
  }
  const validationOptions = new runtime.MapStringString()
  let renderOptions: InstanceType<IndigoRuntime["MapStringString"]> | undefined
  try {
    renderOptions = createIndigoOptions(runtime)
    const warnings = readWarnings(
      runtime.check(request.source, INDIGO_VALIDATION_CHECKS.join(";"), validationOptions),
    )
    const encodedSvg = runtime.render(request.source, renderOptions)
    const svg = decodeSvgBase64(encodedSvg)
    if (!/^<svg(?:\s|>)/iu.test(svg)) {
      throw new IndigoRenderError(
        "indigo_render_failed",
        "Indigo returned an invalid SVG document.",
      )
    }

    return {
      type: "rendered",
      requestID: request.requestID,
      rendererVersion: runtime.version(),
      svg,
      warnings,
    }
  } catch (error) {
    if (error instanceof IndigoRenderError) throw error
    throw new IndigoRenderError("invalid_source", indigoErrorMessage(error), {
      cause: error,
    })
  } finally {
    validationOptions.delete()
    renderOptions?.delete()
  }
}
