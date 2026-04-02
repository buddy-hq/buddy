import { describe, expect, test } from "bun:test"
import {
  isTitlebarInteractiveTarget,
  isTitlebarSystemControlTarget,
} from "../src/components/layout/desktop-titlebar-helpers"

describe("desktop titlebar helpers", () => {
  test("treats nested controls as interactive", () => {
    const button = document.createElement("button")
    const child = document.createElement("span")
    button.append(child)

    expect(isTitlebarInteractiveTarget(button)).toBe(true)
    expect(isTitlebarInteractiveTarget(child)).toBe(true)
  })

  test("keeps plain layout containers draggable", () => {
    const container = document.createElement("div")

    expect(isTitlebarInteractiveTarget(container)).toBe(false)
    expect(isTitlebarInteractiveTarget(null)).toBe(false)
  })

  test("detects mounted window control containers", () => {
    const controls = document.createElement("div")
    controls.setAttribute("data-tauri-decorum-tb", "")
    const icon = document.createElement("span")
    controls.append(icon)

    expect(isTitlebarSystemControlTarget(icon)).toBe(true)
    expect(isTitlebarSystemControlTarget(document.createElement("div"))).toBe(false)
  })
})
