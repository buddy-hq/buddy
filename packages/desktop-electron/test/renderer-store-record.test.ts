import { describe, expect, test } from "bun:test"
import {
  deleteRendererStoreValue,
  listRendererStoreKeys,
  parseRendererStoreRecord,
  readRendererStoreValue,
  setRendererStoreValue,
  type TRendererStoreSnapshot,
} from "../src/main/renderer-store-record"

describe("renderer store records", () => {
  test("keeps dotted workspace keys literal and independently addressable", () => {
    const plainKey = "directory-workspace:%2FUsers%2Fx%2Ffoo"
    const dottedKey = "directory-workspace:%2FUsers%2Fx%2Ffoo.bar"
    let record: TRendererStoreSnapshot = parseRendererStoreRecord({})

    record = setRendererStoreValue(record, plainKey, "plain workspace")
    record = setRendererStoreValue(record, dottedKey, "dotted workspace")

    expect(readRendererStoreValue(record, plainKey)).toBe("plain workspace")
    expect(readRendererStoreValue(record, dottedKey)).toBe("dotted workspace")
    expect(listRendererStoreKeys(record)).toEqual([plainKey, dottedKey])

    record = deleteRendererStoreValue(record, dottedKey)
    expect(readRendererStoreValue(record, plainKey)).toBe("plain workspace")
    expect(readRendererStoreValue(record, dottedKey)).toBeUndefined()
  })
})
