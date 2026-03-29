import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@buddy/ui"
import { language } from "@/context/language"
import { FolderPlusIcon, SlidersHorizontalIcon } from "../sidebar-icons"
import type { OrganizeMode, ShowMode, SortMode } from "./types"

type ChatLeftSidebarToolbarProps = {
  currentDirectory: string
  organizeMode: OrganizeMode
  sortMode: SortMode
  showMode: ShowMode
  onNewSession: (directory?: string) => void
  onOpenDirectory: () => void
  onOrganizeModeChange: (mode: OrganizeMode) => void
  onSortModeChange: (mode: SortMode) => void
  onShowModeChange: (mode: ShowMode) => void
}

export function ChatLeftSidebarToolbar(props: ChatLeftSidebarToolbarProps) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between px-2 text-text-weaker">
        <p className="text-[13px] font-medium">{language.t("sidebar.threads")}</p>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-text-weak hover:bg-surface-raised-base-hover hover:text-text-strong"
                aria-label={language.t("sidebar.addNotebook")}
                title={language.t("sidebar.addNotebook")}
                onClick={props.onOpenDirectory}
              >
                <FolderPlusIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="px-2 py-1 text-[11px]">
              {language.t("sidebar.addNotebook")}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-raised-base-hover hover:text-text-strong"
                aria-label={language.t("sidebar.organizeThreads")}
                title={language.t("sidebar.organizeThreads")}
              >
                <SlidersHorizontalIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-56 min-w-56">
              <DropdownMenuLabel>{language.t("sidebar.organize")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.organizeMode}
                onValueChange={(value) => {
                  if (value === "project" || value === "chronological") {
                    props.onOrganizeModeChange(value)
                  }
                }}
              >
                <DropdownMenuRadioItem value="project">
                  {language.t("sidebar.organizeByNotebook")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="chronological">
                  {language.t("sidebar.organizeChronological")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{language.t("sidebar.sortBy")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.sortMode}
                onValueChange={(value) => {
                  if (value === "created" || value === "updated") {
                    props.onSortModeChange(value)
                  }
                }}
              >
                <DropdownMenuRadioItem value="created">
                  {language.t("sidebar.sortCreated")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="updated">
                  {language.t("sidebar.sortUpdated")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{language.t("sidebar.show")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={props.showMode}
                onValueChange={(value) => {
                  if (value === "all" || value === "relevant") {
                    props.onShowModeChange(value)
                  }
                }}
              >
                <DropdownMenuRadioItem value="all">
                  {language.t("sidebar.showAllThreads")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="relevant">
                  {language.t("sidebar.showRelevant")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  )
}
