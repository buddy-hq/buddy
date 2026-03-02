import type { ReactNode } from "react"
import { SidebarProject } from "./sidebar-project"
import { sidebarExpanded } from "./sidebar-shell-helpers"

type SidebarShellProps = {
  openProjects: string[]
  currentDirectory?: string
  sidebarOpen: boolean
  onSelectProject: (directory: string) => void
  onOpenProject: () => void
  panel: ReactNode
  content: ReactNode
}

export function SidebarShell(props: SidebarShellProps) {
  const expanded = sidebarExpanded(false, props.sidebarOpen)

  return (
    <div className="h-screen w-full overflow-hidden bg-card flex flex-col md:flex-row">
      <SidebarProject
        openProjects={props.openProjects}
        currentDirectory={props.currentDirectory}
        onSelectProject={props.onSelectProject}
        onOpenProject={props.onOpenProject}
      />
      {expanded ? props.panel : null}
      {props.content}
    </div>
  )
}
