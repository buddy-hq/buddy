import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { WhiteboardsRevisionReadResponse } from "@buddy/sdk"
import { toEditorElementConversion } from "./whiteboard-elements"

type ShareableWhiteboardRevision = Pick<WhiteboardsRevisionReadResponse, "elements">

async function createWhiteboardShareJson(revision: ShareableWhiteboardRevision): Promise<string> {
  const prepared = toEditorElementConversion(revision.elements)
  const { convertToExcalidrawElements, serializeAsJSON } = await import("@excalidraw/excalidraw")
  const elements = prepared.groups.flatMap((group) =>
    group.kind === "native"
      ? group.elements
      : convertToExcalidrawElements(group.elements, {
          regenerateIds: false,
        }),
  )
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
