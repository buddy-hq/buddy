import { ProjectIcon } from "./sidebar-items"
import { HelpIcon, PlusIcon, SettingsIcon } from "./sidebar-icons"

type SidebarProjectProps = {
  openProjects: string[]
  currentDirectory?: string
  onSelectProject: (directory: string) => void
  onOpenProject: () => void
}

export function SidebarProject(props: SidebarProjectProps) {
  return (
    <aside className="hidden md:flex w-16 shrink-0 bg-background flex-col items-center border-r">
      <div className="flex-1 min-h-0 w-full overflow-y-auto py-3 px-2 flex flex-col items-center gap-3">
        {props.openProjects.map((project) => (
          <ProjectIcon
            key={project}
            project={project}
            active={project === props.currentDirectory}
            onClick={() => props.onSelectProject(project)}
          />
        ))}

        <button
          type="button"
          onClick={props.onOpenProject}
          className="size-10 rounded-lg border border-dashed border-border text-lg leading-none hover:bg-muted/60 transition-colors"
          title="Open project"
        >
          <PlusIcon className="size-4 mx-auto" />
        </button>
      </div>

      <div className="w-full py-4 flex flex-col items-center gap-2 border-t">
        <button
          type="button"
          className="size-8 rounded-md text-xs text-muted-foreground hover:bg-muted/60"
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="size-3.5 mx-auto" />
        </button>
        <button
          type="button"
          className="size-8 rounded-md text-xs text-muted-foreground hover:bg-muted/60"
          title="Help"
          aria-label="Help"
        >
          <HelpIcon className="size-3.5 mx-auto" />
        </button>
      </div>
    </aside>
  )
}
