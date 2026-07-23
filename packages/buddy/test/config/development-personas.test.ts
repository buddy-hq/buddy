import { describe, expect, test } from "bun:test"
import {
  BUDDY_DEFAULT_DEV_CHANNEL,
  BUDDY_PACKAGED_FALLBACK_CHANNEL,
  OPENCODE_DEV_CHANNEL,
  OPENCODE_PROD_CHANNEL,
} from "@buddy/script/channel"
import { personaCatalogEntries } from "../../src/learning/personas/wiring/persona-metadata"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { resolveDevelopmentPersonasEnabled } from "../../src/learning/personas/wiring/persona-availability"

describe("development personas", () => {
  test("uses the compiled installation channel as the authoritative release mode", () => {
    expect(
      resolveDevelopmentPersonasEnabled({
        installationChannel: OPENCODE_DEV_CHANNEL,
        buddyChannel: BUDDY_PACKAGED_FALLBACK_CHANNEL,
      }),
    ).toBe(true)
    expect(
      resolveDevelopmentPersonasEnabled({
        installationChannel: OPENCODE_PROD_CHANNEL,
        buddyChannel: BUDDY_DEFAULT_DEV_CHANNEL,
      }),
    ).toBe(false)
  })

  test("uses the Buddy channel for an unbundled local backend", () => {
    expect(
      resolveDevelopmentPersonasEnabled({
        installationChannel: "local",
        buddyChannel: BUDDY_DEFAULT_DEV_CHANNEL,
      }),
    ).toBe(true)
    expect(
      resolveDevelopmentPersonasEnabled({
        installationChannel: "local",
        buddyChannel: BUDDY_PACKAGED_FALLBACK_CHANNEL,
      }),
    ).toBe(false)
  })

  test("keeps Code out of production catalogs and targeting profiles", () => {
    expect(
      personaCatalogEntries({
        overrides: {
          code: {
            hidden: false,
          },
        },
        developmentPersonasEnabled: false,
      }).map(({ id }) => id),
    ).toEqual(["buddy", "teaching-buddy"])
    expect(
      getBuddyPersona(
        "code",
        {
          code: {
            hidden: false,
          },
        },
        false,
      ).hidden,
    ).toBe(true)
  })

  test("keeps all three personas available in development", () => {
    expect(
      personaCatalogEntries({
        developmentPersonasEnabled: true,
      }).map(({ id }) => id),
    ).toEqual(["buddy", "teaching-buddy", "code"])
    expect(getBuddyPersona("code", undefined, true).hidden).toBe(false)
  })
})
