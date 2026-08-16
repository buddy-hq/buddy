import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"

import type { TodoItem } from "../src/components/chat/tools/todo-state"
import { TodoDock } from "../src/components/prompt/todo-dock"
import { TodoDockBoardView, TodoDockListView } from "../src/components/prompt/todo-dock-views"
import { TodoDockIndicator } from "../src/components/prompt/todo-dock-indicator"

describe("TodoDock", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    try {
      window.localStorage.clear()
    } catch {
      // ignore
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("renders a full-width scroll region under a quiet title", async () => {
    await act(async () => {
      root.render(
        <TodoDock
          todos={[{ key: "one", content: "Keep the scrollbar at the edge", status: "pending" }]}
          turnActive
          onHide={() => {}}
        />,
      )
    })

    const scrollRegion = container.querySelector<HTMLElement>(
      '[data-component="prompt-todo-scroll"]',
    )
    expect(scrollRegion).not.toBeNull()
    expect(scrollRegion?.classList.contains("w-full")).toBe(true)
    expect(scrollRegion?.classList.contains("overflow-y-auto")).toBe(true)
    // The hand-drawn "Tasks" label sits in flow above the list.
    expect(container.textContent).toContain("Tasks")
  })

  test("keeps the actual task list visible and scrollable at compact heights", async () => {
    await act(async () => {
      root.render(
        <TodoDock
          height={120}
          todos={[{ key: "one", content: "Keep the task visible", status: "in_progress" }]}
          turnActive
          onHide={() => {}}
        />,
      )
    })

    const dock = container.querySelector<HTMLElement>('[data-component="prompt-todo-dock"]')
    const scrollRegion = container.querySelector<HTMLElement>(
      '[data-component="prompt-todo-scroll"]',
    )
    expect(dock?.style.height).toBe("120px")
    expect(scrollRegion?.classList.contains("overflow-y-auto")).toBe(true)
    expect(container.textContent).toContain("Keep the task visible")
    expect(container.querySelector('button[aria-label="Board view"]')).toBeNull()
  })

  test("lets the list hug its content while capping at the host-provided max", async () => {
    await act(async () => {
      root.render(
        <TodoDock
          height={320}
          todos={[{ key: "one", content: "Hug the content", status: "pending" }]}
          turnActive
          onHide={() => {}}
        />,
      )
    })

    const listDock = container.querySelector<HTMLElement>('[data-component="prompt-todo-dock"]')
    // Capped, but not pinned to a fixed height — a short list stays compact.
    expect(listDock?.style.maxHeight).toBe("320px")
    expect(listDock?.style.height).toBe("")
  })

  test("persists the selected view across mounts and fills the board height", async () => {
    window.localStorage.setItem("buddy.todoDock.view", "board")

    await act(async () => {
      root.render(
        <TodoDock
          height={320}
          todos={[{ key: "0:doing", content: "Persisted", status: "in_progress" }]}
          turnActive
          onHide={() => {}}
        />,
      )
    })

    // Board columns render (not the list scroll region) because the stored
    // preference was honoured on mount.
    expect(container.querySelector('[data-column="in_progress"]')).not.toBeNull()
    expect(container.querySelector('[data-component="prompt-todo-scroll"]')).toBeNull()

    // Board fills the shared host budget so its columns can stretch.
    const boardDock = container.querySelector<HTMLElement>('[data-component="prompt-todo-dock"]')
    expect(boardDock?.style.height).toBe("320px")
  })

  test("switches compact board presentation at the same breakpoint in both directions", async () => {
    window.localStorage.setItem("buddy.todoDock.view", "board")
    const todo: TodoItem = {
      key: "0:responsive",
      content: "Resize both ways",
      status: "in_progress",
    }

    await act(async () => {
      root.render(<TodoDock height={200} todos={[todo]} turnActive onHide={() => {}} />)
    })
    expect(container.querySelector('[data-component="prompt-todo-scroll"]')).not.toBeNull()
    expect(container.querySelector('[data-column="in_progress"]')).toBeNull()

    await act(async () => {
      root.render(<TodoDock height={240} todos={[todo]} turnActive onHide={() => {}} />)
    })
    expect(container.querySelector('[data-component="prompt-todo-scroll"]')).toBeNull()
    expect(container.querySelector('[data-column="in_progress"]')).not.toBeNull()

    await act(async () => {
      root.render(<TodoDock height={200} todos={[todo]} turnActive onHide={() => {}} />)
    })
    expect(container.querySelector('[data-component="prompt-todo-scroll"]')).not.toBeNull()
    expect(container.querySelector('[data-column="in_progress"]')).toBeNull()
  })

  test("offers list and board view toggles", async () => {
    await act(async () => {
      root.render(
        <TodoDock
          todos={[{ key: "one", content: "Toggle me", status: "pending" }]}
          turnActive
          onHide={() => {}}
        />,
      )
    })

    expect(container.querySelector('button[aria-label="List view"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Board view"]')).not.toBeNull()
  })

  test("board view lays todos into their status columns", async () => {
    const todos: TodoItem[] = [
      { key: "0:doing", content: "Doing now", status: "in_progress" },
      { key: "1:todo", content: "Still queued", status: "pending" },
      { key: "2:done", content: "All finished", status: "completed" },
    ]

    await act(async () => {
      root.render(<TodoDockBoardView todos={todos} turnActive />)
    })

    const inProgress = container.querySelector<HTMLElement>('[data-column="in_progress"]')
    const pending = container.querySelector<HTMLElement>('[data-column="pending"]')
    const completed = container.querySelector<HTMLElement>('[data-column="completed"]')

    expect(inProgress?.textContent).toContain("Doing now")
    expect(pending?.textContent).toContain("Still queued")
    expect(completed?.textContent).toContain("All finished")
    // Primary columns always render so cards can travel between them.
    expect(container.querySelector('[data-column="cancelled"]')).toBeNull()

    // Columns follow the To-do → Doing → Done lifecycle, left to right.
    const order = Array.from(container.querySelectorAll<HTMLElement>("[data-column]")).map(
      (column) => column.dataset.column,
    )
    expect(order).toEqual(["pending", "in_progress", "completed"])
  })

  test("board view reveals the cancelled column only when needed", async () => {
    await act(async () => {
      root.render(
        <TodoDockBoardView
          todos={[{ key: "0:x", content: "Abandoned", status: "cancelled" }]}
          turnActive={false}
        />,
      )
    })

    const cancelled = container.querySelector<HTMLElement>('[data-column="cancelled"]')
    expect(cancelled?.textContent).toContain("Abandoned")
  })

  test("list view keeps a stable shared id as todos change status", async () => {
    const todo: TodoItem = { key: "0:ship", content: "Ship it", status: "pending" }

    await act(async () => {
      root.render(<TodoDockListView todos={[todo]} turnActive />)
    })

    const pendingRow = container.querySelector<HTMLElement>('li[data-state="pending"]')
    expect(pendingRow?.textContent).toContain("Ship it")

    await act(async () => {
      root.render(<TodoDockListView todos={[{ ...todo, status: "completed" }]} turnActive />)
    })

    const completedRow = container.querySelector<HTMLElement>('li[data-state="completed"]')
    expect(completedRow?.textContent).toContain("Ship it")
    expect(container.querySelector('li[data-state="pending"]')).toBeNull()
  })

  test("uses status affordances only while the turn is active", async () => {
    const completedTodo: TodoItem = { key: "one", content: "Finished", status: "completed" }

    await act(async () => {
      root.render(
        <TodoDockIndicator
          revision="revision-idle"
          todos={[completedTodo]}
          turnActive={false}
          isCurrentTurn={false}
          selected={false}
          statusDurationMs={10}
          statusDebounceMs={5}
        />,
      )
    })

    expect(container.querySelector('[data-todo-indicator-state="idle"]')).not.toBeNull()

    await act(async () => {
      root.render(
        <TodoDockIndicator
          revision="revision-idle"
          todos={[{ ...completedTodo, status: "in_progress" }]}
          turnActive
          isCurrentTurn
          selected={false}
          statusDurationMs={10}
          statusDebounceMs={5}
        />,
      )
    })

    expect(container.querySelector('[data-todo-indicator-state="idle"]')).not.toBeNull()

    await act(async () => {
      root.render(
        <TodoDockIndicator
          revision="revision-active"
          todos={[{ ...completedTodo, status: "in_progress" }]}
          turnActive
          isCurrentTurn
          selected={false}
          statusDurationMs={10}
          statusDebounceMs={5}
        />,
      )
    })

    expect(container.querySelector('[data-todo-indicator-state="idle"]')).not.toBeNull()

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 7)
      })
    })

    const activeIndicator = container.querySelector('[data-todo-indicator-state="in_progress"]')
    expect(activeIndicator).not.toBeNull()
    expect(
      activeIndicator?.querySelector("svg")?.classList.contains("motion-safe:animate-spin"),
    ).toBe(true)

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 12)
      })
    })

    expect(container.querySelector('[data-todo-indicator-state="idle"]')).not.toBeNull()
  })

  test("coalesces rapid todo revisions before showing their status", async () => {
    const baseTodo: TodoItem = { key: "one", content: "One task", status: "in_progress" }

    await act(async () => {
      root.render(
        <StrictMode>
          <TodoDockIndicator
            revision="revision-one"
            todos={[baseTodo]}
            turnActive
            isCurrentTurn
            selected={false}
            statusDurationMs={20}
            statusDebounceMs={5}
          />
        </StrictMode>,
      )
    })

    await act(async () => {
      root.render(
        <StrictMode>
          <TodoDockIndicator
            revision="revision-two"
            todos={[{ ...baseTodo, status: "completed" }]}
            turnActive
            isCurrentTurn
            selected={false}
            statusDurationMs={20}
            statusDebounceMs={5}
          />
        </StrictMode>,
      )
    })

    expect(container.querySelector('[data-todo-indicator-state="idle"]')).not.toBeNull()

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 7)
      })
    })

    expect(container.querySelector('[data-todo-indicator-state="completed"]')).not.toBeNull()
    expect(container.querySelector('[data-todo-indicator-state="in_progress"]')).toBeNull()
  })
})
