import { describe, expect, test } from "bun:test"
import { selectTestOwners, TEST_OWNERS_ENVIRONMENT_KEY, type TestOwner } from "./test-topology"

const OWNERS = [
  { id: "backend", root: "backend", runCommand: ["test"], workingDirectory: "backend" },
  { id: "web", root: "web", runCommand: ["test"], workingDirectory: "web" },
  { id: "scripts", root: "scripts", runCommand: ["test"], workingDirectory: "." },
] as const satisfies readonly TestOwner[]

describe("test topology owner selection", () => {
  test("uses every owner by default and preserves canonical order for a selection", () => {
    expect(selectTestOwners(OWNERS, undefined)).toEqual(OWNERS)
    expect(selectTestOwners(OWNERS, "scripts,backend").map((owner) => owner.id)).toEqual([
      "backend",
      "scripts",
    ])
  })

  test("rejects empty, duplicate, and unknown owner IDs", () => {
    expect(() => selectTestOwners(OWNERS, "backend,")).toThrow(
      `${TEST_OWNERS_ENVIRONMENT_KEY} contains an empty owner ID`,
    )
    expect(() => selectTestOwners(OWNERS, "backend,backend")).toThrow(
      `${TEST_OWNERS_ENVIRONMENT_KEY} contains duplicate owner IDs`,
    )
    expect(() => selectTestOwners(OWNERS, "desktop")).toThrow(
      `Unknown ${TEST_OWNERS_ENVIRONMENT_KEY} owner IDs: desktop`,
    )
  })
})
