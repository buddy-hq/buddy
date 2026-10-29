import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { toast } from "@buddy/ui"
import { useDirectoryErrorNotice } from "../src/components/directory-chat/use-directory-error-notice"
import { loadSessions } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import { installTestFetch, restoreTestFetch, seedDirectoryChatState } from "./test-utils"

const DIRECTORY = "/notebooks/heron"

function NoticeProbe() {
  useDirectoryErrorNotice({
    directory: DIRECTORY,
    onCloseNotebook: () => undefined,
    onOpenSettings: () => undefined,
  })
  return null
}

describe("directory error notice", () => {
  let originalFetch: typeof fetch
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    originalFetch = globalThis.fetch
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    restoreTestFetch(originalFetch)
    useChatStore.setState({ directories: {} })
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("shows one notice per new failure while the notebook is open", async () => {
    seedDirectoryChatState(DIRECTORY, { error: { message: "An earlier failure" } })
    const responses = [
      Response.json({ error: "Chats are unavailable" }, { status: 503 }),
      Response.json({ error: "Chats are unavailable" }, { status: 503 }),
      Response.json(
        { error: `Directory not found: ${DIRECTORY}`, code: "notebook.missing" },
        { status: 404 },
      ),
    ]
    installTestFetch(async () => responses.shift() ?? Response.json([]))
    const errorToast = spyOn(toast, "error").mockImplementation(() => "test-toast")
    const warningToast = spyOn(toast, "warning").mockImplementation(() => "test-toast")

    try {
      await act(async () => {
        root.render(<NoticeProbe />)
      })
      expect(errorToast).not.toHaveBeenCalled()

      await act(async () => {
        await loadSessions(DIRECTORY).catch(() => undefined)
        await loadSessions(DIRECTORY).catch(() => undefined)
      })
      expect(errorToast).toHaveBeenCalledTimes(1)
      expect(errorToast).toHaveBeenCalledWith("Chats are unavailable", expect.anything())

      await act(async () => {
        await loadSessions(DIRECTORY).catch(() => undefined)
      })
      expect(warningToast).toHaveBeenCalledWith(
        'Couldn\'t find the "heron" folder',
        expect.objectContaining({ id: `notebook-folder-missing:${DIRECTORY}` }),
      )
      expect(errorToast).toHaveBeenCalledTimes(1)
    } finally {
      errorToast.mockRestore()
      warningToast.mockRestore()
    }
  })
})
