import { describe, expect, test } from "bun:test"
import { describeDirectory } from "../src/lib/directory-display"

describe("describeDirectory", () => {
  test("elides a macOS path without claiming it is inside home", () => {
    expect(describeDirectory("/Users/prashantbhudwal/Documents/Buddy")).toEqual({
      name: "Buddy",
      ancestors: "…/Documents/",
    })
  })

  test("elides a Linux path without claiming it is inside home", () => {
    expect(describeDirectory("/home/dev/work/Buddy")).toEqual({
      name: "Buddy",
      ancestors: "…/work/",
    })
  })

  test("elides a Windows path and keeps backslashes", () => {
    expect(describeDirectory("C:\\Users\\prashant\\Documents\\Buddy")).toEqual({
      name: "Buddy",
      ancestors: "…\\Documents\\",
    })
  })

  test("elides the middle of a deep path", () => {
    expect(
      describeDirectory("/Users/p/Library/CloudStorage/Dropbox/Teaching/Fall 2026/Buddy"),
    ).toEqual({
      name: "Buddy",
      ancestors: "…/Fall 2026/",
    })
  })

  test("does not present shared or public directories as home", () => {
    expect(describeDirectory("/Users/Shared/Team/Notebook")).toEqual({
      name: "Notebook",
      ancestors: "…/Team/",
    })
    expect(describeDirectory("C:\\Users\\Public\\Team\\Notebook")).toEqual({
      name: "Notebook",
      ancestors: "…\\Team\\",
    })
  })

  test("leaves a path outside home alone", () => {
    expect(describeDirectory("/opt/buddy")).toEqual({ name: "buddy", ancestors: "opt/" })
  })

  test("passes through a path that already starts at the home alias", () => {
    expect(describeDirectory("~/Documents/Buddy")).toEqual({
      name: "Buddy",
      ancestors: "~/Documents/",
    })
  })

  test("preserves an explicit home alias when eliding a deep path", () => {
    expect(describeDirectory("~/Documents/Work/Notebook")).toEqual({
      name: "Notebook",
      ancestors: "~/…/Work/",
    })
  })
})
