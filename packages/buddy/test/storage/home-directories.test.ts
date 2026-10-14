import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import {
  BUDDY_ENV,
  resolveBuddyManagedHomeDirectory,
  resolveDefaultNotebookHomeDirectory,
} from "../../src/storage/constants"
import { Global } from "../../src/storage/global"
import { resolveBuddyHomeDefaultPath } from "../../src/project/buddy-home"
import { allowedDirectoryRoots, resolveDirectory } from "../../src/project/directory"
import { resolveDefaultNotesLibraryDirectory } from "../../src/notes/paths"
import {
  buddyHomeRoot,
  installedSkillLockPath,
  managedSkillsRoot,
  skillArtifactCacheRoot,
} from "../../src/learning/skill-management/service/paths"
import { LearnerMemoryPath } from "../../src/learning/features/memory/paths"
import { runLearnerMemoryLab } from "../../src/learning/features/memory/lab"
import { temporaryDirectory } from "../helpers/temporary-directory"

const keys = [
  BUDDY_ENV.MANAGED_HOME_DIR,
  BUDDY_ENV.DEFAULT_NOTEBOOK_HOME,
  BUDDY_ENV.GLOBAL_CONFIG_DIR,
  BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS,
] as const
const original = new Map(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("managed home and notebook defaults", () => {
  test("unset overrides preserve the home expressions even with a different global config root", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-home-defaults-" })
    delete process.env[BUDDY_ENV.MANAGED_HOME_DIR]
    delete process.env[BUDDY_ENV.DEFAULT_NOTEBOOK_HOME]
    process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = path.join(root.path, "custom-config")
    expect(resolveBuddyManagedHomeDirectory()).toBe(path.join(Global.Path.home, ".buddy"))
    expect(resolveDefaultNotebookHomeDirectory()).toBe(
      path.join(Global.Path.home, "Documents", "Buddy"),
    )
    expect(resolveBuddyHomeDefaultPath()).toBe(path.join(Global.Path.home, "Documents", "Buddy"))
    expect(buddyHomeRoot()).toBe(path.join(Global.Path.home, ".buddy"))
    expect(LearnerMemoryPath.root(root.path)).toBe(
      path.join(Global.Path.home, ".buddy", "learner-memory"),
    )
  })

  test("managed override owns skills, locks, caches, learner memory and lab writes", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-managed-home-" })
    const managed = path.join(root.path, "managed")
    process.env[BUDDY_ENV.MANAGED_HOME_DIR] = managed
    process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = path.join(root.path, "other-config")
    expect(resolveBuddyManagedHomeDirectory()).toBe(managed)
    expect(buddyHomeRoot()).toBe(managed)
    expect(managedSkillsRoot()).toBe(path.join(managed, "skills"))
    expect(installedSkillLockPath()).toBe(path.join(managed, "skills.lock.json"))
    expect(skillArtifactCacheRoot()).toBe(path.join(managed, "cache", "skill-artifacts"))
    expect(LearnerMemoryPath.root(root.path)).toBe(path.join(managed, "learner-memory"))
    const lab = await runLearnerMemoryLab({
      directory: root.path,
      selection: {
        deterministicHarness: false,
        modelHarness: false,
        startupSweep: false,
        currentSessionExtraction: false,
        currentSessionExtractionForce: false,
        searchProbe: false,
      },
      settingsOverride: {},
    })
    expect(lab.memoryRoot).toBe(path.join(managed, "learner-memory-lab", `run_${lab.runID}`))
    expect(await Bun.file(path.join(lab.memoryRoot, "lab-status.json")).exists()).toBe(true)
    expect(await Bun.file(path.join(lab.memoryRoot, "lab-trace.jsonl")).exists()).toBe(true)
  })

  test("notebook override agrees across Buddy home, directory roots and Notes", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-notebook-home-" })
    const notebook = path.join(root.path, "redirected-documents", "Buddy Beta")
    process.env[BUDDY_ENV.DEFAULT_NOTEBOOK_HOME] = notebook
    delete process.env[BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]
    expect(resolveDefaultNotebookHomeDirectory()).toBe(notebook)
    expect(resolveBuddyHomeDefaultPath()).toBe(notebook)
    expect(allowedDirectoryRoots()).toContain(resolveDirectory(notebook))
    expect(resolveDefaultNotesLibraryDirectory(resolveBuddyHomeDefaultPath())).toBe(
      path.join(notebook, "Notes"),
    )
    expect(allowedDirectoryRoots()).not.toContain(
      resolveDirectory(path.join(Global.Path.home, "Documents", "Buddy")),
    )
  })
})
