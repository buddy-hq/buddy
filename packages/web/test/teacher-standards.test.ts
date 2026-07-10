import { describe, expect, test } from "bun:test"
import {
  shouldAutoSetupTeacherStandards,
  teacherStandardsNeedInstall,
} from "../src/lib/teacher-standards"
import type { StandardsRuntimeStatus } from "../src/state/standards-runtime"

function runtimeStatus(
  state: StandardsRuntimeStatus["state"],
  enabled = true,
): StandardsRuntimeStatus {
  return {
    enabled,
    state,
    ready: state === "ready",
  }
}

describe("teacher Standards defaults", () => {
  test("waits for persisted preferences before automatic setup", () => {
    expect(
      shouldAutoSetupTeacherStandards({
        preferencesHydrated: false,
        primaryUse: "teach",
        setupComplete: false,
      }),
    ).toBe(false)
    expect(
      shouldAutoSetupTeacherStandards({
        preferencesHydrated: true,
        primaryUse: "teach",
        setupComplete: true,
      }),
    ).toBe(false)
    expect(
      shouldAutoSetupTeacherStandards({
        preferencesHydrated: true,
        primaryUse: "teach",
        setupComplete: false,
      }),
    ).toBe(true)
  })

  test("installs missing, disabled, or unhealthy runtimes", () => {
    expect(teacherStandardsNeedInstall(runtimeStatus("not_installed"))).toBe(true)
    expect(teacherStandardsNeedInstall(runtimeStatus("ready", false))).toBe(true)
    expect(teacherStandardsNeedInstall(runtimeStatus("error"))).toBe(true)
  })

  test("does not restart an available or in-progress runtime", () => {
    expect(teacherStandardsNeedInstall(runtimeStatus("ready"))).toBe(false)
    expect(teacherStandardsNeedInstall(runtimeStatus("downloading"))).toBe(false)
    expect(teacherStandardsNeedInstall(runtimeStatus("installing"))).toBe(false)
    expect(teacherStandardsNeedInstall(runtimeStatus("repairing"))).toBe(false)
    expect(teacherStandardsNeedInstall(runtimeStatus("removing", false))).toBe(false)
  })
})
