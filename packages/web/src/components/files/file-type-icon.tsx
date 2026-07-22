import fileAudioIconUrl from "@uiw/file-icons/icon/audio.svg"
import fileCIconUrl from "@uiw/file-icons/icon/c.svg"
import fileCppIconUrl from "@uiw/file-icons/icon/cpp.svg"
import fileCsharpIconUrl from "@uiw/file-icons/icon/csharp.svg"
import fileCssIconUrl from "@uiw/file-icons/icon/css3.svg"
import fileDartIconUrl from "@uiw/file-icons/icon/dart.svg"
import fileDatabaseIconUrl from "@uiw/file-icons/icon/database.svg"
import fileDockerIconUrl from "@uiw/file-icons/icon/docker.svg"
import fileDocumentIconUrl from "@uiw/file-icons/icon/document.svg"
import fileFallbackIconUrl from "@uiw/file-icons/icon/file.svg"
import fileFontIconUrl from "@uiw/file-icons/icon/font.svg"
import fileGitIconUrl from "@uiw/file-icons/icon/git.svg"
import fileGoIconUrl from "@uiw/file-icons/icon/go.svg"
import fileGraphqlIconUrl from "@uiw/file-icons/icon/graphql.svg"
import fileHclIconUrl from "@uiw/file-icons/icon/hcl.svg"
import fileHtmlIconUrl from "@uiw/file-icons/icon/html.svg"
import fileImageIconUrl from "@uiw/file-icons/icon/image.svg"
import fileJavaIconUrl from "@uiw/file-icons/icon/java.svg"
import fileJavascriptIconUrl from "@uiw/file-icons/icon/javascript.svg"
import fileJsonIconUrl from "@uiw/file-icons/icon/json.svg"
import fileKotlinIconUrl from "@uiw/file-icons/icon/kotlin.svg"
import fileLessIconUrl from "@uiw/file-icons/icon/less.svg"
import fileLockIconUrl from "@uiw/file-icons/icon/lock.svg"
import fileLuaIconUrl from "@uiw/file-icons/icon/lua.svg"
import fileMakefileIconUrl from "@uiw/file-icons/icon/makefile.svg"
import fileMarkdownIconUrl from "@uiw/file-icons/icon/markdown.svg"
import fileExcelIconUrl from "@uiw/file-icons/icon/microsoft-excel.svg"
import filePowerpointIconUrl from "@uiw/file-icons/icon/microsoft-powerpoint.svg"
import fileWordIconUrl from "@uiw/file-icons/icon/microsoft-word.svg"
import fileNginxIconUrl from "@uiw/file-icons/icon/nginx.svg"
import fileNodeIconUrl from "@uiw/file-icons/icon/nodejs.svg"
import fileNpmIconUrl from "@uiw/file-icons/icon/npm.svg"
import filePdfIconUrl from "@uiw/file-icons/icon/pdf.svg"
import filePhpIconUrl from "@uiw/file-icons/icon/php.svg"
import filePowershellIconUrl from "@uiw/file-icons/icon/powershell.svg"
import filePythonIconUrl from "@uiw/file-icons/icon/python.svg"
import fileReactIconUrl from "@uiw/file-icons/icon/react.svg"
import fileReadmeIconUrl from "@uiw/file-icons/icon/readme.svg"
import fileRubyIconUrl from "@uiw/file-icons/icon/ruby.svg"
import fileRustIconUrl from "@uiw/file-icons/icon/rust.svg"
import fileSassIconUrl from "@uiw/file-icons/icon/sass.svg"
import fileSettingsIconUrl from "@uiw/file-icons/icon/settings.svg"
import fileSwiftIconUrl from "@uiw/file-icons/icon/swift.svg"
import fileTableIconUrl from "@uiw/file-icons/icon/table.svg"
import fileTerraformIconUrl from "@uiw/file-icons/icon/terraform.svg"
import fileTypescriptIconUrl from "@uiw/file-icons/icon/typescript.svg"
import fileVideoIconUrl from "@uiw/file-icons/icon/video.svg"
import fileVueIconUrl from "@uiw/file-icons/icon/vue.svg"
import fileWebpackIconUrl from "@uiw/file-icons/icon/webpack.svg"
import fileXmlIconUrl from "@uiw/file-icons/icon/xml.svg"
import fileYamlIconUrl from "@uiw/file-icons/icon/yaml.svg"
import fileZipIconUrl from "@uiw/file-icons/icon/zip.svg"
import { cn } from "@buddy/ui"

import { fileExtensionFromPath, fileNameFromPath } from "@/lib/workspace-file-paths"
import type { WorkspaceMediaKind } from "@/lib/workspace-file-media"

const FILE_ICON_BY_KEY = {
  audio: fileAudioIconUrl,
  c: fileCIconUrl,
  cpp: fileCppIconUrl,
  csharp: fileCsharpIconUrl,
  css3: fileCssIconUrl,
  dart: fileDartIconUrl,
  database: fileDatabaseIconUrl,
  docker: fileDockerIconUrl,
  document: fileDocumentIconUrl,
  file: fileFallbackIconUrl,
  font: fileFontIconUrl,
  git: fileGitIconUrl,
  go: fileGoIconUrl,
  graphql: fileGraphqlIconUrl,
  hcl: fileHclIconUrl,
  html: fileHtmlIconUrl,
  image: fileImageIconUrl,
  java: fileJavaIconUrl,
  javascript: fileJavascriptIconUrl,
  json: fileJsonIconUrl,
  kotlin: fileKotlinIconUrl,
  less: fileLessIconUrl,
  lock: fileLockIconUrl,
  lua: fileLuaIconUrl,
  makefile: fileMakefileIconUrl,
  markdown: fileMarkdownIconUrl,
  "microsoft-excel": fileExcelIconUrl,
  "microsoft-powerpoint": filePowerpointIconUrl,
  "microsoft-word": fileWordIconUrl,
  nginx: fileNginxIconUrl,
  nodejs: fileNodeIconUrl,
  npm: fileNpmIconUrl,
  pdf: filePdfIconUrl,
  php: filePhpIconUrl,
  powershell: filePowershellIconUrl,
  python: filePythonIconUrl,
  react: fileReactIconUrl,
  readme: fileReadmeIconUrl,
  ruby: fileRubyIconUrl,
  rust: fileRustIconUrl,
  sass: fileSassIconUrl,
  settings: fileSettingsIconUrl,
  swift: fileSwiftIconUrl,
  table: fileTableIconUrl,
  terraform: fileTerraformIconUrl,
  typescript: fileTypescriptIconUrl,
  video: fileVideoIconUrl,
  vue: fileVueIconUrl,
  webpack: fileWebpackIconUrl,
  xml: fileXmlIconUrl,
  yaml: fileYamlIconUrl,
  zip: fileZipIconUrl,
} as const

type FileIconKey = keyof typeof FILE_ICON_BY_KEY

type FileIconResolverInput = {
  fileName: string
  mediaKind?: WorkspaceMediaKind | null
}

type ResolvedFileTypeIcon = {
  key: FileIconKey
  url: string
}

type FileTypeIconProps = {
  fileName: string
  mediaKind?: WorkspaceMediaKind | null
  className?: string
}

const IMAGE_ICON_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tiff",
  "webp",
])

const FONT_ICON_EXTENSIONS = new Set(["eot", "otf", "ttf", "woff", "woff2"])
const AUDIO_ICON_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "ogg", "wav"])
const VIDEO_ICON_EXTENSIONS = new Set(["avi", "m4v", "mkv", "mov", "mp4", "webm"])
const ARCHIVE_ICON_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "zip"])
const PDF_ICON_EXTENSIONS = new Set(["pdf"])
const SPREADSHEET_ICON_EXTENSIONS = new Set([
  "csv",
  "numbers",
  "ods",
  "tsv",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
])
const DOCUMENT_ICON_EXTENSIONS = new Set(["doc", "docx", "odt", "rtf", "txt"])
const PRESENTATION_ICON_EXTENSIONS = new Set(["key", "odp", "ppt", "pptx"])

const EXACT_FILE_NAME_ICON_KEYS = new Map<string, FileIconKey>([
  [".gitignore", "git"],
  [".gitattributes", "git"],
  [".gitmodules", "git"],
  [".env", "settings"],
  [".env.example", "settings"],
  [".editorconfig", "settings"],
  ["bun.lock", "lock"],
  ["bun.lockb", "lock"],
  ["package.json", "npm"],
  ["package-lock.json", "npm"],
  ["yarn.lock", "lock"],
  ["pnpm-lock.yaml", "lock"],
  ["cargo.lock", "lock"],
  ["composer.lock", "lock"],
  ["dockerfile", "docker"],
  ["docker-compose.yml", "docker"],
  ["docker-compose.yaml", "docker"],
  ["docker-compose.override.yml", "docker"],
  ["docker-compose.override.yaml", "docker"],
  ["readme", "readme"],
  ["readme.md", "readme"],
  ["readme.mdx", "readme"],
  ["makefile", "makefile"],
])

const PREFIX_FILE_NAME_ICON_KEYS = new Map<string, FileIconKey>([
  [".env.", "settings"],
  ["dockerfile.", "docker"],
  ["docker-compose.", "docker"],
  ["vite.config.", "webpack"],
])

const EXTENSION_ICON_KEYS = new Map<string, FileIconKey>([
  ["ts", "typescript"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["tsx", "react"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["jsx", "react"],
  ["json", "json"],
  ["jsonc", "json"],
  ["md", "markdown"],
  ["mdx", "markdown"],
  ["html", "html"],
  ["htm", "html"],
  ["css", "css3"],
  ["scss", "sass"],
  ["sass", "sass"],
  ["less", "less"],
  ["xml", "xml"],
  ["xaml", "xml"],
  ["xsd", "xml"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "settings"],
  ["ini", "settings"],
  ["cfg", "settings"],
  ["conf", "settings"],
  ["properties", "settings"],
  ["env", "settings"],
  ["sh", "settings"],
  ["bash", "settings"],
  ["zsh", "settings"],
  ["fish", "settings"],
  ["bat", "settings"],
  ["cmd", "settings"],
  ["ps1", "powershell"],
  ["py", "python"],
  ["pyi", "python"],
  ["go", "go"],
  ["rs", "rust"],
  ["java", "java"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["rb", "ruby"],
  ["php", "php"],
  ["phtml", "php"],
  ["c", "c"],
  ["h", "c"],
  ["cpp", "cpp"],
  ["cc", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["hh", "cpp"],
  ["cs", "csharp"],
  ["swift", "swift"],
  ["dart", "dart"],
  ["lua", "lua"],
  ["sql", "database"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["tf", "terraform"],
  ["tfvars", "terraform"],
  ["hcl", "hcl"],
  ["vue", "vue"],
  ["npmrc", "npm"],
  ["npmignore", "npm"],
  ["lock", "lock"],
  ["zip", "zip"],
  ["tar", "zip"],
  ["gz", "zip"],
  ["rar", "zip"],
  ["7z", "zip"],
  ["woff", "font"],
  ["woff2", "font"],
  ["ttf", "font"],
  ["otf", "font"],
  ["eot", "font"],
  ["mp3", "audio"],
  ["wav", "audio"],
  ["flac", "audio"],
  ["ogg", "audio"],
  ["aac", "audio"],
  ["mp4", "video"],
  ["mov", "video"],
  ["webm", "video"],
  ["avi", "video"],
  ["mkv", "video"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["svg", "image"],
  ["avif", "image"],
  ["bmp", "image"],
  ["ico", "image"],
  ["pdf", "pdf"],
  ["doc", "document"],
  ["docx", "document"],
  ["odt", "document"],
  ["rtf", "document"],
  ["txt", "document"],
  ["ppt", "microsoft-powerpoint"],
  ["pptx", "microsoft-powerpoint"],
  ["key", "microsoft-powerpoint"],
  ["odp", "microsoft-powerpoint"],
  ["xls", "microsoft-excel"],
  ["xlsb", "microsoft-excel"],
  ["xlsm", "microsoft-excel"],
  ["xlsx", "microsoft-excel"],
  ["numbers", "microsoft-excel"],
  ["ods", "microsoft-excel"],
  ["csv", "table"],
  ["tsv", "table"],
])

function fileIconByMediaKind(mediaKind: WorkspaceMediaKind | undefined) {
  if (mediaKind === "image") return "image" as const
  if (mediaKind === "pdf") return "pdf" as const
  if (mediaKind === "presentation") return "microsoft-powerpoint" as const
  if (mediaKind === "document") return "microsoft-word" as const
  if (mediaKind === "spreadsheet") return "microsoft-excel" as const
  if (mediaKind === "video") return "video" as const
  if (mediaKind === "audio") return "audio" as const
  if (mediaKind === "archive") return "zip" as const
  return undefined
}

function detectIconKeyByExtension(extension: string) {
  if (IMAGE_ICON_EXTENSIONS.has(extension)) return "image" as const
  if (FONT_ICON_EXTENSIONS.has(extension)) return "font" as const
  if (AUDIO_ICON_EXTENSIONS.has(extension)) return "audio" as const
  if (VIDEO_ICON_EXTENSIONS.has(extension)) return "video" as const
  if (ARCHIVE_ICON_EXTENSIONS.has(extension)) return "zip" as const
  if (PDF_ICON_EXTENSIONS.has(extension)) return "pdf" as const
  if (SPREADSHEET_ICON_EXTENSIONS.has(extension)) return "table" as const
  if (DOCUMENT_ICON_EXTENSIONS.has(extension)) return "document" as const
  if (PRESENTATION_ICON_EXTENSIONS.has(extension)) return "microsoft-powerpoint" as const
  return EXTENSION_ICON_KEYS.get(extension)
}

function normalizeFileName(value: string) {
  return fileNameFromPath(value).toLowerCase()
}

function detectIconKey(fileName: string) {
  const normalizedFileName = normalizeFileName(fileName)
  const exactMatch = EXACT_FILE_NAME_ICON_KEYS.get(normalizedFileName)
  if (exactMatch) return exactMatch

  for (const [prefix, iconKey] of PREFIX_FILE_NAME_ICON_KEYS) {
    if (normalizedFileName.startsWith(prefix)) return iconKey
  }

  const extension = fileExtensionFromPath(normalizedFileName)
  const extensionMatch = detectIconKeyByExtension(extension)
  if (extensionMatch) return extensionMatch

  if (normalizedFileName.includes("webpack")) return "webpack"
  if (normalizedFileName.includes("nginx")) return "nginx"
  if (normalizedFileName.startsWith(".git")) return "git"

  return "file"
}

export function resolveFileTypeIconUrl(input: FileIconResolverInput) {
  return resolveFileTypeIcon(input).url
}

function resolveFileTypeIcon(input: FileIconResolverInput): ResolvedFileTypeIcon {
  const byKind = fileIconByMediaKind(input.mediaKind ?? undefined)
  const iconKey = detectIconKey(input.fileName)
  const key = byKind ?? iconKey
  return {
    key,
    url: FILE_ICON_BY_KEY[key],
  }
}

function shouldUseThemeColoredIcon(key: FileIconKey): boolean {
  return key === "markdown"
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const MARKDOWN_ICON_VIEWBOX = "0 0 48 48"
const MARKDOWN_ICON_CLASS = "inline-block shrink-0 text-icon-info-base"
const MARKDOWN_ICON_PATH =
  "M42.8236518,9 L5.17634821,9 C3.4245,9 2,10.4031375 2,12.1298375 L2,36.8667719 C2,38.5946344 3.4245,40 5.17634821,40 L42.8236518,40 C44.5755,40 46,38.5946344 46,36.866675 L46,12.1298375 C46,10.4031375 44.5755,9 42.8236518,9 Z M26.7522589,33.8 L21.2475446,33.8 L21.2475446,24.5 L17.1186161,29.7194312 L12.9914554,24.5 L12.9914554,33.8 L7.48713393,33.8 L7.48713393,15.2 L12.9914554,15.2 L17.1186161,21.7855625 L21.2475446,15.2 L26.7522589,15.2 L26.7522589,33.8 Z M34.9685714,33.8 L28.1294196,24.5 L32.2544196,24.5 L32.2544196,15.2 L37.7586429,15.2 L37.7586429,24.5 L41.8862946,24.5 L34.9668036,33.8 L34.9685714,33.8 Z"

function MarkdownFileIcon(props: { className?: string }) {
  return (
    <svg
      xmlns={SVG_NAMESPACE}
      viewBox={MARKDOWN_ICON_VIEWBOX}
      aria-hidden
      focusable="false"
      className={cn(MARKDOWN_ICON_CLASS, props.className)}
      fill="currentColor"
    >
      <path d={MARKDOWN_ICON_PATH} />
    </svg>
  )
}

/**
 * DOM (non-React) variant of {@link FileTypeIcon} for imperative surfaces such
 * as the contenteditable prompt pills, so a file gets the same icon everywhere
 * — including the theme-coloured markdown glyph, which stays legible where the
 * raw `markdown.svg` asset would fade into a dark background.
 */
export function createFileTypeIconElement(
  fileName: string,
  className?: string,
): HTMLElement | SVGElement {
  const icon = resolveFileTypeIcon({ fileName })

  if (shouldUseThemeColoredIcon(icon.key)) {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg")
    svg.setAttribute("viewBox", MARKDOWN_ICON_VIEWBOX)
    svg.setAttribute("fill", "currentColor")
    svg.setAttribute("aria-hidden", "true")
    svg.setAttribute("focusable", "false")
    svg.setAttribute("class", cn(MARKDOWN_ICON_CLASS, className))
    const path = document.createElementNS(SVG_NAMESPACE, "path")
    path.setAttribute("d", MARKDOWN_ICON_PATH)
    svg.appendChild(path)
    return svg
  }

  const img = document.createElement("img")
  img.src = icon.url
  img.alt = ""
  img.setAttribute("aria-hidden", "true")
  if (className) img.className = className
  return img
}

export function FileTypeIcon(props: FileTypeIconProps) {
  const icon = resolveFileTypeIcon({
    fileName: props.fileName,
    mediaKind: props.mediaKind,
  })

  if (shouldUseThemeColoredIcon(icon.key)) {
    return <MarkdownFileIcon className={props.className} />
  }

  return <img src={icon.url} alt="" aria-hidden className={props.className} />
}
