import { Button, ComposerDock, ToggleGroup, ToggleGroupItem, cn } from "@buddy/ui"
import { motion } from "motion/react"

import "@/components/chat/tools/render/todo-canvas.css"

import type { TodoItem } from "@/components/chat/tools/todo-state"
import { language } from "@/context/language"
import { Kanban, ListIcon, MinusIcon } from "@/icons/app-icons"

import { useTodoDockView } from "./todo-dock-view-preference"
import { TodoDockBoardView, TodoDockListView } from "./todo-dock-views"

const TODO_DOCK_TRANSITION = {
  duration: 0.18,
  ease: [0.23, 1, 0.32, 1],
} as const

type TodoDockProps = {
  todos: TodoItem[]
  turnActive: boolean
  onHide: () => void
  className?: string
}

export function TodoDock(props: TodoDockProps) {
  const [view, setView] = useTodoDockView()

  return (
    <motion.div
      initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
      animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
      exit={{ opacity: 0, transform: "translateY(4px) scale(0.98)" }}
      transition={TODO_DOCK_TRANSITION}
      className="w-full"
    >
      <ComposerDock
        size="auto"
        autoFocus={false}
        className={cn(
          // The list hugs its content (a short list shouldn't float at the top
          // of a tall empty box); the board fills a fixed height so its columns
          // can stretch. Both cap at the same screen-relative max.
          "relative max-h-[min(20rem,50vh)]",
          view === "board" && "h-[min(20rem,50vh)]",
          props.className,
        )}
        data-component="prompt-todo-dock"
      >
        {/* No header chrome — just a minimal control cluster floating top-right. */}
        <div className="pointer-events-none absolute right-0 top-0 z-20 flex justify-end p-2">
          <div className="composer-surface-menu composer-grain pointer-events-auto relative flex items-center gap-0.5 p-1 [@media(max-height:640px)]:p-0.5">
            <ToggleGroup
              type="single"
              size="sm"
              spacing={1}
              value={view}
              onValueChange={(next) => {
                if (next === "list" || next === "board") setView(next)
              }}
              aria-label={language.t("prompt.todoDock.viewLabel")}
            >
              <ToggleGroupItem
                value="list"
                className="h-6 min-w-6 px-1.5 [@media(max-height:640px)]:h-5 [@media(max-height:640px)]:min-w-5 [@media(max-height:640px)]:px-1"
                aria-label={language.t("prompt.todoDock.viewListAria")}
                title={language.t("prompt.todoDock.viewListAria")}
              >
                <ListIcon className="size-3.5 [@media(max-height:640px)]:size-3" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="board"
                className="h-6 min-w-6 px-1.5 [@media(max-height:640px)]:h-5 [@media(max-height:640px)]:min-w-5 [@media(max-height:640px)]:px-1"
                aria-label={language.t("prompt.todoDock.viewBoardAria")}
                title={language.t("prompt.todoDock.viewBoardAria")}
              >
                <Kanban className="size-3.5 [@media(max-height:640px)]:size-3" />
              </ToggleGroupItem>
            </ToggleGroup>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border-weak-base/60 [@media(max-height:640px)]:h-3" />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="[@media(max-height:640px)]:size-5"
              onClick={props.onHide}
              aria-label={language.t("prompt.todoDock.hideAria")}
              title={language.t("prompt.todoDock.hideTitle")}
            >
              <MinusIcon />
            </Button>
          </div>
        </div>

        {/* Quiet hand-drawn title, in flow directly above the content (tall
            enough to clear the floating pill on its right). Shrinks on short
            viewports — the pill is absolute and shrinks with it, so the board's
            top padding absorbs any overhang. */}
        <div className="flex h-11 shrink-0 items-center px-4 [@media(max-height:640px)]:h-9 [@media(max-height:480px)]:h-8">
          <span className="todo-canvas-heading select-none text-sm font-bold tracking-wide text-text-weak [@media(max-height:640px)]:text-xs">
            {language.t("prompt.todoDock.title")}
          </span>
        </div>

        {view === "board" ? (
          <TodoDockBoardView todos={props.todos} turnActive={props.turnActive} />
        ) : (
          <div
            className="composer-scroll-hover min-h-0 w-full flex-1 overflow-y-auto px-4 pb-4"
            data-component="prompt-todo-scroll"
          >
            <TodoDockListView todos={props.todos} turnActive={props.turnActive} />
          </div>
        )}
      </ComposerDock>
    </motion.div>
  )
}
