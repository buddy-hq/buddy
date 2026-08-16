import { z } from "zod"
import createIndigoRuntime from "indigo-ketcher/binaryWasm"
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

const indigoSemanticFormatSchema = z.enum(["smiles", "ket"])
const indigoRenderRequestSchema = z.object({
  type: z.literal("render"),
  requestID: z.string(),
  source: z.string(),
  format: indigoSemanticFormatSchema,
})
const indigoWarningTableSchema = z.record(z.string(), z.string())

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
    runtimePromise = createIndigoRuntime().catch((error) => {
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
    const parsed = indigoWarningTableSchema.safeParse(JSON.parse(value))
    if (parsed.success) {
      return normalizeWarnings(Object.values(parsed.data))
    }
  } catch {
    // Some Indigo builds return a plain warning string.
  }
  return normalizeWarnings([value])
}

function normalizeWarnings(values: readonly string[]): string[] {
  return values
    .flatMap((warning) => (warning.trim() ? [warning.trim()] : []))
    .slice(0, MAX_INDIGO_WARNINGS)
    .map((warning) => warning.slice(0, MAX_INDIGO_WARNING_CHARACTERS))
}

export function indigoErrorMessage(error: Error): string {
  const message = error.message.trim() || "Indigo could not render this chemistry source."
  return message.slice(0, MAX_INDIGO_ERROR_CHARACTERS)
}

export function indigoErrorCode(error: Error): IndigoRenderErrorCode {
  return error instanceof IndigoRenderError ? error.code : "indigo_render_failed"
}

export function parseIndigoWorkerMessage(event: MessageEvent): IndigoWorkerRenderRequest | undefined {
  const parsed = indigoRenderRequestSchema.safeParse(event.data)
  return parsed.success ? parsed.data : undefined
}

export async function renderWithIndigo(
  request: IndigoWorkerRenderRequest,
): Promise<IndigoWorkerRenderSuccess> {
  let runtime: IndigoRuntime
  try {
    runtime = await loadIndigoRuntime()
  } catch (error) {
    throw new IndigoRenderError(
      "indigo_runtime_unavailable",
      indigoErrorMessage(
        error instanceof Error
          ? error
          : new Error("Indigo could not render this chemistry source."),
      ),
      {
        cause: error,
      },
    )
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
    throw new IndigoRenderError(
      "invalid_source",
      indigoErrorMessage(
        error instanceof Error
          ? error
          : new Error("Indigo could not render this chemistry source."),
      ),
      {
        cause: error,
      },
    )
  } finally {
    validationOptions.delete()
    renderOptions?.delete()
  }
}
