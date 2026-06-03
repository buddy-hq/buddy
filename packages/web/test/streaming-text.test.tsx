import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useAdaptiveStreamingText } from "../src/components/chat/hooks/use-streaming-text"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
  await Promise.resolve()
}

function StreamingTextProbe(props: { value: string; live?: boolean }) {
  const text = useAdaptiveStreamingText(props.value, { live: props.live ?? true })
  return <div data-streaming-text="true">{text}</div>
}

describe("useAdaptiveStreamingText", () => {
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

  test("extends the current visible prefix instead of restarting when a larger chunk arrives", async () => {
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
    await act(async () => {
      await flushEffects(80)
    })
    const visiblePrefix = container.textContent ?? ""
    expect(visiblePrefix.startsWith(firstValue)).toBe(true)
    expect(visiblePrefix.length).toBeGreaterThan(firstValue.length)

    await act(async () => {
      root.render(<StreamingTextProbe value={thirdValue} />)
      await flushEffects()
    })
    const continuedPrefix = container.textContent ?? ""
    expect(continuedPrefix.startsWith(visiblePrefix)).toBe(true)
    expect(continuedPrefix.length).toBeGreaterThanOrEqual(visiblePrefix.length)

    await act(async () => {
      await flushEffects(1000)
    })
    expect(container.textContent).toBe(thirdValue)
  })

  test("snaps math-heavy chunks instead of pacing through expensive partial renders", async () => {
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

  test("snaps to the canonical text when the stream is no longer live", async () => {
    const firstValue = "Hello"
    const finalValue =
      "Hello world. ".repeat(80) +
      "The stream has completed and the renderer must not keep catching up locally."

    await act(async () => {
      root.render(<StreamingTextProbe value={firstValue} live />)
      await flushEffects()
    })
    expect(container.textContent).toBe(firstValue)

    await act(async () => {
      root.render(<StreamingTextProbe value={finalValue} live />)
      await flushEffects(30)
    })
    const pacedPrefix = container.textContent ?? ""
    expect(pacedPrefix.startsWith(firstValue)).toBe(true)
    expect(pacedPrefix.length).toBeLessThan(finalValue.length)

    await act(async () => {
      root.render(<StreamingTextProbe value={finalValue} live={false} />)
      await flushEffects()
    })
    expect(container.textContent).toBe(finalValue)
  })
})
