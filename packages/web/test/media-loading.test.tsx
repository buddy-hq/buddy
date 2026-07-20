import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BackgroundGradientAnimation } from "../src/components/media/loading/background-gradient-animation"
import { GradientAnimationLoading } from "../src/components/media/loading/gradient-animation"

describe("gradient animation loading palette", () => {
  test("uses the themed palette for media loading by default", () => {
    const markup = renderToStaticMarkup(<GradientAnimationLoading />)

    expect(markup).toContain("--second-color:var(--theme-primary-base, rgb(221, 74, 255))")
    expect(markup).toContain("--fourth-color:var(--theme-accent-base, rgb(200, 50, 50))")
  })

  test("preserves the original palette as the low-level fallback", () => {
    const markup = renderToStaticMarkup(<BackgroundGradientAnimation />)

    expect(markup).toContain("--gradient-background-start:rgb(108, 0, 162)")
    expect(markup).toContain("--second-color:rgb(221, 74, 255)")
  })

  test("uses theme tokens with the original palette as fallback", () => {
    const markup = renderToStaticMarkup(<BackgroundGradientAnimation palette="theme" />)

    expect(markup).toContain("--gradient-background-start:var(--background-base, rgb(108, 0, 162))")
    expect(markup).toContain("--second-color:var(--theme-primary-base, rgb(221, 74, 255))")
    expect(markup).toContain("var(--theme-accent-base, rgb(100, 220, 255))")
    expect(markup).toContain("--fourth-color:var(--theme-accent-base, rgb(200, 50, 50))")
    expect(markup).toContain("--pointer-color:var(--theme-primary-base, rgb(140, 100, 255))")
  })

  test("uses a unique SVG filter for each loader instance", () => {
    const markup = renderToStaticMarkup(
      <>
        <BackgroundGradientAnimation />
        <BackgroundGradientAnimation palette="theme" />
      </>,
    )
    const filterIDs = Array.from(markup.matchAll(/<filter id="([^"]+)"/gu), (match) => match[1])

    expect(filterIDs).toHaveLength(2)
    expect(new Set(filterIDs).size).toBe(2)
  })
})
