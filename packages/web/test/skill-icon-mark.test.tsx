import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

mock.module("@/components/skills/skill-icon-assets", () => ({
  resolveSkillIconURL: (reference: string | undefined) =>
    reference ? `/test-skill-icons/${reference}` : undefined,
}))

describe("skill icon marks", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("replaces a failed DOM icon with its fallback", async () => {
    const { createSkillIconMarkElement } = await import("../src/components/skills/skill-icon-mark")
    const fallback = document.createElement("span")
    fallback.dataset.fallback = "skill"
    const image = createSkillIconMarkElement("analogy.webp", "size-4", fallback)
    expect(image).not.toBeUndefined()
    if (!image) return

    container.appendChild(image)
    image.dispatchEvent(new Event("error"))

    expect(container.firstElementChild).toBe(fallback)
  })

  test("tries a new React icon after an earlier URL fails", async () => {
    const { SkillIconMark } = await import("../src/components/skills/skill-icon-mark")
    const fallback = <span data-fallback="skill" />

    await act(async () => {
      root.render(<SkillIconMark icon="first.webp" fallback={fallback} />)
    })
    const firstImage = container.querySelector<HTMLImageElement>("img")
    expect(firstImage?.src).toEndWith("/test-skill-icons/first.webp")

    await act(async () => {
      firstImage?.dispatchEvent(new Event("error"))
    })
    expect(container.querySelector("[data-fallback='skill']")).not.toBeNull()

    await act(async () => {
      root.render(<SkillIconMark icon="second.webp" fallback={fallback} />)
    })
    expect(container.querySelector<HTMLImageElement>("img")?.src).toEndWith(
      "/test-skill-icons/second.webp",
    )
  })
})
