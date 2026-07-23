import { describe, expect, test } from "bun:test"
import type { PersonaConfigOption } from "../src/state/chat-actions"
import { resolveDefaultPersonaID } from "../src/state/chat-actions"
import { resolvePrimaryPersonaOptions } from "../src/lib/directory-chat/use-directory-chat-state"
import { resolveDevelopmentFeaturesEnabled } from "../src/lib/development-features"

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
    const personas = [persona("buddy"), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas, "teaching-buddy")).toBe("teaching-buddy")
  })

  test("falls back to the first visible persona in catalog order", () => {
    const personas = [persona("buddy"), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas, "unknown-persona")).toBe("buddy")
  })

  test("skips hidden personas during default resolution", () => {
    const personas = [persona("buddy", true), persona("teaching-buddy")]
    expect(resolveDefaultPersonaID(personas)).toBe("teaching-buddy")
  })
})

describe("resolvePrimaryPersonaOptions", () => {
  const personas = [persona("buddy"), persona("teaching-buddy"), persona("code")]

  test("includes Code in development", () => {
    expect(resolvePrimaryPersonaOptions({ personas, development: true }).map(({ id }) => id)).toEqual(
      ["buddy", "teaching-buddy", "code"],
    )
  })

  test("excludes Code outside development", () => {
    expect(
      resolvePrimaryPersonaOptions({ personas, development: false }).map(({ id }) => id),
    ).toEqual(["buddy", "teaching-buddy"])
  })
})

describe("resolveDevelopmentFeaturesEnabled", () => {
  test("enables development features for live Vite development", () => {
    expect(
      resolveDevelopmentFeaturesEnabled({
        viteDevelopment: true,
        buddyChannel: undefined,
      }),
    ).toBe(true)
  })

  test("enables development features in a dev-channel installable", () => {
    expect(
      resolveDevelopmentFeaturesEnabled({
        viteDevelopment: false,
        buddyChannel: "dev",
      }),
    ).toBe(true)
  })

  test("disables development features in beta and production installables", () => {
    expect(
      resolveDevelopmentFeaturesEnabled({
        viteDevelopment: false,
        buddyChannel: "beta",
      }),
    ).toBe(false)
    expect(
      resolveDevelopmentFeaturesEnabled({
        viteDevelopment: false,
        buddyChannel: "prod",
      }),
    ).toBe(false)
  })
})
