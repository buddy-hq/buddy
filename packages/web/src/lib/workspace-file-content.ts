import { fileExtensionFromPath } from "./workspace-file-paths"

const UTF8_BOM = "\uFEFF"
const REPLACEMENT_CHARACTER = "\uFFFD"
const ALLOWED_CONTROL_CHARACTERS = new Set(["\t", "\n", "\r"])

const EXTENSION_TO_MONACO_LANGUAGE: Record<string, string> = {
  bash: "shell",
  c: "c",
  cc: "cpp",
  clj: "clojure",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  csv: "plaintext",
  cxx: "cpp",
  dart: "dart",
  fs: "fsharp",
  go: "go",
  hs: "haskell",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascriptreact",
  kt: "kotlin",
  lua: "lua",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "shell",
  sql: "sql",
  swift: "swift",
  tf: "hcl",
  ts: "typescript",
  tsv: "plaintext",
  tsx: "typescriptreact",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
}

export type WorkspaceTextEncoding = "utf-8" | "utf-8-bom"

export function workspaceTextEncoding(content: string): WorkspaceTextEncoding {
  return content.startsWith(UTF8_BOM) ? "utf-8-bom" : "utf-8"
}

export function isReadableWorkspaceText(content: string): boolean {
  if (content.includes(REPLACEMENT_CHARACTER)) return false

  for (const character of content) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined || codePoint >= 32 || ALLOWED_CONTROL_CHARACTERS.has(character)) {
      continue
    }
    return false
  }

  return true
}

export function monacoLanguageForWorkspacePath(path: string): string {
  return EXTENSION_TO_MONACO_LANGUAGE[fileExtensionFromPath(path)] ?? "plaintext"
}
