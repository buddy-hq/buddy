import "../happydom"
import { TooltipProvider } from "@buddy/ui"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { AssistantPartRenderer } from "../src/components/chat/parts/assistant-part/assistant-part"
import { MermaidInlineView } from "../src/components/media/renderers/mermaid/mermaid-inline-view"
import { MermaidToolCard } from "../src/components/media/renderers/mermaid/mermaid-tool-card"
import type { MermaidViewportController } from "../src/components/media/renderers/mermaid/use-mermaid-viewport"
import { SubagentCard } from "../src/components/chat/tools/render/task/subagent-card"
import { taskCardEnterInitial } from "../src/components/chat/tools/render/task-motion"
import { ToolStatusIndicator } from "../src/components/chat/tools/tool-header"
import { activityPresentation, presentationMetadata } from "./tool-presentation-fixtures"

function createMermaidViewport(isInitialized: boolean): MermaidViewportController {
  return {
    viewportRef: createRef<HTMLDivElement>(),
    svgHostRef: createRef<HTMLDivElement>(),
    svgBounds: { width: 100, height: 100 },
    renderedWidth: 100,
    renderedHeight: 100,
    svgHostWidth: 100,
    svgHostHeight: 100,
    canvasWidth: 100,
    canvasHeight: 100,
    contentOffsetX: 0,
    contentOffsetY: 0,
    canvasPadding: 0,
    zoom: 1,
    zoomLabel: "100%",
    isAutoZoom: true,
    isInitialized,
    isDragging: false,
    canZoomIn: true,
    canZoomOut: true,
    handlePointerDown: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    resetZoom: () => {},
  }
}

describe("transcript artifact motion", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function renderHistoryTool() {
    root.render(
      <TooltipProvider>
        <AssistantPartRenderer
          part={{
            id: "prt_history_shell",
            sessionID: "ses_history",
            messageID: "msg_history",
            callID: "call_history_shell",
            type: "tool",
            tool: "bash",
            metadata: presentationMetadata(
              activityPresentation({
                phase: "completed",
                action: "Ran",
                category: "command",
                summary: "bash",
                detail: "history-artifact",
              }),
            ),
            state: {
              status: "completed",
              input: {
                command: "printf history-artifact",
              },
              metadata: {},
              output: "history-artifact",
              title: "bash",
              time: { start: 1, end: 2 },
            },
          }}
          defaultOpen
        />
      </TooltipProvider>,
    )
  }

  function expectHistoryToolAtFinalGeometry() {
    const wrapper = container.querySelector('[data-component="tool-part-wrapper"]')
    expect(wrapper).toBeInstanceOf(HTMLDivElement)
    if (!(wrapper instanceof HTMLDivElement)) {
      throw new Error("Expected the tool-part wrapper to render")
    }

    expect(wrapper.getAttribute("style")).toBeNull()
    expect(wrapper.textContent).toContain("history-artifact")
  }

  test("renders history tool content at final geometry after each mount", () => {
    act(renderHistoryTool)
    expectHistoryToolAtFinalGeometry()

    act(() => {
      root.render(null)
    })
    act(renderHistoryTool)
    expectHistoryToolAtFinalGeometry()
  })

  function renderMermaidCard() {
    root.render(
      <MermaidToolCard
        title="History diagram"
        diagramType="flowchart"
        hideStatus
        contentClassName="h-[30rem]"
      >
        <div data-component="ready-mermaid-content">Rendered diagram</div>
      </MermaidToolCard>,
    )
  }

  function expectMermaidCardAtFinalGeometry() {
    const card = container.querySelector('[data-component="object-card"]')
    expect(card).toBeInstanceOf(HTMLDivElement)
    if (!(card instanceof HTMLDivElement)) {
      throw new Error("Expected the Mermaid object card to render")
    }

    expect(card.getAttribute("style")).toBeNull()
    expect(container.querySelector('[data-component="ready-mermaid-content"]')).not.toBeNull()
    expect(
      Array.from(card.querySelectorAll("div")).some((element) =>
        element.classList.contains("h-[30rem]"),
      ),
    ).toBe(true)
  }

  test("keeps remounted Mermaid card content visible in its fixed shell", () => {
    act(renderMermaidCard)
    expectMermaidCardAtFinalGeometry()

    act(() => {
      root.render(null)
    })
    act(renderMermaidCard)
    expectMermaidCardAtFinalGeometry()
  })

  test("gates the Mermaid SVG until its first fit without fading on resize", () => {
    act(() => {
      root.render(
        <MermaidInlineView ariaLabel="Readiness diagram" viewport={createMermaidViewport(false)} />,
      )
    })

    const host = container.querySelector('[data-component="mermaid-diagram"]')
    expect(host?.classList.contains("opacity-0")).toBe(true)
    expect(host?.classList.contains("transition-opacity")).toBe(false)

    act(() => {
      root.render(
        <MermaidInlineView ariaLabel="Readiness diagram" viewport={createMermaidViewport(true)} />,
      )
    })

    expect(
      container
        .querySelector('[data-component="mermaid-diagram"]')
        ?.classList.contains("opacity-100"),
    ).toBe(true)
  })

  test("renders completed subagent content at final geometry after remount", () => {
    const renderCompletedCard = () => {
      root.render(
        <TooltipProvider>
          <SubagentCard taskTitle="Inspect transcript" status="completed">
            <div>Completed artifact</div>
          </SubagentCard>
        </TooltipProvider>,
      )
    }

    const expectFinalBodyGeometry = () => {
      const body = container.querySelector('[data-component="subagent-card-completed-body"]')
      expect(body).not.toBeNull()
      expect(body?.getAttribute("style")).not.toContain("height")
      expect(body?.textContent).toContain("Completed artifact")
    }

    act(renderCompletedCard)
    expectFinalBodyGeometry()

    act(() => {
      root.render(null)
    })
    act(renderCompletedCard)
    expectFinalBodyGeometry()
  })

  test("does not replay the error indicator transition on remount", () => {
    const renderError = () => {
      root.render(<ToolStatusIndicator status="error" />)
    }

    const expectVisibleError = () => {
      const indicator = container.querySelector("span")
      expect(indicator).not.toBeNull()
      expect(indicator?.getAttribute("style")).not.toContain("scale(0)")
      expect(indicator?.getAttribute("style")).not.toContain("opacity: 0")
    }

    act(renderError)
    expectVisibleError()

    act(() => {
      root.render(null)
    })
    act(renderError)
    expectVisibleError()
  })

  test("removes positional task-card entrance movement under reduced motion", () => {
    expect(taskCardEnterInitial(true)).toEqual({
      opacity: 0,
      transform: "translateY(0)",
    })
    expect(taskCardEnterInitial(false)).toEqual({
      opacity: 0,
      transform: "translateY(2px)",
    })
  })
})
