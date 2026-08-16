import type { ReactNode } from "react"
import { useDropzone, type DropEvent } from "react-dropzone"
import { UploadIcon } from "@/icons/app-icons"
import { getPlatform } from "@/context/platform"
import { parseTString } from "@/components/chat/tools/types"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"

const RESOURCE_EXTENSIONS = new Set(["pdf", "epub"])
const WINDOWS_DRIVE_ABSOLUTE_PATH_REGEX = /^[A-Za-z]:[/\\]/
const WINDOWS_UNC_ABSOLUTE_PATH_REGEX = /^[/\\]{2}[^/\\]+[/\\]+[^/\\]+/
const FILE_URI_PROTOCOL = "file:"
const URI_LIST_MIME_TYPE = "text/uri-list"
const PLAIN_TEXT_MIME_TYPE = "text/plain"
const RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE =
  "Couldn't read dropped file path. Use Add source to select the file."

function isResourceFilePath(filepath: string): boolean {
  return RESOURCE_EXTENSIONS.has(fileExtensionFromPath(filepath))
}

function isAbsoluteFilesystemPath(path: string): boolean {
  return (
    path.startsWith("/") ||
    WINDOWS_DRIVE_ABSOLUTE_PATH_REGEX.test(path) ||
    WINDOWS_UNC_ABSOLUTE_PATH_REGEX.test(path)
  )
}

function normalizeFilesystemPath(path: string): string {
  return path.trim().replaceAll("\\", "/")
}

function readNamedPropertyValue<THost>(target: THost, key: string) {
  if (!(target instanceof Object)) return undefined
  let current: THost | null = target
  while (current instanceof Object) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor) {
      if (descriptor.get) return descriptor.get.call(target)
      return descriptor.value
    }
    const proto = Object.getPrototypeOf(current)
    if (!(proto instanceof Object) || proto === current) break
    current = proto
  }
  return undefined
}

function readFilePathValue(file: File): string | undefined {
  const pathValue = readNamedPropertyValue(file, "path")
  const path = parseTString(pathValue)
  if (path === undefined) return undefined
  return normalizeFilesystemPath(path)
}

function parsePathFromFileUri(input: string): string | undefined {
  const trimmed = input.trim()
  if (!trimmed.toLocaleLowerCase().startsWith(FILE_URI_PROTOCOL)) return undefined

  try {
    const url = new URL(trimmed)
    if (url.protocol !== FILE_URI_PROTOCOL) return undefined
    const decodedPath = decodeURIComponent(url.pathname)
    if (!decodedPath) return undefined

    if (url.host && url.host !== "localhost") {
      return normalizeFilesystemPath(`//${url.host}${decodedPath}`)
    }
    if (/^\/[A-Za-z]:/.test(decodedPath)) {
      return normalizeFilesystemPath(decodedPath.slice(1))
    }
    return normalizeFilesystemPath(decodedPath)
  } catch {
    return undefined
  }
}

function parseDropDataTransferUris(rawText: string): string[] {
  const paths: string[] = []
  for (const line of rawText.split(/\r?\n/g)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith("#")) continue
    const parsedPath = parsePathFromFileUri(trimmedLine)
    if (parsedPath) paths.push(parsedPath)
  }
  return paths
}

function parseTDropDataTransfer<TValue>(value: TValue): DataTransfer | undefined {
  return value instanceof DataTransfer ? value : undefined
}

function readDataTransferFromDropEvent(event: DropEvent): DataTransfer | undefined {
  if (Array.isArray(event) || !(event instanceof Object)) return undefined
  const directDataTransfer = parseTDropDataTransfer(readNamedPropertyValue(event, "dataTransfer"))
  if (directDataTransfer) return directDataTransfer
  const nativeEvent = readNamedPropertyValue(event, "nativeEvent")
  if (!(nativeEvent instanceof Object)) return undefined
  return parseTDropDataTransfer(readNamedPropertyValue(nativeEvent, "dataTransfer"))
}

async function extractAbsoluteResourcePathsFromDrop(input: {
  acceptedFiles: File[]
  event: DropEvent
  resolveDroppedFilePath?: (file: File) => Promise<string | null> | string | null
  consumeDroppedFilePaths?: () => Promise<string[]> | string[]
}): Promise<string[]> {
  const droppedPaths = new Set<string>()
  const filesNeedingResolution = new Set<File>()

  const addPath = (rawPath: string | undefined) => {
    if (!rawPath) return
    const normalizedPath = normalizeFilesystemPath(rawPath)
    if (
      normalizedPath &&
      isAbsoluteFilesystemPath(normalizedPath) &&
      isResourceFilePath(normalizedPath)
    ) {
      droppedPaths.add(normalizedPath)
    }
  }

  for (const file of input.acceptedFiles) {
    const resolvedPath = readFilePathValue(file)
    addPath(resolvedPath)
    if (!resolvedPath) filesNeedingResolution.add(file)
  }

  try {
    const cachedPaths = await input.consumeDroppedFilePaths?.()
    cachedPaths?.forEach((path) => addPath(path))
  } catch {
    // Continue through the remaining platform and browser fallbacks.
  }

  const dataTransfer = readDataTransferFromDropEvent(input.event)
  if (dataTransfer?.files) {
    for (const file of Array.from(dataTransfer.files)) {
      const resolvedPath = readFilePathValue(file)
      addPath(resolvedPath)
      if (!resolvedPath) filesNeedingResolution.add(file)
    }
  }

  if (input.resolveDroppedFilePath) {
    for (const file of filesNeedingResolution) {
      try {
        addPath((await input.resolveDroppedFilePath(file)) ?? undefined)
      } catch {
        continue
      }
    }
  }

  const uriList = dataTransfer?.getData(URI_LIST_MIME_TYPE)
  if (uriList) parseDropDataTransferUris(uriList).forEach((path) => addPath(path))
  const plainText = dataTransfer?.getData(PLAIN_TEXT_MIME_TYPE)
  if (plainText) parseDropDataTransferUris(plainText).forEach((path) => addPath(path))

  return [...droppedPaths]
}

export function RightWorkspaceResourceDropzone(props: {
  enabled: boolean
  onAddPaths: (paths: string[]) => Promise<void>
  onError: (message: string) => void
  children: ReactNode
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: !props.enabled,
    noClick: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/epub+zip": [".epub"],
    },
    onDrop: (acceptedFiles, fileRejections, event) => {
      void (async () => {
        props.onError("")
        const paths = await extractAbsoluteResourcePathsFromDrop({
          acceptedFiles,
          event,
          consumeDroppedFilePaths: getPlatform().consumeDroppedFilePaths,
          resolveDroppedFilePath: getPlatform().resolveDroppedFilePath,
        })
        if (paths.length > 0) {
          await props.onAddPaths(paths)
          return
        }
        const firstError = fileRejections[0]?.errors[0]
        if (firstError?.message) {
          props.onError(firstError.message)
        } else if (acceptedFiles.length > 0) {
          props.onError(RESOURCE_DROP_PATH_UNAVAILABLE_ERROR_MESSAGE)
        }
      })()
    },
  })

  return (
    <div {...getRootProps()} className="relative flex min-h-full flex-col">
      <input {...getInputProps()} />
      {isDragActive ? (
        <div className="absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-border-interactive-base bg-background-base/80 backdrop-blur-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-interactive-weak text-icon-interactive-base">
            <UploadIcon aria-hidden />
          </span>
        </div>
      ) : null}
      {props.children}
    </div>
  )
}
