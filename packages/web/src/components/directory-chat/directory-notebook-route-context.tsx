import { createContext, useContext, useMemo, type ReactNode } from "react"
import {
  useDirectoryChatPageController,
  type DirectoryChatPageControllerState,
} from "@/lib/directory-chat/use-directory-chat-page-controller"

type DirectoryNotebookRouteContextValue = {
  directoryToken: string
  controller: DirectoryChatPageControllerState
}

const DirectoryNotebookRouteContext = createContext<DirectoryNotebookRouteContextValue | undefined>(
  undefined,
)

export function DirectoryNotebookRouteProvider(props: {
  directoryToken: string
  children: ReactNode
}) {
  const controller = useDirectoryChatPageController({
    directoryToken: props.directoryToken,
  })
  const value = useMemo(
    () => ({
      directoryToken: props.directoryToken,
      controller,
    }),
    [controller, props.directoryToken],
  )

  return (
    <DirectoryNotebookRouteContext.Provider value={value}>
      {props.children}
    </DirectoryNotebookRouteContext.Provider>
  )
}

export function useDirectoryNotebookRouteContext() {
  const value = useContext(DirectoryNotebookRouteContext)
  if (!value) {
    throw new Error("DirectoryNotebookRouteContext is not available")
  }
  return value
}
