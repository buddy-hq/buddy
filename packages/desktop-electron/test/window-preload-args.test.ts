import { describe, expect, test } from "bun:test"
import {
  encodeBuddyWindowVersionArg,
  readBuddyWindowVersionArg,
} from "../src/shared/window-preload-args"

describe("window preload version arg", () => {
  test("round-trips the packaged app version", () => {
    expect(readBuddyWindowVersionArg([encodeBuddyWindowVersionArg("0.0.62")])).toBe("0.0.62")
  })

  test("round-trips versions with reserved characters", () => {
    expect(readBuddyWindowVersionArg([encodeBuddyWindowVersionArg("1.2.3+build.4")])).toBe(
      "1.2.3+build.4",
    )
  })

  test("prefers the last matching argument", () => {
    expect(
      readBuddyWindowVersionArg([
        encodeBuddyWindowVersionArg("0.0.61"),
        "--other-flag",
        encodeBuddyWindowVersionArg("0.0.62"),
      ]),
    ).toBe("0.0.62")
  })

  test("returns undefined when the version arg is missing or blank", () => {
    expect(readBuddyWindowVersionArg(["--type=renderer"])).toBeUndefined()
    expect(readBuddyWindowVersionArg([encodeBuddyWindowVersionArg("")])).toBeUndefined()
    expect(readBuddyWindowVersionArg([encodeBuddyWindowVersionArg("   ")])).toBeUndefined()
  })

  test("returns undefined for malformed encoding", () => {
    const versionArgPrefix = encodeBuddyWindowVersionArg("placeholder").replace("placeholder", "")
    expect(readBuddyWindowVersionArg([`${versionArgPrefix}%E0%A4%A`])).toBeUndefined()
  })
})
