import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useAdaptiveStreamingText, useLineByLineText } from "../src/components/chat/shared/hooks"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

async function waitForAssertion(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now()
  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error
      }
      await act(async () => {
        await flushEffects(20)
      })
    }
  }
}

function StreamingProbe(props: {
  mode: "auto" | "line"
  value: string
  onFinalRender?: () => void
}) {
  const text =
    props.mode === "line"
      ? useLineByLineText(props.value, props.onFinalRender)
      : useAdaptiveStreamingText(props.value, props.onFinalRender)

  return <pre data-testid="output">{text}</pre>
}

describe("chat streaming hooks", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("adaptive mode renders slow updates immediately", async () => {
    await act(async () => {
      root.render(<StreamingProbe mode="auto" value="Hello" />)
      await flushEffects()
    })

    await act(async () => {
      await flushEffects(220)
    })

    await act(async () => {
      root.render(<StreamingProbe mode="auto" value="Hello there" />)
      await flushEffects()
    })

    expect(container.textContent).toBe("Hello there")
  })

  test("line mode reveals one line before the full message catches up", async () => {
    const text = "alpha\nbeta\ngamma"

    await act(async () => {
      root.render(<StreamingProbe mode="line" value="" />)
      await flushEffects()
    })

    await act(async () => {
      root.render(<StreamingProbe mode="line" value={text} />)
      await flushEffects()
    })

    expect(container.textContent).toContain("alpha")
    expect(container.textContent).not.toBe(text)

    await waitForAssertion(() => {
      expect(container.textContent).toBe(text)
    })
  })

  test("stream completion triggers the final render callback", async () => {
    let finalRenderCount = 0

    await act(async () => {
      root.render(
        <StreamingProbe
          mode="line"
          value=""
          onFinalRender={() => {
            finalRenderCount += 1
          }}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      root.render(
        <StreamingProbe
          mode="line"
          value={"one\ntwo\nthree"}
          onFinalRender={() => {
            finalRenderCount += 1
          }}
        />,
      )
      await flushEffects()
    })

    await waitForAssertion(() => {
      expect(finalRenderCount).toBeGreaterThan(0)
    })
  })
})
