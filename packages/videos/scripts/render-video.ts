import { mkdir, rename, rm } from "node:fs/promises"
import path from "node:path"

import { BUDDY_LAUNCH_DURATION_FRAMES } from "../src/timeline/launchTimeline"
import { BUDDY_LAUNCH_FPS, BUDDY_LAUNCH_HEIGHT_PX, BUDDY_LAUNCH_WIDTH_PX } from "../src/videoConfig"

const COMPOSITION_ID = "BuddyLaunch"
const OUTPUT_DIRECTORY = path.resolve(import.meta.dir, "../out/buddy-launch")
const PACKAGE_DIRECTORY = path.resolve(import.meta.dir, "..")

const TARGET_INTEGRATED_LUFS = -15
const TARGET_TRUE_PEAK_DBTP = -1
const TARGET_LOUDNESS_RANGE_LU = 11
const OUTPUT_AUDIO_SAMPLE_RATE_HZ = 48_000
const DELIVERY_GOP_SIZE_FRAMES = BUDDY_LAUNCH_FPS * 2
const FULL_SCALE = 1
const WHATSAPP_SCALE = 2 / 3
const PREVIEW_LAST_FRAME = 450
const FIRST_FRAME = 0
const LOUDNESS_TOLERANCE_LU = 0.25
const TRUE_PEAK_TOLERANCE_DB = 0.1
const OUTPUT_COLOR_STANDARD = "bt709"
const OUTPUT_COLOR_ARGUMENTS = [
  "-color_primaries",
  OUTPUT_COLOR_STANDARD,
  "-color_trc",
  OUTPUT_COLOR_STANDARD,
  "-colorspace",
  OUTPUT_COLOR_STANDARD,
] as const

const RENDER_TARGETS = {
  master: {
    audioBitrate: "320k",
    crf: 16,
    normalizeAudio: true,
    x264Preset: "slower",
  },
  linkedin: {
    audioBitrate: "192k",
    crf: 18,
    normalizeAudio: true,
    x264Preset: "slow",
  },
  web: {
    audioBitrate: "160k",
    crf: 20,
    gopSize: DELIVERY_GOP_SIZE_FRAMES,
    normalizeAudio: true,
    x264Preset: "slower",
  },
  whatsapp: {
    audioBitrate: "128k",
    crf: 18,
    gopSize: DELIVERY_GOP_SIZE_FRAMES,
    normalizeAudio: true,
    scale: WHATSAPP_SCALE,
    x264Preset: "slower",
  },
  preview: {
    audioBitrate: "128k",
    crf: 20,
    frames: `${FIRST_FRAME}-${PREVIEW_LAST_FRAME}`,
    gopSize: DELIVERY_GOP_SIZE_FRAMES,
    normalizeAudio: false,
    x264Preset: "veryfast",
  },
} as const

type RenderTarget = keyof typeof RENDER_TARGETS
type LoudnessMeasurement = {
  readonly input_i: string
  readonly input_lra: string
  readonly input_thresh: string
  readonly input_tp: string
  readonly target_offset: string
}

const DELIVERY_TARGETS = [
  "master",
  "linkedin",
  "web",
  "whatsapp",
] as const satisfies readonly RenderTarget[]

const textDecoder = new TextDecoder()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const hasString = (value: Record<string, unknown>, key: keyof LoudnessMeasurement): boolean =>
  typeof value[key] === "string"

const isLoudnessMeasurement = (value: unknown): value is LoudnessMeasurement =>
  isRecord(value) &&
  hasString(value, "input_i") &&
  hasString(value, "input_lra") &&
  hasString(value, "input_thresh") &&
  hasString(value, "input_tp") &&
  hasString(value, "target_offset")

const isRenderTarget = (value: string): value is RenderTarget =>
  Object.hasOwn(RENDER_TARGETS, value)

const isMissingPathError = (error: unknown): boolean => isRecord(error) && error.code === "ENOENT"

const runInherited = (command: readonly string[], label: string): void => {
  const result = Bun.spawnSync([...command], {
    cwd: PACKAGE_DIRECTORY,
    stderr: "inherit",
    stdout: "inherit",
  })

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}.`)
  }
}

const runCaptured = (command: readonly string[], label: string): string => {
  const result = Bun.spawnSync([...command], {
    cwd: PACKAGE_DIRECTORY,
    stderr: "pipe",
    stdout: "pipe",
  })
  const stderr = textDecoder.decode(result.stderr)
  const stdout = textDecoder.decode(result.stdout)

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}.\n${stderr}${stdout}`)
  }

  return `${stdout}\n${stderr}`
}

const parseLoudnessMeasurement = (output: string): LoudnessMeasurement => {
  const jsonStart = output.lastIndexOf("{")
  const jsonEnd = output.indexOf("}", jsonStart)

  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("FFmpeg did not return a loudness measurement.")
  }

  const parsed: unknown = JSON.parse(output.slice(jsonStart, jsonEnd + 1))
  if (!isLoudnessMeasurement(parsed)) {
    throw new Error("FFmpeg returned an invalid loudness measurement.")
  }

  return parsed
}

const measureLoudness = (inputPath: string): LoudnessMeasurement => {
  const output = runCaptured(
    [
      "ffmpeg",
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-af",
      `loudnorm=I=${TARGET_INTEGRATED_LUFS}:TP=${TARGET_TRUE_PEAK_DBTP}:LRA=${TARGET_LOUDNESS_RANGE_LU}:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    "Loudness analysis",
  )

  return parseLoudnessMeasurement(output)
}

const normalizeAudio = (inputPath: string, outputPath: string, audioBitrate: string): void => {
  const measurement = measureLoudness(inputPath)
  const filter = [
    `loudnorm=I=${TARGET_INTEGRATED_LUFS}`,
    `TP=${TARGET_TRUE_PEAK_DBTP}`,
    `LRA=${TARGET_LOUDNESS_RANGE_LU}`,
    `measured_I=${measurement.input_i}`,
    `measured_LRA=${measurement.input_lra}`,
    `measured_TP=${measurement.input_tp}`,
    `measured_thresh=${measurement.input_thresh}`,
    `offset=${measurement.target_offset}`,
    "linear=true",
    "print_format=summary",
  ].join(":")

  runInherited(
    [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "copy",
      "-af",
      filter,
      "-c:a",
      "aac",
      "-b:a",
      audioBitrate,
      "-ar",
      String(OUTPUT_AUDIO_SAMPLE_RATE_HZ),
      ...OUTPUT_COLOR_ARGUMENTS,
      "-movflags",
      "+faststart",
      outputPath,
    ],
    "Audio normalization",
  )
}

const finalizeWithoutAudioNormalization = (inputPath: string, outputPath: string): void => {
  runInherited(
    [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      ...OUTPUT_COLOR_ARGUMENTS,
      "-movflags",
      "+faststart",
      outputPath,
    ],
    "Media finalization",
  )
}

const verifyDecode = (inputPath: string): void => {
  runInherited(["ffmpeg", "-v", "error", "-i", inputPath, "-f", "null", "-"], "Decode verification")
}

const stringValue = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key]
  return typeof value === "string" ? value : null
}

const numberValue = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key]
  return typeof value === "number" ? value : null
}

const expectedFrameCount = (target: RenderTarget): number =>
  target === "preview" ? PREVIEW_LAST_FRAME - FIRST_FRAME + 1 : BUDDY_LAUNCH_DURATION_FRAMES

const verifyStructure = (inputPath: string, target: RenderTarget): void => {
  const output = runCaptured(
    [
      "ffprobe",
      "-v",
      "error",
      "-count_frames",
      "-show_entries",
      "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,nb_read_frames,color_space,color_transfer,color_primaries,sample_rate,channels",
      "-of",
      "json",
      inputPath,
    ],
    "Structure verification",
  )
  const parsed: unknown = JSON.parse(output)

  if (!isRecord(parsed)) {
    throw new Error("FFprobe returned an invalid result.")
  }

  const rawStreams: unknown = parsed.streams
  if (!Array.isArray(rawStreams)) {
    throw new Error("FFprobe returned no media streams.")
  }

  const streams: readonly unknown[] = rawStreams
  const videoStream = streams.find((stream) => isRecord(stream) && stream.codec_type === "video")
  const audioStream = streams.find((stream) => isRecord(stream) && stream.codec_type === "audio")

  if (!isRecord(videoStream) || !isRecord(audioStream)) {
    throw new Error("The rendered file must contain video and audio streams.")
  }

  const config = RENDER_TARGETS[target]
  const scale = "scale" in config ? config.scale : FULL_SCALE
  const expectedWidth = Math.round(BUDDY_LAUNCH_WIDTH_PX * scale)
  const expectedHeight = Math.round(BUDDY_LAUNCH_HEIGHT_PX * scale)
  const failures: string[] = []

  if (stringValue(videoStream, "codec_name") !== "h264") {
    failures.push("video codec is not H.264")
  }
  if (stringValue(videoStream, "pix_fmt") !== "yuv420p") {
    failures.push("pixel format is not yuv420p")
  }
  if (stringValue(videoStream, "color_space") !== OUTPUT_COLOR_STANDARD) {
    failures.push("color space is not BT.709")
  }
  if (stringValue(videoStream, "color_transfer") !== OUTPUT_COLOR_STANDARD) {
    failures.push("color transfer is not BT.709")
  }
  if (stringValue(videoStream, "color_primaries") !== OUTPUT_COLOR_STANDARD) {
    failures.push("color primaries are not BT.709")
  }
  if (stringValue(videoStream, "r_frame_rate") !== `${BUDDY_LAUNCH_FPS}/1`) {
    failures.push(`frame rate is not ${BUDDY_LAUNCH_FPS} FPS`)
  }
  if (numberValue(videoStream, "width") !== expectedWidth) {
    failures.push(`width is not ${expectedWidth}px`)
  }
  if (numberValue(videoStream, "height") !== expectedHeight) {
    failures.push(`height is not ${expectedHeight}px`)
  }
  if (stringValue(videoStream, "nb_read_frames") !== String(expectedFrameCount(target))) {
    failures.push(`frame count is not ${expectedFrameCount(target)}`)
  }
  if (stringValue(audioStream, "codec_name") !== "aac") {
    failures.push("audio codec is not AAC")
  }
  if (stringValue(audioStream, "sample_rate") !== String(OUTPUT_AUDIO_SAMPLE_RATE_HZ)) {
    failures.push(`audio sample rate is not ${OUTPUT_AUDIO_SAMPLE_RATE_HZ}Hz`)
  }
  if (numberValue(audioStream, "channels") !== 2) {
    failures.push("audio is not stereo")
  }

  if (failures.length > 0) {
    throw new Error(`Invalid ${target} output: ${failures.join(", ")}.`)
  }
}

const verifyLoudness = (inputPath: string): void => {
  const measurement = measureLoudness(inputPath)
  const integratedLoudness = Number(measurement.input_i)
  const truePeak = Number(measurement.input_tp)

  if (
    !Number.isFinite(integratedLoudness) ||
    Math.abs(integratedLoudness - TARGET_INTEGRATED_LUFS) > LOUDNESS_TOLERANCE_LU
  ) {
    throw new Error(
      `Integrated loudness ${measurement.input_i} LUFS is outside the target tolerance.`,
    )
  }

  if (!Number.isFinite(truePeak) || truePeak > TARGET_TRUE_PEAK_DBTP + TRUE_PEAK_TOLERANCE_DB) {
    throw new Error(`True peak ${measurement.input_tp} dBTP exceeds the target ceiling.`)
  }
}

const moveIfPresent = async (sourcePath: string, destinationPath: string): Promise<boolean> => {
  try {
    await rename(sourcePath, destinationPath)
    return true
  } catch (error) {
    if (isMissingPathError(error)) {
      return false
    }
    throw error
  }
}

const publishAtomically = async (
  candidatePath: string,
  outputPath: string,
  backupPath: string,
): Promise<void> => {
  await rm(backupPath, { force: true })
  const hadPreviousOutput = await moveIfPresent(outputPath, backupPath)

  try {
    await rename(candidatePath, outputPath)
    await rm(backupPath, { force: true })
  } catch (error) {
    if (hadPreviousOutput) {
      await moveIfPresent(backupPath, outputPath)
    }
    throw error
  }
}

const renderTarget = async (target: RenderTarget): Promise<void> => {
  const config = RENDER_TARGETS[target]
  const outputPath = path.join(OUTPUT_DIRECTORY, `buddy-launch-${target}.mp4`)
  const renderPath = path.join(OUTPUT_DIRECTORY, `buddy-launch-${target}.rendering.mp4`)
  const finalizedPath = path.join(OUTPUT_DIRECTORY, `buddy-launch-${target}.finalized.mp4`)
  const backupPath = path.join(OUTPUT_DIRECTORY, `buddy-launch-${target}.previous.mp4`)

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  await Promise.all([rm(renderPath, { force: true }), rm(finalizedPath, { force: true })])

  try {
    const renderCommand = [
      "bunx",
      "remotion",
      "render",
      COMPOSITION_ID,
      renderPath,
      "--codec=h264",
      "--pixel-format=yuv420p",
      `--sample-rate=${OUTPUT_AUDIO_SAMPLE_RATE_HZ}`,
      `--crf=${config.crf}`,
      `--x264-preset=${config.x264Preset}`,
      `--audio-bitrate=${config.audioBitrate}`,
    ]

    if ("frames" in config) {
      renderCommand.push(`--frames=${config.frames}`)
    }
    if ("gopSize" in config) {
      renderCommand.push(`--gop-size=${config.gopSize}`)
    }
    if ("scale" in config) {
      renderCommand.push(`--scale=${config.scale}`)
    }

    console.log(`Rendering ${target}…`)
    runInherited(renderCommand, `${target} render`)

    if (config.normalizeAudio) {
      console.log(`Normalizing ${target} audio…`)
      normalizeAudio(renderPath, finalizedPath, config.audioBitrate)
    } else {
      console.log(`Finalizing ${target} media…`)
      finalizeWithoutAudioNormalization(renderPath, finalizedPath)
    }

    console.log(`Verifying ${target}…`)
    verifyDecode(finalizedPath)
    verifyStructure(finalizedPath, target)
    if (config.normalizeAudio) {
      verifyLoudness(finalizedPath)
    }
    await publishAtomically(finalizedPath, outputPath, backupPath)
    console.log(`Published ${outputPath}`)
  } finally {
    await Promise.all([rm(renderPath, { force: true }), rm(finalizedPath, { force: true })])
  }
}

const requestedTarget = process.argv[2]

if (requestedTarget === "all") {
  for (const target of DELIVERY_TARGETS) {
    await renderTarget(target)
  }
} else if (requestedTarget && isRenderTarget(requestedTarget)) {
  await renderTarget(requestedTarget)
} else {
  throw new Error(`Choose one of: ${[...DELIVERY_TARGETS, "preview", "all"].join(", ")}.`)
}
