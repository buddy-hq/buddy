import { describe, expect, test } from "bun:test"
import { ConfigSchema } from "../../src/config/contract/schema"

describe("primary-use configuration", () => {
  test("accepts a durable teaching primary use", () => {
    expect(
      ConfigSchema.Info.parse({
        personalization: {
          primary_use: "teach",
        },
      }),
    ).toMatchObject({
      personalization: {
        primary_use: "teach",
      },
    })
  })

  test("rejects an unsupported primary use", () => {
    expect(() =>
      ConfigSchema.Info.parse({
        personalization: {
          primary_use: "other",
        },
      }),
    ).toThrow()
  })
})
