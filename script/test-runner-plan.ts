import path from "node:path"

const POSIX_SEPARATOR = "/"
const WINDOWS_SEPARATOR = "\\"
const TEST_PATH_PREFIX = "test/"
const ISOLATED_RUN_ID_PREFIX = "isolated:"
const MINIMUM_GROUP_FILE_COUNT = 2
const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:\//
const TEST_FILE_PATTERN = /\.test\.(?:js|jsx|ts|tsx)$/

export type TestRunnerGroup = {
  readonly id: string
  readonly files: readonly string[]
}

export type TestRunnerPlanInput = {
  readonly discoveredFiles: readonly string[]
  readonly requestedFiles: readonly string[]
  readonly groups: readonly TestRunnerGroup[]
}

export type TestRunnerPlanEntry =
  | {
      readonly kind: "group"
      readonly id: string
      readonly files: readonly string[]
    }
  | {
      readonly kind: "isolated"
      readonly id: string
      readonly files: readonly string[]
    }

export const WEB_PURE_UNIT_GROUP_ID = "web:pure-unit"
export const BACKEND_PURE_UNIT_GROUP_ID = "backend:pure-unit"

export const WEB_PURE_UNIT_GROUP: TestRunnerGroup = {
  id: WEB_PURE_UNIT_GROUP_ID,
  files: [
    "test/agent-catalog.test.ts",
    "test/bench-viewer-math.test.ts",
    "test/chat-input.test.ts",
    "test/chemistry-fence-metadata.test.ts",
    "test/mermaid-contrast.test.ts",
    "test/reader-contract.test.ts",
    "test/reader-source-validation.test.ts",
    "test/skill-library-actions.test.ts",
    "test/skill-presentation.test.ts",
  ],
}

export const BACKEND_PURE_UNIT_GROUP: TestRunnerGroup = {
  id: BACKEND_PURE_UNIT_GROUP_ID,
  files: [
    "test/config/primary-use.test.ts",
    "test/config/development-personas.test.ts",
    "test/whiteboard/element-null-fields.test.ts",
    "test/whiteboard/route-errors.test.ts",
    "test/http/sdk-response.test.ts",
  ],
}

export const WEB_TEST_GROUPS: readonly TestRunnerGroup[] = [WEB_PURE_UNIT_GROUP]
export const BACKEND_TEST_GROUPS: readonly TestRunnerGroup[] = [BACKEND_PURE_UNIT_GROUP]

export function normalizePackageTestPath(value: string): string {
  const slashPath = value.replaceAll(WINDOWS_SEPARATOR, POSIX_SEPARATOR)
  const normalizedPath = path.posix.normalize(slashPath)

  if (
    slashPath.includes("\0") ||
    path.posix.isAbsolute(normalizedPath) ||
    WINDOWS_DRIVE_PATH_PATTERN.test(normalizedPath) ||
    !normalizedPath.startsWith(TEST_PATH_PREFIX) ||
    !TEST_FILE_PATTERN.test(normalizedPath)
  ) {
    throw new Error(`Invalid package-local test file: ${value}`)
  }

  return normalizedPath
}

export function normalizeRequestedPackageTestPath(packageRoot: string, value: string): string {
  const resolvedPath = path.resolve(packageRoot, value)
  const packageRelativePath = path.relative(packageRoot, resolvedPath)
  return normalizePackageTestPath(packageRelativePath.split(path.sep).join(POSIX_SEPARATOR))
}

function normalizeUniquePaths(values: readonly string[], description: string): readonly string[] {
  const normalizedValues = values.map(normalizePackageTestPath)
  const seen = new Set<string>()
  for (const value of normalizedValues) {
    if (seen.has(value)) throw new Error(`Duplicate ${description}: ${value}`)
    seen.add(value)
  }
  return normalizedValues
}

function normalizeGroups(
  groups: readonly TestRunnerGroup[],
  discoveredFiles: ReadonlySet<string>,
): readonly TestRunnerGroup[] {
  const groupIds = new Set<string>()
  const filesByGroup = new Map<string, readonly string[]>()
  const groupByFile = new Map<string, string>()

  for (const group of groups) {
    if (group.id.trim().length === 0) throw new Error("Test runner group IDs cannot be empty")
    if (group.id.startsWith(ISOLATED_RUN_ID_PREFIX)) {
      throw new Error(`Test runner group ID is reserved: ${group.id}`)
    }
    if (groupIds.has(group.id)) throw new Error(`Duplicate test runner group ID: ${group.id}`)
    groupIds.add(group.id)

    const files = normalizeUniquePaths(group.files, `files in group ${group.id}`)
    if (files.length === 0) throw new Error(`Test runner group has no files: ${group.id}`)
    for (const file of files) {
      if (!discoveredFiles.has(file)) {
        throw new Error(`Stale test runner group ${group.id}; file was not discovered: ${file}`)
      }
      const previousGroupId = groupByFile.get(file)
      if (previousGroupId !== undefined) {
        throw new Error(`Test runner groups overlap on ${file}: ${previousGroupId}, ${group.id}`)
      }
      groupByFile.set(file, group.id)
    }
    filesByGroup.set(group.id, files)
  }

  return groups.map((group) => {
    const files = filesByGroup.get(group.id)
    if (files === undefined) throw new Error(`Test runner group disappeared: ${group.id}`)
    return { id: group.id, files }
  })
}

function createIsolatedEntry(file: string): TestRunnerPlanEntry {
  return {
    kind: "isolated",
    id: `${ISOLATED_RUN_ID_PREFIX}${file}`,
    files: [file],
  }
}

export function createTestRunnerPlan(input: TestRunnerPlanInput): readonly TestRunnerPlanEntry[] {
  const discoveredFiles = normalizeUniquePaths(input.discoveredFiles, "discovered test file")
  const discoveredFileSet = new Set(discoveredFiles)
  const groups = normalizeGroups(input.groups, discoveredFileSet)
  const requestedFiles = normalizeUniquePaths(input.requestedFiles, "requested test file")

  for (const file of requestedFiles) {
    if (!discoveredFileSet.has(file)) {
      throw new Error(`Requested test file was not discovered: ${file}`)
    }
  }

  const selectedFiles = requestedFiles.length > 0 ? requestedFiles : discoveredFiles
  if (selectedFiles.length === 0) throw new Error("No test files found")

  const groupByFile = new Map<string, TestRunnerGroup>()
  for (const group of groups) {
    for (const file of group.files) groupByFile.set(file, group)
  }

  const selectedFilesByGroup = new Map<string, string[]>()
  for (const file of selectedFiles) {
    const group = groupByFile.get(file)
    if (group === undefined) continue
    const groupFiles = selectedFilesByGroup.get(group.id) ?? []
    groupFiles.push(file)
    selectedFilesByGroup.set(group.id, groupFiles)
  }

  const plan: TestRunnerPlanEntry[] = []
  const emittedGroupIds = new Set<string>()
  for (const file of selectedFiles) {
    const group = groupByFile.get(file)
    if (group === undefined) {
      plan.push(createIsolatedEntry(file))
      continue
    }

    const selectedGroupFiles = selectedFilesByGroup.get(group.id)
    if (selectedGroupFiles === undefined) {
      throw new Error(`Selected files disappeared from test runner group: ${group.id}`)
    }
    if (selectedGroupFiles.length < MINIMUM_GROUP_FILE_COUNT) {
      plan.push(createIsolatedEntry(file))
      continue
    }
    if (emittedGroupIds.has(group.id)) continue

    plan.push({ kind: "group", id: group.id, files: selectedGroupFiles })
    emittedGroupIds.add(group.id)
  }

  const planIds = new Set<string>()
  for (const entry of plan) {
    if (planIds.has(entry.id)) throw new Error(`Duplicate test runner plan ID: ${entry.id}`)
    planIds.add(entry.id)
  }
  return plan
}
