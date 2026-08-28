import { describe, expect, test } from "bun:test"
import {
  benchNewBrowserTabIsVisible,
  benchNewBrowserTabMatchesQuery,
} from "../src/components/bench/bench-new-tab-popover"

describe("Bench new-tab Browser option", () => {
  test("stays first for an empty or Browser-matching query", () => {
    expect(benchNewBrowserTabMatchesQuery("")).toBe(true)
    expect(benchNewBrowserTabMatchesQuery("browser")).toBe(true)
    expect(benchNewBrowserTabMatchesQuery("new tab")).toBe(true)
  })

  test("does not intercept an unrelated notebook search", () => {
    expect(benchNewBrowserTabMatchesQuery("notebook")).toBe(false)
  })

  test("does not offer Browser without the Electron capability", () => {
    expect(benchNewBrowserTabIsVisible({ browserAvailable: false, query: "" })).toBe(false)
    expect(benchNewBrowserTabIsVisible({ browserAvailable: true, query: "" })).toBe(true)
  })
})
