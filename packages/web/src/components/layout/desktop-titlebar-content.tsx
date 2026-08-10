import { createContext, useContext, type ReactNode } from "react"

const DesktopTitlebarContentTargetContext = createContext<HTMLElement | null>(null)

function DesktopTitlebarContentProvider(props: {
  target: HTMLElement | null
  children: ReactNode
}) {
  return (
    <DesktopTitlebarContentTargetContext.Provider value={props.target}>
      {props.children}
    </DesktopTitlebarContentTargetContext.Provider>
  )
}

function useDesktopTitlebarContentTarget(): HTMLElement | null {
  return useContext(DesktopTitlebarContentTargetContext)
}

export { DesktopTitlebarContentProvider, useDesktopTitlebarContentTarget }
