import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { PersistedWhiteboardElement } from "./whiteboard-elements"
import { toEditorElementConversion } from "./whiteboard-elements"

type ShareableWhiteboardBoard = {
  elements: PersistedWhiteboardElement[]
}

async function createWhiteboardShareJson(board: ShareableWhiteboardBoard): Promise<string> {
  const prepared = toEditorElementConversion(board.elements)
  const { convertToExcalidrawElements, serializeAsJSON } = await import("@excalidraw/excalidraw")
  const elements = prepared.groups.flatMap((group) => {
    if (group.kind === "native") return group.elements
    return convertToExcalidrawElements(group.elements, {
      regenerateIds: false,
    })
  })
  if (elements.length === 0) {
    throw new Error("The board has no shareable elements.")
  }
  const appState: Partial<AppState> = {
    exportBackground: true,
    viewBackgroundColor: "#ffffff",
  }
  const files: BinaryFiles = {}
  return serializeAsJSON(elements, appState, files, "database")
}

export { createWhiteboardShareJson }
