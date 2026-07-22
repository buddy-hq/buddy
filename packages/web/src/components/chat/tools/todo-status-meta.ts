import {
  CancelCircle,
  CheckmarkCircle01,
  Circle,
  Loader2Icon,
  Progress03,
  type AppIcon,
} from "@/icons/app-icons"

import type { TodoStatus } from "./todo-state"

/**
 * Shared presentation metadata for todo statuses. Consumed by the inline todo
 * list, the dock's animated list, and the dock's kanban board so all three
 * surfaces stay visually in sync.
 */

export const SECTION_ORDER: readonly TodoStatus[] = [
  "in_progress",
  "pending",
  "completed",
  "cancelled",
]

export type TodoStatusMeta = {
  labelKey: string
  /** Text color class for the heading + icon accent. */
  accent: string
  TitleIcon: AppIcon
  ItemIcon: AppIcon
  /** Whether the item icon spins while the turn is active. */
  spinItem: boolean
  /** Class list applied to the item label text. */
  itemText: string
  /** completed / cancelled items are struck through and muted. */
  isDone: boolean
}

export const STATUS_META = {
  in_progress: {
    labelKey: "chatTools.todos.section.inProgress",
    accent: "text-text-warning-base",
    TitleIcon: Progress03,
    ItemIcon: Loader2Icon,
    spinItem: true,
    itemText: "text-text-strong",
    isDone: false,
  },
  pending: {
    labelKey: "chatTools.todos.section.pending",
    accent: "text-text-weak",
    TitleIcon: Circle,
    ItemIcon: Circle,
    spinItem: false,
    itemText: "text-text-base",
    isDone: false,
  },
  completed: {
    labelKey: "chatTools.todos.section.completed",
    accent: "text-text-success-base",
    TitleIcon: CheckmarkCircle01,
    ItemIcon: CheckmarkCircle01,
    spinItem: false,
    itemText: "text-text-weak",
    isDone: true,
  },
  cancelled: {
    labelKey: "chatTools.todos.section.cancelled",
    accent: "text-text-critical-base",
    TitleIcon: CancelCircle,
    ItemIcon: CancelCircle,
    spinItem: false,
    itemText: "text-text-weak",
    isDone: true,
  },
} satisfies Record<TodoStatus, TodoStatusMeta>

/** Item icon to show when the status normally spins but the turn is idle. */
export function restingItemIcon(status: TodoStatus): AppIcon {
  const meta = STATUS_META[status]
  return meta.spinItem ? Progress03 : meta.ItemIcon
}
