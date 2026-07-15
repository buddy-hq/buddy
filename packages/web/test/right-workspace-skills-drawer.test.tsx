import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { InstalledSkillInfo, SkillsCatalog } from "../src/state/skills-actions"

const TEST_DIRECTORY = "/repo"

let catalog: SkillsCatalog
let loadCatalog: () => Promise<SkillsCatalog>
let installSkill: (skillID: string) => Promise<{ ok: true; name: string }>
let removeSkill: (skillID: string) => Promise<{ ok: true; name: string }>
let setPermission: (
  name: string,
  action: "allow" | "deny",
) => Promise<{ ok: true; action: "allow" | "deny"; skill: InstalledSkillInfo }>

mock.module("@/state/skills-actions", () => ({
  loadSkillsCatalog: () => loadCatalog(),
  installLibrarySkill: (skillID: string) => installSkill(skillID),
  removeLibrarySkill: (skillID: string) => removeSkill(skillID),
  setSkillPermissionAction: (name: string, action: "allow" | "deny") =>
    setPermission(name, action),
}))

function installedSkill(
  input: Pick<InstalledSkillInfo, "name" | "displayName" | "permissionAction" | "source"> &
    Partial<Pick<InstalledSkillInfo, "libraryID" | "scope" | "shortDescription">>,
): InstalledSkillInfo {
  return {
    name: input.name,
    description: input.shortDescription ?? `${input.displayName} instructions`,
    displayName: input.displayName,
    shortDescription: input.shortDescription ?? `${input.displayName} description`,
    location: `/skills/${input.name}/SKILL.md`,
    directory: `/skills/${input.name}`,
    content: `# ${input.displayName}`,
    enabled: input.permissionAction !== "deny",
    permissionAction: input.permissionAction,
    permissionSource: "explicit",
    source: input.source,
    scope: input.scope ?? "global",
    managed: true,
    removable: input.source !== "system",
    ...(input.libraryID ? { libraryID: input.libraryID } : {}),
  }
}

function populatedCatalog(): SkillsCatalog {
  return {
    directory: TEST_DIRECTORY,
    managedRoot: "/skills",
    externalVendorRootsEnabled: true,
    installed: [
      installedSkill({
        name: "slides",
        displayName: "PowerPoint Presentation",
        permissionAction: "allow",
        source: "library",
        libraryID: "slides-library",
      }),
      installedSkill({
        name: "withdrawn",
        displayName: "Withdrawn Skill",
        permissionAction: "allow",
        source: "library",
        libraryID: "withdrawn-library",
      }),
      installedSkill({
        name: "practice",
        displayName: "Practice",
        permissionAction: "deny",
        source: "system",
      }),
    ],
    library: [
      {
        id: "slides-library",
        displayName: "PowerPoint Presentation",
        summary: "Create and edit presentations.",
        categories: ["productivity"],
        tags: ["slides"],
        sourceKind: "github",
        sourceLabel: "anthropics/skills/pptx",
        state: "update_available",
      },
      {
        id: "withdrawn-library",
        displayName: "Withdrawn Skill",
        summary: "An installed skill withdrawn from the catalog.",
        categories: ["utility"],
        tags: ["withdrawn"],
        sourceKind: "github",
        sourceLabel: "example/withdrawn",
        state: "withdrawn_installed",
      },
      {
        id: "document-library",
        displayName: "DOCX",
        summary: "Create and edit documents.",
        categories: ["productivity"],
        tags: ["documents"],
        sourceKind: "github",
        sourceLabel: "anthropics/skills/docx",
        state: "available",
      },
    ],
  }
}

function emptyCatalog(): SkillsCatalog {
  return {
    directory: TEST_DIRECTORY,
    managedRoot: "/skills",
    externalVendorRootsEnabled: true,
    installed: [],
    library: [],
  }
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise, resolve: resolvePromise }
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe("RightWorkspaceSkillsDrawer", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    catalog = populatedCatalog()
    loadCatalog = async () => catalog
    installSkill = async (skillID) => ({ ok: true, name: skillID })
    removeSkill = async (skillID) => ({ ok: true, name: skillID })
    setPermission = async (name, action) => {
      const skill = catalog.installed.find((item) => item.name === name)
      if (!skill) throw new Error(`Unknown skill: ${name}`)
      const nextSkill = { ...skill, permissionAction: action }
      catalog = {
        ...catalog,
        installed: catalog.installed.map((item) => (item.name === name ? nextSkill : item)),
      }
      return { ok: true, action, skill: nextSkill }
    }
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderDrawer() {
    const { RightWorkspaceSkillsDrawer } = await import(
      "../src/components/directory-chat/right-workspace-skills-drawer"
    )
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RightWorkspaceSkillsDrawer directory={TEST_DIRECTORY} onClose={() => undefined} />
        </QueryClientProvider>,
      )
      await flushEffects()
      await flushEffects()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  async function selectTab(label: "Discover" | "Installed") {
    const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
      (candidate) => candidate.textContent === label,
    )
    expect(tab).not.toBeUndefined()
    await act(async () => {
      tab?.focus()
      tab?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }))
    })
  }

  async function searchFor(value: string) {
    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search skills"]')
    expect(searchInput).not.toBeNull()
    await act(async () => {
      if (!searchInput) return
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(searchInput, value)
      searchInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  test("shows loading, installed, discover, update, and withdrawn states", async () => {
    const pendingCatalog = deferred<SkillsCatalog>()
    loadCatalog = () => pendingCatalog.promise
    await renderDrawer()

    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
      "Loading skills...",
    )

    pendingCatalog.resolve(catalog)
    await act(async () => flushEffects())

    expect(container.textContent).toContain("1 update available")
    expect(container.textContent).toContain("PowerPoint Presentation")
    expect(container.textContent).toContain("Practice")
    expect(container.textContent).toContain("Off")

    await selectTab("Discover")

    expect(container.textContent).toContain("Update")
    expect(container.textContent).toContain("Remove")
    expect(container.textContent).toContain("Install")

    await act(async () => {
      queryClient.setQueryData(["skills", "catalog", TEST_DIRECTORY], emptyCatalog())
      await flushEffects()
    })
    expect(container.textContent).toContain("No skills to discover")

    await selectTab("Installed")
    expect(container.textContent).toContain("No installed skills")
  })

  test("shows a retryable initial load error", async () => {
    loadCatalog = async () => {
      throw new Error("Catalog offline")
    }
    await renderDrawer()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      await flushEffects()
    })

    expect(container.textContent).toContain("Couldn’t load skills")
    expect(container.textContent).toContain("Catalog offline")

    loadCatalog = async () => emptyCatalog()
    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Try again",
    )
    expect(retryButton).not.toBeUndefined()

    await act(async () => {
      retryButton?.click()
      await flushEffects()
      await flushEffects()
    })

    expect(container.textContent).toContain("No installed skills")
  })

  test("searches Discover and Installed together without duplicating installed library skills", async () => {
    await renderDrawer()
    await searchFor("PowerPoint")

    expect(container.querySelector('[role="tab"]')).toBeNull()
    expect(container.textContent).toContain("Across Discover and Installed")
    expect(container.textContent).toContain("Installed")
    expect(
      container.querySelectorAll('button[aria-label="Manage PowerPoint Presentation"]'),
    ).toHaveLength(1)

    await searchFor("DOCX")
    expect(container.textContent).toContain("Discover")
    expect(container.textContent).toContain("DOCX")
  })

  test("disables actions while install, update, removal, and permission changes are pending", async () => {
    const pendingInstall = deferred<{ ok: true; name: string }>()
    installSkill = () => pendingInstall.promise
    await renderDrawer()
    await selectTab("Discover")

    const installButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Install",
    )
    expect(installButton).not.toBeUndefined()

    await act(async () => {
      installButton?.click()
      await flushEffects()
    })

    expect(installButton?.disabled).toBe(true)
    expect(installButton?.textContent).toContain("Installing...")

    pendingInstall.resolve({ ok: true, name: "docx" })
    await act(async () => {
      await flushEffects()
      await flushEffects()
    })

    const pendingUpdate = deferred<{ ok: true; name: string }>()
    installSkill = () => pendingUpdate.promise
    const updateButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Update",
    )
    expect(updateButton).not.toBeUndefined()

    await act(async () => {
      updateButton?.click()
      await flushEffects()
    })

    expect(updateButton?.disabled).toBe(true)
    expect(updateButton?.textContent).toContain("Updating...")

    pendingUpdate.resolve({ ok: true, name: "slides" })
    await act(async () => {
      await flushEffects()
      await flushEffects()
    })

    const pendingRemoval = deferred<{ ok: true; name: string }>()
    removeSkill = () => pendingRemoval.promise
    const removeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Remove",
    )
    expect(removeButton).not.toBeUndefined()

    await act(async () => {
      removeButton?.click()
      await flushEffects()
    })

    expect(removeButton?.disabled).toBe(true)
    expect(removeButton?.textContent).toContain("Removing...")

    pendingRemoval.resolve({ ok: true, name: "withdrawn" })
    await act(async () => {
      await flushEffects()
      await flushEffects()
    })

    await selectTab("Installed")
    const pendingPermission = deferred<{
      ok: true
      action: "allow" | "deny"
      skill: InstalledSkillInfo
    }>()
    setPermission = () => pendingPermission.promise
    const practiceSwitch = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Toggle Practice"]',
    )
    expect(practiceSwitch).not.toBeNull()

    await act(async () => {
      practiceSwitch?.click()
      await flushEffects()
    })

    expect(practiceSwitch?.disabled).toBe(true)
    expect(practiceSwitch?.parentElement?.getAttribute("aria-busy")).toBe("true")

    const practice = catalog.installed.find((skill) => skill.name === "practice")
    expect(practice).not.toBeUndefined()
    if (!practice) return
    pendingPermission.resolve({ ok: true, action: "allow", skill: practice })
    await act(async () => flushEffects())
  })

  test("updates library skills sequentially", async () => {
    catalog = {
      ...catalog,
      library: [
        ...catalog.library,
        {
          id: "second-update",
          displayName: "Second Update",
          summary: "A second skill with an available update.",
          categories: ["utility"],
          tags: ["update"],
          sourceKind: "github",
          sourceLabel: "example/second-update",
          state: "update_available",
        },
      ],
    }
    const firstUpdate = deferred<{ ok: true; name: string }>()
    const updateCalls: string[] = []
    installSkill = (skillID) => {
      updateCalls.push(skillID)
      return updateCalls.length === 1
        ? firstUpdate.promise
        : Promise.resolve({ ok: true, name: skillID })
    }
    await renderDrawer()
    await act(async () => {
      await flushEffects()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(container.textContent).toContain("2 updates available")

    const updateAllButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Update all")
    expect(updateAllButton).not.toBeUndefined()

    await act(async () => {
      updateAllButton?.click()
      await flushEffects()
    })
    expect(updateCalls).toHaveLength(1)

    firstUpdate.resolve({ ok: true, name: updateCalls[0] ?? "" })
    await act(async () => {
      await flushEffects()
      await flushEffects()
    })
    expect(updateCalls).toEqual(["slides-library", "second-update"])
  })
})
