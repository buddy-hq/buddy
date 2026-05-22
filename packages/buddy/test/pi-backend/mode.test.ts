import { afterEach, describe, expect, test } from "bun:test"
import {
  AGENT_RUNTIME_PI,
  BUDDY_AGENT_RUNTIME_ENV,
  isPiRuntimeEnabled,
  readAgentRuntimeMode,
} from "../../src/pi-backend/mode"

const originalMode = process.env[BUDDY_AGENT_RUNTIME_ENV]

afterEach(() => {
  if (originalMode === undefined) {
    delete process.env[BUDDY_AGENT_RUNTIME_ENV]
  } else {
    process.env[BUDDY_AGENT_RUNTIME_ENV] = originalMode
  }
})

describe("PI runtime mode", () => {
  test("defaults to PI", () => {
    delete process.env[BUDDY_AGENT_RUNTIME_ENV]

    expect(readAgentRuntimeMode()).toBe(AGENT_RUNTIME_PI)
    expect(isPiRuntimeEnabled()).toBe(true)
  })

  test("ignores legacy runtime overrides", () => {
    process.env[BUDDY_AGENT_RUNTIME_ENV] = "opencode"

    expect(readAgentRuntimeMode()).toBe(AGENT_RUNTIME_PI)
    expect(isPiRuntimeEnabled()).toBe(true)
  })
})
