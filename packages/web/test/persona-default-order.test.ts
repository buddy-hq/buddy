import { describe, expect, test } from "bun:test"
import type { PersonaConfigOption } from "../src/state/chat-actions"
import { resolveDefaultPersonaID } from "../src/state/chat-actions"

function persona(id: PersonaConfigOption["id"], hidden = false): PersonaConfigOption {
  return {
    id,
    label: id,
    description: id,
    surfaces: ["curriculum"],
    defaultSurface: "curriculum",
    hidden,
  }
}

describe("resolveDefaultPersonaID", () => {
  test("prefers configured default when visible", () => {
    const personas = [persona("buddy"), persona("code-buddy"), persona("math-buddy")]
    expect(resolveDefaultPersonaID(personas, "math-buddy")).toBe("math-buddy")
  })

  test("falls back to the first visible persona in catalog order", () => {
    const personas = [persona("math-buddy"), persona("reading-buddy"), persona("code-buddy")]
    expect(resolveDefaultPersonaID(personas, "unknown-persona")).toBe("math-buddy")
  })

  test("skips hidden personas during default resolution", () => {
    const personas = [persona("buddy", true), persona("code-buddy"), persona("reading-buddy")]
    expect(resolveDefaultPersonaID(personas)).toBe("code-buddy")
  })
})
