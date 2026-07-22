import { useState } from "react"
import { Badge, Button, cn } from "@buddy/ui"
import {
  CancelCircle,
  CheckmarkCircle01,
  Circle,
  Loader2Icon,
  Progress03,
} from "@/icons/app-icons"
import "@/components/prompt/composer-surfaces.css"
import "@/components/directory-chat/chat-empty-state-board.css"

type TodoStatus = "completed" | "in_progress" | "pending" | "cancelled"

type TodoItem = {
  key: string
  content: string
  status: TodoStatus
}

// ─── STATE PRESETS FOR MAPPING ALL POSSIBLE STATES ─────────────────────
type StatePreset = {
  id: string
  label: string
  description: string
  todos: TodoItem[]
}

const STATE_PRESETS: StatePreset[] = [
  {
    id: "active-mixed",
    label: "1. Active Execution (2 Doing · 4 Todo · 2 Done)",
    description: "Standard live execution with items across all stages.",
    todos: [
      { key: "0:in_progress", content: "Call remaining tools (batch 2: writes & renders)", status: "in_progress" },
      { key: "1:in_progress", content: "Execute subagent delegater for concurrent task", status: "in_progress" },
      { key: "2:pending", content: "Generate 20 Mermaid diagrams with varied types", status: "pending" },
      { key: "3:pending", content: "Present 30 media items from Desktop", status: "pending" },
      { key: "4:pending", content: "Stress test LaTeX with 30+ equations across subjects", status: "pending" },
      { key: "5:pending", content: "Interrupted-tail stress section", status: "pending" },
      { key: "6:completed", content: "Call available tool batch 1 (harmless reads)", status: "completed" },
      { key: "7:completed", content: "Inspect workspace structure and files", status: "completed" },
    ],
  },
  {
    id: "only-doing-todo",
    label: "2. Initial Run (2 Doing · 6 Todo · 0 Done)",
    description: "Start of task run before any item completes. Done & Cancelled sections are hidden.",
    todos: [
      { key: "0:in_progress", content: "Parse input directives and set up workspace", status: "in_progress" },
      { key: "1:in_progress", content: "Initialize streaming session", status: "in_progress" },
      { key: "2:pending", content: "Execute read commands", status: "pending" },
      { key: "3:pending", content: "Execute write commands", status: "pending" },
      { key: "4:pending", content: "Build web components", status: "pending" },
      { key: "5:pending", content: "Run typecheck verification", status: "pending" },
      { key: "6:pending", content: "Run lint verification", status: "pending" },
      { key: "7:pending", content: "Generate walkthrough document", status: "pending" },
    ],
  },
  {
    id: "only-inprogress",
    label: "3. Only In Progress (4 Doing · 0 Todo · 0 Done)",
    description: "All active items running concurrently. Todo, Done & Cancelled sections are hidden.",
    todos: [
      { key: "0:in_progress", content: "Running subagent worker #1 (Backend API)", status: "in_progress" },
      { key: "1:in_progress", content: "Running subagent worker #2 (Frontend UI)", status: "in_progress" },
      { key: "2:in_progress", content: "Running typecheck lock validator", status: "in_progress" },
      { key: "3:in_progress", content: "Streaming real-time execution logs", status: "in_progress" },
    ],
  },
  {
    id: "all-done",
    label: "4. All Completed (0 Doing · 0 Todo · 6 Done)",
    description: "Task run finished cleanly. In Progress, Todo & Cancelled sections are hidden.",
    todos: [
      { key: "0:completed", content: "Call available tool batch 1 (harmless reads)", status: "completed" },
      { key: "1:completed", content: "Inspect workspace structure and files", status: "completed" },
      { key: "2:completed", content: "Execute remaining write tools", status: "completed" },
      { key: "3:completed", content: "Build React components with shadcn primitives", status: "completed" },
      { key: "4:completed", content: "Run typecheck verification pass", status: "completed" },
      { key: "5:completed", content: "Generate walkthrough report", status: "completed" },
    ],
  },
  {
    id: "interrupted",
    label: "5. Partial Failure (1 Doing · 2 Todo · 2 Done · 1 Cancelled)",
    description: "Renders CANCELLED as its own distinct section.",
    todos: [
      { key: "0:in_progress", content: "Retrying fallback tool call execution", status: "in_progress" },
      { key: "1:pending", content: "Verify updated output artifacts", status: "pending" },
      { key: "2:pending", content: "Finalize transcript summary", status: "pending" },
      { key: "3:completed", content: "Read initial config file", status: "completed" },
      { key: "4:completed", content: "Parse input parameters", status: "completed" },
      { key: "5:cancelled", content: "Legacy tool call (cancelled due to timeout)", status: "cancelled" },
    ],
  },
  {
    id: "single-item",
    label: "6. Single Active Step (1 Doing · 0 Todo · 0 Done)",
    description: "Compact 1-task live status.",
    todos: [
      { key: "0:in_progress", content: "Executing single atomic file edit operation", status: "in_progress" },
    ],
  },
]

function cycleTodoStatus(current: TodoStatus): TodoStatus {
  const map: Record<TodoStatus, TodoStatus> = {
    pending: "in_progress",
    in_progress: "completed",
    completed: "cancelled",
    cancelled: "pending",
  }
  return map[current]
}

// ─── CHOSEN DESIGN: Whiteboard Paper-Grain Surface (Indented Task Icons) ──────
function WhiteboardTaskCanvas({
  todos,
  onToggle,
}: {
  todos: TodoItem[]
  onToggle: (key: string) => void
}) {
  const inProgressItems = todos.filter((t) => t.status === "in_progress")
  const pendingItems = todos.filter((t) => t.status === "pending")
  const completedItems = todos.filter((t) => t.status === "completed")
  const cancelledItems = todos.filter((t) => t.status === "cancelled")

  // Strict Stage Order with requested Hugeicons:
  // 1. IN PROGRESS (progress-03 ONLY in title header)
  // 2. TODO (circle icon)
  // 3. DONE (checkmark-circle-01 icon)
  // 4. CANCELLED (cancel-circle icon)
  const rawStages = [
    {
      id: "in_progress",
      label: "IN PROGRESS",
      items: inProgressItems,
      color: "text-text-warning-base",
      titleIcon: <Progress03 className="size-4 text-text-warning-base shrink-0" />,
    },
    {
      id: "pending",
      label: "TODO",
      items: pendingItems,
      color: "text-text-weak",
      titleIcon: <Circle className="size-3.5 text-text-weak shrink-0" />,
    },
    {
      id: "completed",
      label: "DONE",
      items: completedItems,
      color: "text-text-success-base",
      titleIcon: <CheckmarkCircle01 className="size-3.5 text-text-success-base shrink-0" />,
    },
    {
      id: "cancelled",
      label: "CANCELLED",
      items: cancelledItems,
      color: "text-text-critical-base",
      titleIcon: <CancelCircle className="size-3.5 text-text-critical-base shrink-0" />,
    },
  ]

  // Only show stages that have items > 0! (Empty stages are hidden)
  const activeStages = rawStages.filter((stage) => stage.items.length > 0)

  return (
    <div className="relative composer-surface composer-grain p-4 shadow-md border border-border-weak-base/30">
      {/* Stages Content container */}
      <div className="max-h-48 overflow-y-auto composer-scroll-hover pr-1 space-y-5">
        {activeStages.map((stage) => (
          <div key={stage.id} className="space-y-2">
            {/* Stage Title Header */}
            <div className="flex items-center gap-2 px-0.5">
              {stage.titleIcon}
              <span className={cn("[font-family:Excalifont,sans-serif] text-sm font-bold tracking-wide", stage.color)}>
                {stage.label} ({stage.items.length})
              </span>
            </div>

            {/* Task Items indented by pl-6 (24px) so item icons align with first letter of stage title */}
            <div className="pl-6 space-y-1.5">
              {stage.items.map((todo) => {
                const isDoing = todo.status === "in_progress"
                const isDone = todo.status === "completed"
                const isCancelled = todo.status === "cancelled"

                return (
                  <div
                    key={todo.key}
                    onClick={() => onToggle(todo.key)}
                    className="group flex cursor-pointer items-start gap-2.5 py-0.5 transition-opacity hover:opacity-80 active:scale-[0.99]"
                  >
                    <div className="mt-0.5 shrink-0 flex items-center justify-center">
                      {isDone && <CheckmarkCircle01 className="size-3.5 text-text-success-base shrink-0" />}
                      {isDoing && <Loader2Icon className="size-3.5 text-text-warning-base animate-spin shrink-0" />}
                      {todo.status === "pending" && <Circle className="size-3.5 text-text-weak shrink-0" />}
                      {isCancelled && <CancelCircle className="size-3.5 text-text-critical-base shrink-0" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "leading-normal block text-sm font-normal text-text-weak",
                          (isDone || isCancelled) && "line-through decoration-text-weaker opacity-80",
                        )}
                      >
                        {todo.content}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN EASEL CONTAINER ────────────────────────────────────────────
export function InlineTodoRedesignsEasel() {
  const [activePresetId, setActivePresetId] = useState<string>("active-mixed")
  const currentPreset = STATE_PRESETS.find((p) => p.id === activePresetId) || STATE_PRESETS[0]
  const [todos, setTodos] = useState<TodoItem[]>(currentPreset.todos)

  const handleSelectPreset = (preset: StatePreset) => {
    setActivePresetId(preset.id)
    setTodos(preset.todos)
  }

  const handleToggle = (key: string) => {
    setTodos((prev) =>
      prev.map((t) => {
        if (t.key !== key) return t
        return { ...t, status: cycleTodoStatus(t.status) }
      })
    )
  }

  const handleReset = () => {
    setTodos(currentPreset.todos)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      {/* Easel Header */}
      <div className="shrink-0 space-y-2 border-b border-border-base px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-text-strong">
              Whiteboard Task Canvas (`todo.tsx`) · Title Aligned Task Icons
            </h2>
            <p className="text-xs text-text-weak">
              Task icons indented with `pl-6` (24px) to align exactly under the first letter of stage titles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReset}>
              Reset State
            </Button>
            <Badge variant="outline">Selected Option</Badge>
          </div>
        </div>

        {/* State Preset Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          {STATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors shrink-0 ${
                activePresetId === preset.id
                  ? "bg-surface-interactive-weak text-text-interactive-base font-bold"
                  : "text-text-weak hover:bg-surface-weak hover:text-text-base font-medium"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content View */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-xl space-y-8">
          {/* Active Preset Card */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between border-b border-border-base pb-1">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-text-strong">
                {currentPreset.label}
              </h3>
              <span className="text-xs text-text-weak font-medium">{currentPreset.description}</span>
            </div>

            <WhiteboardTaskCanvas todos={todos} onToggle={handleToggle} />
          </section>

          {/* All States Overview Section */}
          <section className="space-y-6 pt-4 border-t border-border-base">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-text-strong">
              All 6 Runtime States Overview
            </h3>

            {STATE_PRESETS.map((preset) => (
              <div key={preset.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-text-weak">
                  <span className="font-bold text-text-strong">{preset.label}</span>
                  <span>{preset.description}</span>
                </div>
                <WhiteboardTaskCanvas
                  todos={preset.todos}
                  onToggle={() => {}}
                />
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}
