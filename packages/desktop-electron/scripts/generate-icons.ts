import { cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { resolveChannel, type Channel } from "./utils"

type SizedAsset = {
  filename: string
  size: number
}

const APP_ICON_FILENAME = "buddy-app-icon.png"
const IN_APP_ICON_FILENAME = "buddy-inapp-icon.png"
const PACKAGE_DIRECTORY = resolve(import.meta.dir, "..")
const REPOSITORY_DIRECTORY = resolve(PACKAGE_DIRECTORY, "../..")
const ASSETS_DIRECTORY = join(REPOSITORY_DIRECTORY, "assets")
const DESKTOP_ICONS_DIRECTORY = join(PACKAGE_DIRECTORY, "icons")
const DESKTOP_RESOURCES_DIRECTORY = join(PACKAGE_DIRECTORY, "resources")
const RUNTIME_ICONS_DIRECTORY = join(DESKTOP_RESOURCES_DIRECTORY, "icons")
const DESKTOP_PUBLIC_ICON_PATH = join(PACKAGE_DIRECTORY, "public", "buddy-icon.png")
const WEB_PUBLIC_ICON_PATH = join(
  REPOSITORY_DIRECTORY,
  "packages",
  "web",
  "public",
  "buddy-icon.png",
)
const APP_ICON_CANONICAL_PATH = join(ASSETS_DIRECTORY, APP_ICON_FILENAME)
const IN_APP_ICON_CANONICAL_PATH = join(ASSETS_DIRECTORY, IN_APP_ICON_FILENAME)
const ICONSET_DIRECTORY_SUFFIX = ".iconset"
const MACOS_ICONSET_ASSETS: SizedAsset[] = [
  { filename: "icon_16x16.png", size: 16 },
  { filename: "icon_16x16@2x.png", size: 32 },
  { filename: "icon_32x32.png", size: 32 },
  { filename: "icon_32x32@2x.png", size: 64 },
  { filename: "icon_128x128.png", size: 128 },
  { filename: "icon_128x128@2x.png", size: 256 },
  { filename: "icon_256x256.png", size: 256 },
  { filename: "icon_256x256@2x.png", size: 512 },
  { filename: "icon_512x512.png", size: 512 },
  { filename: "icon_512x512@2x.png", size: 1024 },
]
const DESKTOP_RUNTIME_ASSETS: SizedAsset[] = [
  { filename: "icon.png", size: 512 },
  { filename: "dock.png", size: 512 },
]
const WINDOWS_ICO_SIZES = [16, 24, 32, 40, 48, 64, 128, 256]
const CHANNELS: Channel[] = ["dev", "beta", "prod"]
const PUBLIC_ICON_SIZE = 512
const ICON_BACKGROUND = "none"

async function pathExists(pathname: string) {
  try {
    await stat(pathname)
    return true
  } catch {
    return false
  }
}

function channelIconsDirectory(channel: Channel) {
  return join(DESKTOP_ICONS_DIRECTORY, channel)
}

async function runCommand(command: string[], cwd = REPOSITORY_DIRECTORY) {
  const subprocess = Bun.spawn({
    cmd: command,
    cwd,
    stdout: "inherit",
    stderr: "pipe",
  })
  const stderr = await new Response(subprocess.stderr).text()
  const exitCode = await subprocess.exited

  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}\n${stderr}`)
  }
}

async function ensureParentDirectory(pathname: string) {
  await mkdir(dirname(pathname), { recursive: true })
}

async function resizePng(sourcePath: string, outputPath: string, size: number) {
  await ensureParentDirectory(outputPath)
  await runCommand([
    "magick",
    sourcePath,
    "-background",
    ICON_BACKGROUND,
    "-alpha",
    "on",
    "-resize",
    `${size}x${size}`,
    "-gravity",
    "center",
    "-extent",
    `${size}x${size}`,
    `PNG32:${outputPath}`,
  ])
}

async function generateMacIcon(sourcePath: string, outputPath: string) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "buddy-iconset-"))
  const iconsetDirectory = join(temporaryDirectory, `buddy${ICONSET_DIRECTORY_SUFFIX}`)

  await mkdir(iconsetDirectory, { recursive: true })

  for (const asset of MACOS_ICONSET_ASSETS) {
    await resizePng(sourcePath, join(iconsetDirectory, asset.filename), asset.size)
  }

  await ensureParentDirectory(outputPath)
  await runCommand(["iconutil", "-c", "icns", iconsetDirectory, "-o", outputPath])
  await rm(temporaryDirectory, { force: true, recursive: true })
}

async function generateWindowsIcon(sourcePath: string, outputPath: string) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "buddy-ico-"))
  const pngPaths: string[] = []

  for (const size of WINDOWS_ICO_SIZES) {
    const pngPath = join(temporaryDirectory, `${size}.png`)
    pngPaths.push(pngPath)
    await resizePng(sourcePath, pngPath, size)
  }

  await ensureParentDirectory(outputPath)
  await runCommand(["magick", ...pngPaths, outputPath])
  await rm(temporaryDirectory, { force: true, recursive: true })
}

async function generateChannelIcons(sourcePath: string, channel: Channel) {
  const outputDirectory = channelIconsDirectory(channel)

  await rm(outputDirectory, { force: true, recursive: true })
  await mkdir(outputDirectory, { recursive: true })

  for (const asset of DESKTOP_RUNTIME_ASSETS) {
    await resizePng(sourcePath, join(outputDirectory, asset.filename), asset.size)
  }

  await generateMacIcon(sourcePath, join(outputDirectory, "icon.icns"))
  await generateWindowsIcon(sourcePath, join(outputDirectory, "icon.ico"))
}

async function resetGeneratedIcons() {
  const generatedPaths = [
    "packages/desktop-electron/icons/dev",
    "packages/desktop-electron/icons/beta",
    "packages/desktop-electron/icons/prod",
    "packages/desktop-electron/resources/icons",
    "packages/desktop-electron/public/buddy-icon.png",
    "packages/web/public/buddy-icon.png",
  ]

  for (const relativePath of generatedPaths) {
    await rm(join(REPOSITORY_DIRECTORY, relativePath), { force: true, recursive: true })
  }
}

async function resolveSourcePath(
  argument: string | undefined,
  fallbackPath: string,
  label: string,
) {
  const resolvedPath = argument ? resolve(REPOSITORY_DIRECTORY, argument) : fallbackPath
  if (await pathExists(resolvedPath)) {
    return resolvedPath
  }

  throw new Error(`Missing ${label} source image at ${resolvedPath}`)
}

async function syncRuntimeIcons(channel: Channel) {
  await rm(RUNTIME_ICONS_DIRECTORY, { force: true, recursive: true })
  await cp(channelIconsDirectory(channel), RUNTIME_ICONS_DIRECTORY, { recursive: true })
}

async function generatePublicIcons(sourcePath: string) {
  await resizePng(sourcePath, DESKTOP_PUBLIC_ICON_PATH, PUBLIC_ICON_SIZE)
  await resizePng(sourcePath, WEB_PUBLIC_ICON_PATH, PUBLIC_ICON_SIZE)
}

async function preserveSource(pathname: string, label: string) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `${label}-`))
  const preservedPath = join(temporaryDirectory, `${label}.png`)
  await cp(pathname, preservedPath)
  return preservedPath
}

const appSourcePath = await preserveSource(
  await resolveSourcePath(process.argv[2], APP_ICON_CANONICAL_PATH, "app icon"),
  "buddy-app-icon-source",
)
const inAppSourcePath = await preserveSource(
  await resolveSourcePath(process.argv[3], IN_APP_ICON_CANONICAL_PATH, "in-app icon"),
  "buddy-inapp-icon-source",
)

await resetGeneratedIcons()
await mkdir(ASSETS_DIRECTORY, { recursive: true })
await cp(appSourcePath, APP_ICON_CANONICAL_PATH)
await cp(inAppSourcePath, IN_APP_ICON_CANONICAL_PATH)

for (const channel of CHANNELS) {
  await generateChannelIcons(APP_ICON_CANONICAL_PATH, channel)
}

await generatePublicIcons(IN_APP_ICON_CANONICAL_PATH)
await syncRuntimeIcons(resolveChannel())
