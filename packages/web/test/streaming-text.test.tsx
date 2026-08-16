import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useAdaptiveStreamingText } from "../src/components/chat/hooks/use-streaming-text"
import {
  createTranscriptPerformanceProbe,
  setTranscriptPerformanceProbe,
} from "../src/lib/directory-chat/transcript-performance-probe"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
  await Promise.resolve()
}

function StreamingTextProbe(props: { value: string; live?: boolean }) {
  const text = useAdaptiveStreamingText(props.value, {
    live: props.live ?? true,
  })
  return <div data-streaming-text="true">{text}</div>
}

describe("useAdaptiveStreamingText", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    setTranscriptPerformanceProbe(undefined)
    container.remove()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("renders the latest streaming value immediately", async () => {
    const firstValue = "Hello"
    const secondValue = `${"Hello world this is a longer response that arrives as a fast chunk and keeps rendering. ".repeat(6)}`
    const thirdValue = `${secondValue} Another sentence arrives immediately after that.`

    await act(async () => {
      root.render(<StreamingTextProbe value={firstValue} />)
      await flushEffects()
    })
    expect(container.textContent).toBe(firstValue)

    await act(async () => {
      root.render(<StreamingTextProbe value={secondValue} />)
      await flushEffects()
    })
    expect(container.textContent).toBe(secondValue)

    await act(async () => {
      root.render(<StreamingTextProbe value={thirdValue} />)
      await flushEffects()
    })
    expect(container.textContent).toBe(thirdValue)
  })

  test("does not special-case math-heavy chunks", async () => {
    const firstValue = "Formulas:"
    const mathHeavyValue = Array.from(
      { length: 9 },
      (_, index) => `(${index + 1}) $$ x_${index} = \\frac{a_${index}}{b_${index}} $$`,
    ).join("\n\n")

    await act(async () => {
      root.render(<StreamingTextProbe value={firstValue} />)
      await flushEffects()
    })
    expect(container.textContent).toBe(firstValue)

    await act(async () => {
      root.render(<StreamingTextProbe value={mathHeavyValue} />)
      await flushEffects()
    })

    expect(container.textContent).toBe(mathHeavyValue)
  })

  test("records the terminal display transition after the last live update", async () => {
    const probe = createTranscriptPerformanceProbe({ observeBrowserEvents: false })
    setTranscriptPerformanceProbe(probe)

    await act(async () => {
      root.render(<StreamingTextProbe value="Final text" live />)
      await flushEffects()
    })
    await act(async () => {
      root.render(<StreamingTextProbe value="Final text" live={false} />)
      await flushEffects()
    })

    const streamEvents = probe.events.filter((event) => event.type === "streaming-throughput")
    expect(streamEvents.at(-1)?.live).toBe(false)
    setTranscriptPerformanceProbe(undefined)
  })
})
