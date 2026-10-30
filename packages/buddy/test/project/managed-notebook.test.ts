import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import path from "node:path"
import { listOpenProjects } from "../../src/project/open-project-registry"
import {
  createManagedNotebookByName,
  INBOX_NOTEBOOK_NAME,
  ManagedNotebookError,
} from "../../src/project/managed-notebook"
import { parseProjectNodeErrnoCode, PROJECT_NODE_ERRNO } from "../../src/project/parse-values"
import { tmpdir } from "../helpers/tmpdir"

async function pathExists(target: string) {
  try {
    await fsp.lstat(target)
    return true
  } catch (error) {
    if (parseProjectNodeErrnoCode(error) === PROJECT_NODE_ERRNO.notFound) return false
    throw error
  }
}

async function filesystemCollidesOnCase(directory: string) {
  const probe = path.join(directory, "CaseProbe")
  await fsp.mkdir(probe)
  try {
    return await pathExists(path.join(directory, "caseprobe"))
  } finally {
    await fsp.rm(probe, { recursive: true, force: true })
  }
}

async function expectNotebookNameTaken(input: { buddyHome: string; name: string }) {
  const before = await listOpenProjects()
  const creation = createManagedNotebookByName({
    name: input.name,
    buddyHome: input.buddyHome,
  })

  await expect(creation).rejects.toBeInstanceOf(ManagedNotebookError)
  await expect(creation).rejects.toThrow(`A notebook named ${input.name} already exists`)

  const after = await listOpenProjects()
  expect(after.directories).toEqual(before.directories)
}

describe("createManagedNotebookByName", () => {
  test("creates a notebook when Buddy home does not exist yet", async () => {
    await using root = await tmpdir()
    const home = path.join(root.path, "Documents", "Buddy")

    const created = await createManagedNotebookByName({ name: "Fresh", buddyHome: home })

    expect(created).toBe(await fsp.realpath(path.join(home, "Fresh")))
    expect((await fsp.stat(home)).isDirectory()).toBe(true)
  })

  test("opens Inbox again when reuse is requested and still refuses a taken name", async () => {
    await using root = await tmpdir()
    const reuseInbox = {
      name: INBOX_NOTEBOOK_NAME,
      buddyHome: root.path,
      reuseExisting: true,
    }

    const first = await createManagedNotebookByName(reuseInbox)
    const second = await createManagedNotebookByName(reuseInbox)

    expect(second).toBe(first)
    expect(second).toBe(await fsp.realpath(path.join(root.path, INBOX_NOTEBOOK_NAME)))
    await expectNotebookNameTaken({ buddyHome: root.path, name: INBOX_NOTEBOOK_NAME })

    const refused = createManagedNotebookByName({
      name: INBOX_NOTEBOOK_NAME,
      buddyHome: root.path,
      reuseExisting: false,
    })
    await expect(refused).rejects.toBeInstanceOf(ManagedNotebookError)
    await expect(refused).rejects.toThrow(`A notebook named ${INBOX_NOTEBOOK_NAME} already exists`)
  })

  test("refuses a notebook name that already exists", async () => {
    await using root = await tmpdir()
    const notebookName = "Field Notes"
    await fsp.mkdir(path.join(root.path, notebookName))

    await expectNotebookNameTaken({ buddyHome: root.path, name: notebookName })
  })

  test("refuses a case-only name when the filesystem treats it as the same folder", async () => {
    await using root = await tmpdir()
    if (!(await filesystemCollidesOnCase(root.path))) return

    await fsp.mkdir(path.join(root.path, "Field Notes"))

    await expectNotebookNameTaken({ buddyHome: root.path, name: "field notes" })
  })
})
