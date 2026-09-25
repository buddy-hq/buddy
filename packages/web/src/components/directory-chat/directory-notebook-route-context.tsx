import { useContext, useMemo, type ReactNode } from "react"
import { useDirectoryChatPageController } from "@/lib/directory-chat/use-directory-chat-page-controller"
import { DirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context-value"

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
