import type { ComponentProps } from "react"
import { cn } from "@buddy/ui"
import { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"
import { SkillsPage } from "@/components/skills/skills-page"
import {
  DIRECTORY_CHAT_SHELL_VIEW,
  type DirectoryChatShellView,
} from "@/lib/directory-chat/directory-chat-shell-view"

type DirectoryChatConversationPaneProps = ComponentProps<typeof DirectoryChatMainPane> & {
  shellView?: DirectoryChatShellView
  className?: string
}

export function DirectoryChatConversationPane(props: DirectoryChatConversationPaneProps) {
  const { className, shellView, ...mainPaneProps } = props
  const showingSkills = shellView === DIRECTORY_CHAT_SHELL_VIEW.SKILLS

  return (
    <div
      data-component="directory-chat-conversation-pane"
      data-main-pane={showingSkills ? "skills" : "chat"}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-stronger [view-transition-name:buddy-chat-conversation]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {showingSkills ? (
          <div className="scrollbar-hover h-full min-h-0 overflow-y-auto p-4">
            <div className="mx-auto w-full max-w-full md:max-w-200 2xl:max-w-[1000px]">
              <SkillsPage directory={mainPaneProps.directory} />
            </div>
          </div>
        ) : (
          <DirectoryChatMainPane {...mainPaneProps} />
        )}
      </div>
    </div>
  )
}
