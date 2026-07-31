#!/usr/bin/env bun

import {
  cancel,
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts"
import { access, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, parse, relative, resolve } from "node:path"

const FFMPEG_EXECUTABLE = "ffmpeg"
const IMAGEMAGICK_EXECUTABLE = "magick"
const REMBG_EXECUTABLE = "rembg"
const DEFAULT_MODE = "chroma"
const DEFAULT_OPERATION = "background"
const DEFAULT_OUTPUT_DIRECTORY = "assets/processed"
const DEFAULT_OUTPUT_FORMAT = "png"
const DEFAULT_RESIZE_DIMENSION = 256
const DEFAULT_NORMALIZE_DIMENSION = 400
const DEFAULT_KEY_COLOR = "0x00FF00"
const DEFAULT_SIMILARITY = 0.16
const DEFAULT_BLEND = 0.04
const DEFAULT_REMBG_MODEL = "birefnet-general"
const DEFAULT_WEBP_QUALITY = 90
const DESPILL_MIX = 0.5
const DESPILL_EXPAND = 0
const TRANSPARENT_OUTPUT_SUFFIX = "-no-bg"
const INTERMEDIATE_BACKGROUND_FILENAME = "background-removed.png"
const TEMPORARY_DIRECTORY_PREFIX = "buddy-image-process-"
const MINIMUM_COLOR_COMPONENT = 0
const MAXIMUM_COLOR_COMPONENT = 1
const MINIMUM_IMAGE_DIMENSION = 1
const MAXIMUM_IMAGE_DIMENSION = 16_384
const MINIMUM_WEBP_QUALITY = 1
const MAXIMUM_WEBP_QUALITY = 100
const KEY_COLOR_PATTERN = /^0x[\dA-F]{6}$/iu
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/u
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
])
const STANDARD_RESIZE_DIMENSIONS = [128, 256, 512, 1024] as const

const USAGE = `Usage:
  bun run assets:remove-background
  bun run assets:remove-background -- --input <file-or-directory> --output <directory> [options]

Running with no options opens the interactive asset processor.

Options:
  --input <path>        Source image or directory. Repeat to process multiple sources.
  --output <directory>  Directory for processed images.
  --operation <value>   "background" (default), "resize", or "both".
  --resize <pixels>     Maximum output side length. Preserves aspect ratio and never upscales.
  --normalize <pixels>  Fit visible content within this size and center it on the canvas.
  --format <value>      "png" (default) or "webp".
  --quality <value>     WebP quality from 1 to 100 (default: ${DEFAULT_WEBP_QUALITY}).
  --mode <value>        "chroma" (default) uses ffmpeg green-screen keying and despill.
                        "model" uses rembg with ${DEFAULT_REMBG_MODEL} and alpha matting.
  --key-color <color>   Chroma key color as 0xRRGGBB (default: ${DEFAULT_KEY_COLOR}).
  --similarity <value>  Chroma color tolerance from 0 to 1 (default: ${DEFAULT_SIMILARITY}).
  --blend <value>       Chroma edge softness from 0 to 1 (default: ${DEFAULT_BLEND}).
  --overwrite           Replace existing output files.
  --dry-run             Print planned conversions without running a processor.
  --interactive         Open the interactive processor.
  --help                Show this message.

Examples:
  bun run assets:remove-background
  bun run assets:remove-background -- --input assets/raw/mascot/raw --output assets/mascot
  bun run assets:remove-background -- --operation resize --resize 256 --format webp --input assets/mascot --output assets/skills
  bun run assets:remove-background -- --operation both --resize 512 --format webp --input /path/to/images --output assets/skills
  bun run assets:remove-background -- --operation both --resize 512 --normalize 400 --format webp --input /path/to/images --output assets/skills
`

export type RemovalMode = "chroma" | "model"
export type ProcessingOperation = "background" | "resize" | "both"
export type OutputFormat = "png" | "webp"

export type ImageProcessingOptions = {
  blend: number
  dryRun: boolean
  inputPaths: string[]
  keyColor: string
  mode: RemovalMode
  normalizeDimension: number | undefined
  operation: ProcessingOperation
  outputDirectory: string
  outputFormat: OutputFormat
  overwrite: boolean
  resizeDimension: number | undefined
  similarity: number
  webpQuality: number
}

type ParsedCommand =
  | { kind: "help" }
  | { kind: "interactive" }
  | {
      kind: "run"
      options: ImageProcessingOptions
    }

type ImageConversion = {
  inputPath: string
  outputPath: string
}

function requiredValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }

  return value
}

function parseUnitInterval(value: string, flag: string): number {
  const parsed = Number(value)
  if (
    !Number.isFinite(parsed) ||
    parsed < MINIMUM_COLOR_COMPONENT ||
    parsed > MAXIMUM_COLOR_COMPONENT
  ) {
    throw new Error(`${flag} must be a number from 0 to 1`)
  }

  return parsed
}

function parsePositiveInteger(
  value: string,
  flag: string,
  minimum: number,
  maximum: number,
): number {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    throw new Error(`${flag} must be a whole number from ${minimum} to ${maximum}`)
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be a whole number from ${minimum} to ${maximum}`)
  }

  return parsed
}

function parseRemovalMode(value: string): RemovalMode {
  if (value === "chroma" || value === "model") return value
  throw new Error('--mode must be either "chroma" or "model"')
}

function parseOperation(value: string): ProcessingOperation {
  if (value === "background" || value === "resize" || value === "both") return value
  throw new Error('--operation must be "background", "resize", or "both"')
}

function parseOutputFormat(value: string): OutputFormat {
  if (value === "png" || value === "webp") return value
  throw new Error('--format must be either "png" or "webp"')
}

function parseKeyColor(value: string): string {
  const normalized = value.toUpperCase()
  if (!KEY_COLOR_PATTERN.test(normalized)) {
    throw new Error("--key-color must use the 0xRRGGBB format")
  }

  return normalized
}

function requiresBackgroundRemoval(operation: ProcessingOperation): boolean {
  return operation === "background" || operation === "both"
}

function requiresResize(operation: ProcessingOperation): boolean {
  return operation === "resize" || operation === "both"
}

function resolveOperation(
  operation: ProcessingOperation | undefined,
  resizeDimension: number | undefined,
  hasBackgroundSettings: boolean,
): ProcessingOperation {
  if (operation) return operation
  if (resizeDimension === undefined) return DEFAULT_OPERATION
  return hasBackgroundSettings ? "both" : "resize"
}

function validateProcessingOptions(options: ImageProcessingOptions): void {
  const removesBackground = requiresBackgroundRemoval(options.operation)
  const resizes = requiresResize(options.operation)

  if (resizes && options.resizeDimension === undefined) {
    throw new Error(`--operation ${options.operation} requires --resize <pixels>`)
  }
  if (!resizes && options.resizeDimension !== undefined) {
    throw new Error('--resize requires --operation "resize" or "both"')
  }
  if (
    options.normalizeDimension !== undefined &&
    options.resizeDimension !== undefined &&
    options.normalizeDimension > options.resizeDimension
  ) {
    throw new Error("--normalize cannot exceed --resize")
  }
  if (!removesBackground && options.mode !== DEFAULT_MODE) {
    throw new Error("--mode is only valid when removing a background")
  }
}

export function parseArguments(args: string[]): ParsedCommand {
  if (args.length === 0) return { kind: "interactive" }

  const inputPaths: string[] = []
  let outputDirectory: string | undefined
  let operation: ProcessingOperation | undefined
  let outputFormat: OutputFormat = DEFAULT_OUTPUT_FORMAT
  let resizeDimension: number | undefined
  let mode: RemovalMode = DEFAULT_MODE
  let normalizeDimension: number | undefined
  let keyColor = DEFAULT_KEY_COLOR
  let similarity = DEFAULT_SIMILARITY
  let blend = DEFAULT_BLEND
  let webpQuality = DEFAULT_WEBP_QUALITY
  let overwrite = false
  let dryRun = false
  let hasBackgroundSettings = false
  let interactive = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === "--help") return { kind: "help" }
    if (argument === "--interactive") {
      interactive = true
      continue
    }
    if (argument === "--overwrite") {
      overwrite = true
      continue
    }
    if (argument === "--dry-run") {
      dryRun = true
      continue
    }
    if (argument === "--input") {
      inputPaths.push(requiredValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--output") {
      outputDirectory = requiredValue(args, index, argument)
      index += 1
      continue
    }
    if (argument === "--operation") {
      operation = parseOperation(requiredValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--resize") {
      resizeDimension = parsePositiveInteger(
        requiredValue(args, index, argument),
        argument,
        MINIMUM_IMAGE_DIMENSION,
        MAXIMUM_IMAGE_DIMENSION,
      )
      index += 1
      continue
    }
    if (argument === "--normalize") {
      normalizeDimension = parsePositiveInteger(
        requiredValue(args, index, argument),
        argument,
        MINIMUM_IMAGE_DIMENSION,
        MAXIMUM_IMAGE_DIMENSION,
      )
      index += 1
      continue
    }
    if (argument === "--format") {
      outputFormat = parseOutputFormat(requiredValue(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--quality") {
      webpQuality = parsePositiveInteger(
        requiredValue(args, index, argument),
        argument,
        MINIMUM_WEBP_QUALITY,
        MAXIMUM_WEBP_QUALITY,
      )
      index += 1
      continue
    }
    if (argument === "--mode") {
      mode = parseRemovalMode(requiredValue(args, index, argument))
      hasBackgroundSettings = true
      index += 1
      continue
    }
    if (argument === "--key-color") {
      keyColor = parseKeyColor(requiredValue(args, index, argument))
      hasBackgroundSettings = true
      index += 1
      continue
    }
    if (argument === "--similarity") {
      similarity = parseUnitInterval(requiredValue(args, index, argument), argument)
      hasBackgroundSettings = true
      index += 1
      continue
    }
    if (argument === "--blend") {
      blend = parseUnitInterval(requiredValue(args, index, argument), argument)
      hasBackgroundSettings = true
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  if (interactive) {
    if (args.length !== 1) {
      throw new Error("--interactive cannot be combined with other options")
    }
    return { kind: "interactive" }
  }
  if (inputPaths.length === 0) {
    throw new Error("At least one --input path is required")
  }
  if (!outputDirectory) {
    throw new Error("--output is required")
  }

  const options: ImageProcessingOptions = {
    blend,
    dryRun,
    inputPaths,
    keyColor,
    mode,
    normalizeDimension,
    operation: resolveOperation(operation, resizeDimension, hasBackgroundSettings),
    outputDirectory,
    outputFormat,
    overwrite,
    resizeDimension,
    similarity,
    webpQuality,
  }
  validateProcessingOptions(options)

  return { kind: "run", options }
}

function isSupportedImage(pathname: string): boolean {
  return SUPPORTED_IMAGE_EXTENSIONS.has(extname(pathname).toLowerCase())
}

async function collectDirectoryImages(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const images: string[] = []

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      images.push(...(await collectDirectoryImages(entryPath)))
      continue
    }
    if (entry.isFile() && isSupportedImage(entryPath)) {
      images.push(entryPath)
    }
  }

  return images
}

function outputSuffix(options: ImageProcessingOptions): string {
  if (options.operation === "background") return TRANSPARENT_OUTPUT_SUFFIX
  if (options.resizeDimension === undefined) {
    throw new Error(`Missing resize dimension for ${options.operation} operation`)
  }

  const resizeSuffix = `-${options.resizeDimension}`
  return options.operation === "resize"
    ? resizeSuffix
    : `${TRANSPARENT_OUTPUT_SUFFIX}${resizeSuffix}`
}

function outputPathFor(
  sourceRelativePath: string,
  outputDirectory: string,
  options: ImageProcessingOptions,
): string {
  const parsed = parse(sourceRelativePath)
  return join(
    outputDirectory,
    dirname(sourceRelativePath),
    `${parsed.name}${outputSuffix(options)}.${options.outputFormat}`,
  )
}

async function collectConversions(options: ImageProcessingOptions): Promise<ImageConversion[]> {
  const outputDirectory = resolve(options.outputDirectory)
  const conversions: ImageConversion[] = []

  for (const inputPath of options.inputPaths) {
    const resolvedInputPath = resolve(inputPath)
    const inputStat = await stat(resolvedInputPath).catch(() => undefined)
    if (!inputStat) {
      throw new Error(`Input path does not exist: ${resolvedInputPath}`)
    }

    if (inputStat.isDirectory()) {
      const imagePaths = await collectDirectoryImages(resolvedInputPath)
      for (const imagePath of imagePaths) {
        conversions.push({
          inputPath: imagePath,
          outputPath: outputPathFor(
            relative(resolvedInputPath, imagePath),
            outputDirectory,
            options,
          ),
        })
      }
      continue
    }

    if (!inputStat.isFile() || !isSupportedImage(resolvedInputPath)) {
      throw new Error(`Unsupported image input: ${resolvedInputPath}`)
    }
    conversions.push({
      inputPath: resolvedInputPath,
      outputPath: outputPathFor(basename(resolvedInputPath), outputDirectory, options),
    })
  }

  if (conversions.length === 0) {
    throw new Error("No supported image files were found in the supplied input paths")
  }

  const sourcesByOutputPath = new Map<string, string>()
  for (const conversion of conversions) {
    const previousSource = sourcesByOutputPath.get(conversion.outputPath)
    if (previousSource) {
      throw new Error(
        `Multiple source images would write to ${conversion.outputPath}: ${previousSource} and ${conversion.inputPath}`,
      )
    }
    sourcesByOutputPath.set(conversion.outputPath, conversion.inputPath)
  }

  return conversions
}

async function assertOutputsAreAvailable(
  conversions: ImageConversion[],
  overwrite: boolean,
): Promise<void> {
  if (overwrite) return

  for (const conversion of conversions) {
    const outputExists = await access(conversion.outputPath)
      .then(() => true)
      .catch(() => false)
    if (outputExists) {
      throw new Error(
        `Output already exists: ${conversion.outputPath}. Pass --overwrite to replace it.`,
      )
    }
  }
}

export function buildChromaFilter(
  options: Pick<ImageProcessingOptions, "blend" | "keyColor" | "similarity">,
): string {
  const keyColorValue = Number.parseInt(options.keyColor.slice(2), 16)
  const green = (keyColorValue >> 8) & 0xff
  const blue = keyColorValue & 0xff
  const despillColor = blue > green ? "blue" : "green"

  return [
    `colorkey=${options.keyColor}:${options.similarity}:${options.blend}`,
    `despill=${despillColor}:mix=${DESPILL_MIX}:expand=${DESPILL_EXPAND}`,
  ].join(",")
}

function ffmpegCommand(
  inputPath: string,
  outputPath: string,
  options: ImageProcessingOptions,
): string[] {
  return [
    FFMPEG_EXECUTABLE,
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-vf",
    buildChromaFilter(options),
    "-frames:v",
    "1",
    "-update",
    "1",
    "-c:v",
    "png",
    "-pix_fmt",
    "rgba",
    outputPath,
  ]
}

function rembgCommand(inputPath: string, outputPath: string): string[] {
  return [REMBG_EXECUTABLE, "i", "-m", DEFAULT_REMBG_MODEL, "-a", inputPath, outputPath]
}

function imagemagickCommand(
  inputPath: string,
  outputPath: string,
  options: ImageProcessingOptions,
): string[] {
  const output = options.outputFormat === "png" ? `PNG32:${outputPath}` : `WEBP:${outputPath}`
  const command = [IMAGEMAGICK_EXECUTABLE, inputPath, "-strip"]

  if (options.resizeDimension !== undefined) {
    command.push("-resize", `${options.resizeDimension}x${options.resizeDimension}>`)
  }
  if (options.normalizeDimension !== undefined) {
    command.push(
      "-set",
      "option:normalization-canvas",
      "%wx%h",
      "-trim",
      "+repage",
      "-resize",
      `${options.normalizeDimension}x${options.normalizeDimension}`,
      "-gravity",
      "center",
      "-background",
      "none",
      "-extent",
      "%[normalization-canvas]",
    )
  }
  if (options.outputFormat === "webp") {
    command.push("-quality", String(options.webpQuality))
  }

  command.push(output)
  return command
}

function requiredExecutable(mode: RemovalMode): string {
  return mode === "chroma" ? FFMPEG_EXECUTABLE : REMBG_EXECUTABLE
}

function assertExecutableIsInstalled(executable: string, installHint: string): void {
  if (Bun.which(executable)) return
  throw new Error(`Missing ${executable}. ${installHint}`)
}

function requiresImageMagick(options: ImageProcessingOptions): boolean {
  return (
    requiresResize(options.operation) ||
    options.normalizeDimension !== undefined ||
    options.outputFormat === "webp"
  )
}

function assertProcessorsAreInstalled(options: ImageProcessingOptions): void {
  if (requiresBackgroundRemoval(options.operation)) {
    const executable = requiredExecutable(options.mode)
    assertExecutableIsInstalled(
      executable,
      options.mode === "chroma"
        ? "Install ffmpeg, then rerun this command."
        : 'Install it with: pip install "rembg[cpu,cli]"',
    )
  }
  if (requiresImageMagick(options)) {
    assertExecutableIsInstalled(
      IMAGEMAGICK_EXECUTABLE,
      "Install ImageMagick, then rerun this command.",
    )
  }
}

async function runCommand(command: string[]): Promise<void> {
  const subprocess = Bun.spawn({
    cmd: command,
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  })
  const exitCode = await subprocess.exited
  if (exitCode !== 0) {
    throw new Error(`Image processor exited with code ${exitCode}`)
  }
}

async function removeBackground(
  inputPath: string,
  outputPath: string,
  options: ImageProcessingOptions,
): Promise<void> {
  const command =
    options.mode === "chroma"
      ? ffmpegCommand(inputPath, outputPath, options)
      : rembgCommand(inputPath, outputPath)
  await runCommand(command)
}

async function processConversion(
  conversion: ImageConversion,
  options: ImageProcessingOptions,
): Promise<void> {
  await mkdir(dirname(conversion.outputPath), { recursive: true })

  if (!requiresImageMagick(options)) {
    await removeBackground(conversion.inputPath, conversion.outputPath, options)
    return
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX))
  try {
    const processingInputPath = requiresBackgroundRemoval(options.operation)
      ? join(temporaryDirectory, INTERMEDIATE_BACKGROUND_FILENAME)
      : conversion.inputPath

    if (requiresBackgroundRemoval(options.operation)) {
      await removeBackground(conversion.inputPath, processingInputPath, options)
    }
    await runCommand(imagemagickCommand(processingInputPath, conversion.outputPath, options))
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

function operationLabel(operation: ProcessingOperation): string {
  switch (operation) {
    case "background":
      return "Remove backgrounds"
    case "resize":
      return "Resize images"
    case "both":
      return "Remove backgrounds, then resize"
  }
}

function formatLabel(outputFormat: OutputFormat): string {
  return outputFormat === "png" ? "PNG (lossless)" : "WebP (smaller package assets)"
}

function cancelInteractiveProcessing(): undefined {
  cancel("Image processing cancelled.")
  return undefined
}

function validateRequiredText(value: string | undefined, label: string): string | undefined {
  return value?.trim() ? undefined : `${label} is required`
}

function validateResizeDimension(value: string | undefined): string | undefined {
  if (!value) return "Maximum side length is required"
  try {
    parsePositiveInteger(
      value,
      "Maximum side length",
      MINIMUM_IMAGE_DIMENSION,
      MAXIMUM_IMAGE_DIMENSION,
    )
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid maximum side length"
  }
}

async function promptForResizeDimension(): Promise<number | undefined> {
  const selected = await select<number | "custom">({
    message: "Maximum output side length",
    initialValue: DEFAULT_RESIZE_DIMENSION,
    options: [
      ...STANDARD_RESIZE_DIMENSIONS.map((dimension) => ({
        value: dimension,
        label: `${dimension} px`,
      })),
      { value: "custom", label: "Custom size" },
    ],
  })
  if (isCancel(selected)) return cancelInteractiveProcessing()
  if (selected !== "custom") return selected

  const customValue = await text({
    message: "Maximum output side length in pixels",
    validate: validateResizeDimension,
  })
  if (isCancel(customValue)) return cancelInteractiveProcessing()
  return parsePositiveInteger(
    customValue,
    "Maximum side length",
    MINIMUM_IMAGE_DIMENSION,
    MAXIMUM_IMAGE_DIMENSION,
  )
}

async function promptForNormalizeDimension(
  resizeDimension: number | undefined,
): Promise<number | null | undefined> {
  const shouldNormalize = await confirm({
    message: "Normalize visible content size and center it?",
    initialValue: false,
  })
  if (isCancel(shouldNormalize)) {
    cancel("Image processing cancelled.")
    return null
  }
  if (!shouldNormalize) return undefined

  const maximum = resizeDimension ?? MAXIMUM_IMAGE_DIMENSION
  const defaultValue = Math.min(DEFAULT_NORMALIZE_DIMENSION, maximum)
  const value = await text({
    message: "Maximum visible content size in pixels",
    defaultValue: String(defaultValue),
    validate: (candidate) => {
      try {
        parsePositiveInteger(
          candidate ?? "",
          "Visible content size",
          MINIMUM_IMAGE_DIMENSION,
          maximum,
        )
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid visible content size"
      }
    },
  })
  if (isCancel(value)) {
    cancel("Image processing cancelled.")
    return null
  }
  return parsePositiveInteger(value, "Visible content size", MINIMUM_IMAGE_DIMENSION, maximum)
}

async function promptForChromaSettings(): Promise<
  Pick<ImageProcessingOptions, "blend" | "keyColor" | "similarity"> | undefined
> {
  const shouldTune = await confirm({
    message: "Tune chroma key edge settings?",
    initialValue: false,
  })
  if (isCancel(shouldTune)) return cancelInteractiveProcessing()
  if (!shouldTune) {
    return {
      blend: DEFAULT_BLEND,
      keyColor: DEFAULT_KEY_COLOR,
      similarity: DEFAULT_SIMILARITY,
    }
  }

  const keyColor = await text({
    message: "Key color",
    defaultValue: DEFAULT_KEY_COLOR,
    validate: (value) => {
      try {
        parseKeyColor(value ?? "")
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid key color"
      }
    },
  })
  if (isCancel(keyColor)) return cancelInteractiveProcessing()

  const similarity = await text({
    message: "Color tolerance (0 to 1)",
    defaultValue: String(DEFAULT_SIMILARITY),
    validate: (value) => {
      try {
        parseUnitInterval(value ?? "", "Color tolerance")
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid color tolerance"
      }
    },
  })
  if (isCancel(similarity)) return cancelInteractiveProcessing()

  const blend = await text({
    message: "Edge softness (0 to 1)",
    defaultValue: String(DEFAULT_BLEND),
    validate: (value) => {
      try {
        parseUnitInterval(value ?? "", "Edge softness")
        return undefined
      } catch (error) {
        return error instanceof Error ? error.message : "Invalid edge softness"
      }
    },
  })
  if (isCancel(blend)) return cancelInteractiveProcessing()

  return {
    blend: parseUnitInterval(blend, "Edge softness"),
    keyColor: parseKeyColor(keyColor),
    similarity: parseUnitInterval(similarity, "Color tolerance"),
  }
}

async function promptForProcessingOptions(): Promise<ImageProcessingOptions | undefined> {
  intro("Buddy asset processor")

  const operation = await select<ProcessingOperation>({
    message: "What should this run do?",
    initialValue: DEFAULT_OPERATION,
    options: [
      {
        value: "background",
        label: "Remove background",
        hint: "Keep the original dimensions",
      },
      {
        value: "resize",
        label: "Resize only",
        hint: "Preserves aspect ratio and transparency",
      },
      {
        value: "both",
        label: "Remove background and resize",
        hint: "Removes the matte before scaling down",
      },
    ],
  })
  if (isCancel(operation)) return cancelInteractiveProcessing()

  const inputPath = await text({
    message: "Source image or folder",
    placeholder: "assets/raw/mascot/raw",
    validate: (value) => validateRequiredText(value, "Source path"),
  })
  if (isCancel(inputPath)) return cancelInteractiveProcessing()

  const outputDirectory = await text({
    message: "Output folder",
    defaultValue: DEFAULT_OUTPUT_DIRECTORY,
    validate: (value) => validateRequiredText(value, "Output folder"),
  })
  if (isCancel(outputDirectory)) return cancelInteractiveProcessing()

  const outputFormat = await select<OutputFormat>({
    message: "Output format",
    initialValue: DEFAULT_OUTPUT_FORMAT,
    options: [
      { value: "png", label: formatLabel("png") },
      { value: "webp", label: formatLabel("webp") },
    ],
  })
  if (isCancel(outputFormat)) return cancelInteractiveProcessing()

  const resizeDimension = requiresResize(operation) ? await promptForResizeDimension() : undefined
  if (requiresResize(operation) && resizeDimension === undefined) return undefined
  const normalizeDimension = await promptForNormalizeDimension(resizeDimension)
  if (normalizeDimension === null) return undefined

  let mode: RemovalMode = DEFAULT_MODE
  let chromaSettings: Pick<ImageProcessingOptions, "blend" | "keyColor" | "similarity"> = {
    blend: DEFAULT_BLEND,
    keyColor: DEFAULT_KEY_COLOR,
    similarity: DEFAULT_SIMILARITY,
  }
  if (requiresBackgroundRemoval(operation)) {
    const selectedMode = await select<RemovalMode>({
      message: "Background removal method",
      initialValue: DEFAULT_MODE,
      options: [
        {
          value: "chroma",
          label: "Chroma key",
          hint: "Fast; best for uniform green or blue backgrounds",
        },
        {
          value: "model",
          label: "AI model",
          hint: "For ordinary backgrounds; requires rembg",
        },
      ],
    })
    if (isCancel(selectedMode)) return cancelInteractiveProcessing()
    mode = selectedMode

    if (mode === "chroma") {
      const promptedSettings = await promptForChromaSettings()
      if (!promptedSettings) return undefined
      chromaSettings = promptedSettings
    }
  }

  let webpQuality = DEFAULT_WEBP_QUALITY
  if (outputFormat === "webp") {
    const quality = await text({
      message: "WebP quality",
      defaultValue: String(DEFAULT_WEBP_QUALITY),
      validate: (value) => {
        try {
          parsePositiveInteger(
            value ?? "",
            "WebP quality",
            MINIMUM_WEBP_QUALITY,
            MAXIMUM_WEBP_QUALITY,
          )
          return undefined
        } catch (error) {
          return error instanceof Error ? error.message : "Invalid WebP quality"
        }
      },
    })
    if (isCancel(quality)) return cancelInteractiveProcessing()
    webpQuality = parsePositiveInteger(
      quality,
      "WebP quality",
      MINIMUM_WEBP_QUALITY,
      MAXIMUM_WEBP_QUALITY,
    )
  }

  const overwrite = await confirm({
    message: "Replace existing output files?",
    initialValue: false,
  })
  if (isCancel(overwrite)) return cancelInteractiveProcessing()

  const options: ImageProcessingOptions = {
    blend: chromaSettings.blend,
    dryRun: false,
    inputPaths: [inputPath],
    keyColor: chromaSettings.keyColor,
    mode,
    normalizeDimension,
    operation,
    outputDirectory,
    outputFormat,
    overwrite,
    resizeDimension,
    similarity: chromaSettings.similarity,
    webpQuality,
  }
  validateProcessingOptions(options)

  note(
    [
      `Action: ${operationLabel(options.operation)}`,
      `Input: ${options.inputPaths[0]}`,
      `Output: ${options.outputDirectory}`,
      `Format: ${formatLabel(options.outputFormat)}`,
      ...(options.resizeDimension ? [`Maximum side: ${options.resizeDimension} px`] : []),
      ...(options.normalizeDimension
        ? [`Visible content: ${options.normalizeDimension} px, centered`]
        : []),
    ].join("\n"),
    "Ready to process",
  )
  const confirmed = await confirm({ message: "Process images?", initialValue: true })
  if (isCancel(confirmed)) return cancelInteractiveProcessing()
  if (!confirmed) {
    outro("No files changed.")
    return undefined
  }

  return options
}

function describeResult(options: ImageProcessingOptions, count: number): string {
  const plural = count === 1 ? "image" : "images"
  const outputKind = options.outputFormat.toUpperCase()
  return `Created ${count} processed ${plural} as ${outputKind}.`
}

async function runProcessing(
  conversions: ImageConversion[],
  options: ImageProcessingOptions,
  interactive: boolean,
): Promise<void> {
  if (!interactive) {
    for (const conversion of conversions) {
      console.log(`Processing: ${conversion.inputPath}`)
      await processConversion(conversion, options)
    }
    return
  }

  const progress = spinner()
  progress.start(`Processing ${conversions.length} image${conversions.length === 1 ? "" : "s"}`)
  try {
    for (const conversion of conversions) {
      progress.message(`Processing ${basename(conversion.inputPath)}`)
      await processConversion(conversion, options)
    }
    progress.stop("Images processed")
  } catch (error) {
    progress.stop("Image processing failed", 1)
    throw error
  }
}

async function main(): Promise<number> {
  try {
    const command = parseArguments(process.argv.slice(2))
    if (command.kind === "help") {
      console.log(USAGE)
      return 0
    }

    let interactive = false
    let options: ImageProcessingOptions | undefined
    if (command.kind === "interactive") {
      interactive = true
      options = await promptForProcessingOptions()
    } else {
      options = command.options
    }
    if (!options) return 0

    const conversions = await collectConversions(options)
    await assertOutputsAreAvailable(conversions, options.overwrite)

    if (options.dryRun) {
      for (const conversion of conversions) {
        console.log(`${conversion.inputPath} -> ${conversion.outputPath}`)
      }
      return 0
    }

    assertProcessorsAreInstalled(options)
    await runProcessing(conversions, options, interactive)
    if (interactive) {
      outro(describeResult(options, conversions.length))
    } else {
      console.log(describeResult(options, conversions.length))
    }
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Image processing failed: ${message}`)
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = await main()
}
