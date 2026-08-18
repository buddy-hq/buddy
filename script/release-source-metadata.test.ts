import { describe, expect, test } from "bun:test"
import { parseReleaseSourceMetadata, renderReleaseSourceMetadata } from "./release-source-metadata"

const SOURCE_SHA = "0123456789abcdef0123456789abcdef01234567"

describe("release source metadata", () => {
  test("round-trips a normalized source repository and SHA", () => {
    const parsed = parseReleaseSourceMetadata({
      schemaVersion: 1,
      sourceRepository: " buddy-hq/buddy ",
      sourceSha: SOURCE_SHA.toUpperCase(),
    })

    expect(parsed).toEqual({
      schemaVersion: 1,
      sourceRepository: "buddy-hq/buddy",
      sourceSha: SOURCE_SHA,
    })
    expect(JSON.parse(renderReleaseSourceMetadata(parsed))).toEqual(parsed)
  })

  test("rejects abbreviated SHAs and unsupported schemas", () => {
    expect(() =>
      parseReleaseSourceMetadata({
        schemaVersion: 1,
        sourceRepository: "buddy-hq/buddy",
        sourceSha: SOURCE_SHA.slice(0, 12),
      }),
    ).toThrow("full 40-character Git commit SHA")
    expect(() =>
      parseReleaseSourceMetadata({
        schemaVersion: 2,
        sourceRepository: "buddy-hq/buddy",
        sourceSha: SOURCE_SHA,
      }),
    ).toThrow("Invalid release source metadata")
  })
})
