import { describe, expect, test } from "bun:test"
import { resolveOpenCodeFilesystemOptions } from "../src/host-filesystem-options"

describe("embedded host filesystem options", () => {
  test("leaves SDK defaults unchanged when disable flags are absent", () => {
    expect(resolveOpenCodeFilesystemOptions({})).toBeUndefined()
    expect(resolveOpenCodeFilesystemOptions({ OPENCODE_CLIENT: "web" })).toBeUndefined()
  })

  test.each([
    { value: "1", enabled: false },
    { value: "true", enabled: false },
    { value: "TRUE", enabled: false },
    { value: "TrUe", enabled: false },
    { value: "0", enabled: true },
    { value: "false", enabled: true },
    { value: "", enabled: true },
    { value: "yes", enabled: true },
    { value: " true ", enabled: true },
    { value: " 1 ", enabled: true },
  ])("matches CLI flag parsing for '$value'", ({ value, enabled }) => {
    expect(resolveOpenCodeFilesystemOptions({ OPENCODE_DISABLE_FILEWATCHER: value })).toEqual({
      filewatcher: enabled,
      fff: undefined,
    })
    expect(resolveOpenCodeFilesystemOptions({ OPENCODE_FILEWATCHER_DISABLE: value })).toEqual({
      filewatcher: enabled,
      fff: undefined,
    })
    expect(resolveOpenCodeFilesystemOptions({ OPENCODE_DISABLE_FFF: value })).toEqual({
      filewatcher: undefined,
      fff: enabled,
    })
  })

  test.each([
    { value: "0", enabled: true },
    { value: "", enabled: true },
    { value: "1", enabled: false },
  ])("gives OPENCODE_FILEWATCHER_DISABLE precedence when set to '$value'", ({ value, enabled }) => {
    expect(
      resolveOpenCodeFilesystemOptions({
        OPENCODE_FILEWATCHER_DISABLE: value,
        OPENCODE_DISABLE_FILEWATCHER: "true",
      }),
    ).toEqual({ filewatcher: enabled, fff: undefined })
  })

  test.each([
    { value: "1", options: { filewatcher: true, fff: true } },
    { value: "0", options: { filewatcher: false, fff: false } },
  ])("preserves explicit options over flags set to '$value'", ({ value, options }) => {
    expect(
      resolveOpenCodeFilesystemOptions(
        { OPENCODE_DISABLE_FILEWATCHER: value, OPENCODE_DISABLE_FFF: value },
        options,
      ),
    ).toEqual(options)
  })

  test("uses flags only for fields the caller did not specify", () => {
    const environment = { OPENCODE_DISABLE_FILEWATCHER: "1", OPENCODE_DISABLE_FFF: "1" }
    expect(resolveOpenCodeFilesystemOptions(environment, { filewatcher: true })).toEqual({
      filewatcher: true,
      fff: false,
    })
    expect(resolveOpenCodeFilesystemOptions(environment, { fff: true })).toEqual({
      filewatcher: false,
      fff: true,
    })
    expect(resolveOpenCodeFilesystemOptions({}, { filewatcher: false })).toEqual({
      filewatcher: false,
      fff: undefined,
    })
    expect(resolveOpenCodeFilesystemOptions({}, { fff: false })).toEqual({
      filewatcher: undefined,
      fff: false,
    })
  })
})
