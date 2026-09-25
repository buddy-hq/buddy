import { createContext } from "react"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"

export type DirectoryNotebookRouteContextValue = {
  directoryToken: string
  controller: DirectoryChatPageControllerState
}

/** Keep the context identity stable when the provider implementation is hot reloaded. */
export const DirectoryNotebookRouteContext = createContext<
  DirectoryNotebookRouteContextValue | undefined
>(undefined)
