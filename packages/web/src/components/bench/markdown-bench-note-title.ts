import { fileNameFromPath } from "@/lib/workspace-file-paths"

const MARKDOWN_FILE_EXTENSION_PATTERN = /\.mdx?$/iu
const INVALID_NOTE_TITLE_CHARACTERS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"])
const MAX_CONTROL_CHARACTER_CODE_POINT = 31
const NOTE_TITLE_REQUIRED_ERROR = "Note title cannot be empty."
const NOTE_TITLE_CHARACTER_ERROR = 'Note title cannot contain < > : " / \\ | ? or *.'

function containsInvalidNoteTitleCharacter(title: string) {
  return Array.from(title).some((character) => {
    const codePoint = character.codePointAt(0)
    return (
      INVALID_NOTE_TITLE_CHARACTERS.has(character) ||
      (codePoint !== undefined && codePoint <= MAX_CONTROL_CHARACTER_CODE_POINT)
    )
  })
}

export function resolveMarkdownBenchNoteTitle(path: string): string {
  const fileName = fileNameFromPath(path)
  const noteTitle = fileName.replace(MARKDOWN_FILE_EXTENSION_PATTERN, "")
  return noteTitle || fileName || path
}

export function resolveRenamedMarkdownBenchPath(path: string, title: string): string {
  const nextTitle = title.trim()
  if (!nextTitle) {
    throw new Error(NOTE_TITLE_REQUIRED_ERROR)
  }
  if (containsInvalidNoteTitleCharacter(nextTitle)) {
    throw new Error(NOTE_TITLE_CHARACTER_ERROR)
  }

  const normalizedPath = path.replaceAll("\\", "/")
  const fileName = fileNameFromPath(normalizedPath)
  const extension = fileName.match(MARKDOWN_FILE_EXTENSION_PATTERN)?.[0] ?? ""
  const parentPath = normalizedPath.slice(0, Math.max(0, normalizedPath.length - fileName.length))
  return `${parentPath}${nextTitle}${extension}`
}
