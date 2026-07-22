const FILE_DRAG_DATA_TYPE = "Files" as const

type FileDragEvent = {
  dataTransfer: {
    types: ArrayLike<string>
  }
  preventDefault: () => void
}

export function preventDefaultForFileDrag(event: FileDragEvent): boolean {
  const hasFiles = Array.from(event.dataTransfer.types).includes(FILE_DRAG_DATA_TYPE)
  if (!hasFiles) return false

  event.preventDefault()
  return true
}
