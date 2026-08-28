import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  BACKEND_PURE_UNIT_GROUP,
  BACKEND_PURE_UNIT_GROUP_ID,
  createTestRunnerPlan,
  normalizePackageTestPath,
  normalizeRequestedPackageTestPath,
  WEB_PURE_UNIT_GROUP,
  WEB_PURE_UNIT_GROUP_ID,
  type TestRunnerGroup,
  type TestRunnerPlanInput,
} from "./test-runner-plan"

const FIRST_FILE = "test/first.test.ts"
const SECOND_FILE = "test/second.test.ts"
const THIRD_FILE = "test/third.test.ts"
const FOURTH_FILE = "test/dir/fourth.test.ts"

const REVIEWED_GROUP: TestRunnerGroup = {
  id: "reviewed",
  files: [FIRST_FILE, SECOND_FILE],
}

const SECOND_REVIEWED_GROUP: TestRunnerGroup = {
  id: "second-reviewed",
  files: [THIRD_FILE, FOURTH_FILE],
}

const DISCOVERED_FILES = [FIRST_FILE, SECOND_FILE, THIRD_FILE, FOURTH_FILE]
const PACKAGE_ROOT = path.resolve("/workspace/packages/example")

function makePlanInput(
  requestedFiles: readonly string[],
  groups: readonly TestRunnerGroup[] = [REVIEWED_GROUP],
): TestRunnerPlanInput {
  return {
    discoveredFiles: DISCOVERED_FILES,
    groups,
    requestedFiles,
  }
}

describe("test runner plan", () => {
  test("defines the reviewed groups with their exact package-local files", () => {
    expect(WEB_PURE_UNIT_GROUP).toEqual({
      id: WEB_PURE_UNIT_GROUP_ID,
      files: [
        "test/agent-catalog.test.ts",
        "test/chat-input.test.ts",
        "test/chemistry-fence-metadata.test.ts",
        "test/mermaid-contrast.test.ts",
        "test/reader-contract.test.ts",
        "test/reader-source-validation.test.ts",
        "test/skill-library-actions.test.ts",
        "test/skill-presentation.test.ts",
        "test/theme-mapper.test.ts",
      ],
    })
    expect(BACKEND_PURE_UNIT_GROUP).toEqual({
      id: BACKEND_PURE_UNIT_GROUP_ID,
      files: [
        "test/config/primary-use.test.ts",
        "test/config/development-personas.test.ts",
        "test/whiteboard/element-null-fields.test.ts",
        "test/whiteboard/route-errors.test.ts",
        "test/http/sdk-response.test.ts",
      ],
    })
  })

  test("isolates every ungrouped discovered file when no files are requested", () => {
    expect(createTestRunnerPlan(makePlanInput([]))).toEqual([
      {
        kind: "group",
        id: REVIEWED_GROUP.id,
        files: [FIRST_FILE, SECOND_FILE],
      },
      {
        kind: "isolated",
        id: `isolated:${THIRD_FILE}`,
        files: [THIRD_FILE],
      },
      {
        kind: "isolated",
        id: `isolated:${FOURTH_FILE}`,
        files: [FOURTH_FILE],
      },
    ])
  })

  test("rejects an empty discovery result", () => {
    expect(() =>
      createTestRunnerPlan({
        discoveredFiles: [],
        groups: [],
        requestedFiles: [],
      }),
    ).toThrow("No test files found")
  })

  test("groups the eligible subset and isolates unknown files in input order", () => {
    expect(createTestRunnerPlan(makePlanInput([FIRST_FILE, THIRD_FILE, SECOND_FILE]))).toEqual([
      {
        kind: "group",
        id: REVIEWED_GROUP.id,
        files: [FIRST_FILE, SECOND_FILE],
      },
      {
        kind: "isolated",
        id: `isolated:${THIRD_FILE}`,
        files: [THIRD_FILE],
      },
    ])
  })

  test("leaves a one-file reviewed subset isolated", () => {
    expect(createTestRunnerPlan(makePlanInput([SECOND_FILE, THIRD_FILE]))).toEqual([
      {
        kind: "isolated",
        id: `isolated:${SECOND_FILE}`,
        files: [SECOND_FILE],
      },
      {
        kind: "isolated",
        id: `isolated:${THIRD_FILE}`,
        files: [THIRD_FILE],
      },
    ])
  })

  test("keeps different groups separate and orders them by first input file", () => {
    expect(
      createTestRunnerPlan(
        makePlanInput(
          [FOURTH_FILE, FIRST_FILE, THIRD_FILE, SECOND_FILE],
          [REVIEWED_GROUP, SECOND_REVIEWED_GROUP],
        ),
      ),
    ).toEqual([
      {
        kind: "group",
        id: SECOND_REVIEWED_GROUP.id,
        files: [FOURTH_FILE, THIRD_FILE],
      },
      {
        kind: "group",
        id: REVIEWED_GROUP.id,
        files: [FIRST_FILE, SECOND_FILE],
      },
    ])
  })

  test("preserves reverse input order inside a group", () => {
    const group: TestRunnerGroup = {
      id: "three-file-group",
      files: [FIRST_FILE, SECOND_FILE, THIRD_FILE],
    }

    expect(
      createTestRunnerPlan(makePlanInput([THIRD_FILE, SECOND_FILE, FIRST_FILE], [group])),
    ).toEqual([
      {
        kind: "group",
        id: group.id,
        files: [THIRD_FILE, SECOND_FILE, FIRST_FILE],
      },
    ])
  })

  test("rejects duplicate requested paths after normalization", () => {
    expect(() =>
      createTestRunnerPlan(makePlanInput(["./test/first.test.ts", "test\\first.test.ts"], [])),
    ).toThrow("Duplicate requested test file")
  })

  test("rejects duplicate discovered and group paths", () => {
    expect(() =>
      createTestRunnerPlan({
        discoveredFiles: [FIRST_FILE, `./${FIRST_FILE}`],
        groups: [],
        requestedFiles: [],
      }),
    ).toThrow("Duplicate discovered test file")

    expect(() =>
      createTestRunnerPlan(
        makePlanInput(
          [FIRST_FILE, SECOND_FILE],
          [{ id: "duplicate-files", files: [FIRST_FILE, `./${FIRST_FILE}`] }],
        ),
      ),
    ).toThrow("Duplicate files in group duplicate-files")
  })

  test("rejects duplicate group IDs and overlapping group files", () => {
    expect(() =>
      createTestRunnerPlan(
        makePlanInput(
          [FIRST_FILE, SECOND_FILE],
          [
            { id: "same", files: [FIRST_FILE] },
            { id: "same", files: [SECOND_FILE] },
          ],
        ),
      ),
    ).toThrow("Duplicate test runner group ID")

    expect(() =>
      createTestRunnerPlan(
        makePlanInput(
          [FIRST_FILE, SECOND_FILE],
          [
            { id: "first", files: [FIRST_FILE] },
            { id: "second", files: [FIRST_FILE, SECOND_FILE] },
          ],
        ),
      ),
    ).toThrow("overlap")
  })

  test("rejects stale allowlist entries", () => {
    expect(() =>
      createTestRunnerPlan(
        makePlanInput([FIRST_FILE], [{ id: "stale", files: ["test/missing.test.ts"] }]),
      ),
    ).toThrow("Stale test runner group")
  })

  test("rejects invalid and non-package-local paths", () => {
    expect(normalizePackageTestPath("test\\dir\\fourth.test.ts")).toBe(FOURTH_FILE)
    expect(() => normalizePackageTestPath("packages/web/test/first.test.ts")).toThrow(
      "Invalid package-local test file",
    )
    expect(() => normalizePackageTestPath("../test/first.test.ts")).toThrow(
      "Invalid package-local test file",
    )
    expect(() => normalizePackageTestPath("test/first.ts")).toThrow(
      "Invalid package-local test file",
    )
    expect(() => normalizePackageTestPath("test/../first.test.ts")).toThrow(
      "Invalid package-local test file",
    )
    expect(() => createTestRunnerPlan(makePlanInput(["/tmp/first.test.ts"], []))).toThrow(
      "Invalid package-local test file",
    )
  })

  test("normalizes requested relative and in-package absolute paths", () => {
    const absoluteTestPath = path.join(PACKAGE_ROOT, "test", "first.test.ts")

    expect(normalizeRequestedPackageTestPath(PACKAGE_ROOT, "./test/first.test.ts")).toBe(FIRST_FILE)
    expect(normalizeRequestedPackageTestPath(PACKAGE_ROOT, absoluteTestPath)).toBe(FIRST_FILE)
    expect(() =>
      normalizeRequestedPackageTestPath(
        PACKAGE_ROOT,
        path.resolve(PACKAGE_ROOT, "../outside.test.ts"),
      ),
    ).toThrow("Invalid package-local test file")
  })
})
