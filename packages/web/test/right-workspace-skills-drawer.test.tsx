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
  loadSkillPresentations: () => Promise.resolve([]),
  installLibrarySkill: (skillID: string) => installSkill(skillID),
  removeLibrarySkill: (skillID: string) => removeSkill(skillID),
  setSkillPermissionAction: (name: string, action: "allow" | "deny") => setPermission(name, action),
}))

mock.module("@/components/skills/skill-icon-assets", () => ({
  resolveSkillIconURL: (reference: string | undefined) =>
    reference?.startsWith("/api/")
      ? reference
      : reference
        ? `/test-skill-icons/${reference}`
        : undefined,
}))

const SLIDES_ICON_SHA256 = "a".repeat(64)
const DOCUMENT_ICON_SHA256 = "b".repeat(64)

function installedSkill(
  input: Pick<InstalledSkillInfo, "name" | "displayName" | "permissionAction" | "source"> &
    Partial<Pick<InstalledSkillInfo, "icon" | "libraryID" | "scope" | "shortDescription">>,
): InstalledSkillInfo {
  return {
    name: input.name,
    description: input.shortDescription ?? `${input.displayName} instructions`,
    displayName: input.displayName,
    shortDescription: input.shortDescription ?? `${input.displayName} description`,
    ...(input.icon ? { icon: input.icon } : {}),
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
        icon: `/api/skills/library/slides-library/icon?sha256=${SLIDES_ICON_SHA256}`,
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
        icon: `/api/skills/library/document-library/icon?sha256=${DOCUMENT_ICON_SHA256}`,
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

/** Drawer buttons live in the container; dialog content is portalled to the body. */
function buttonWithText(text: string, scope: ParentNode) {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === text,
  )
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
    const { RightWorkspaceSkillsDrawer } =
      await import("../src/components/directory-chat/right-workspace-skills-drawer")
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <RightWorkspaceSkillsDrawer directory={TEST_DIRECTORY} />
        </QueryClientProvider>,
      )
      await flushEffects()
      await flushEffects()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    // The catalog query resolves a tick after the first paint; without this the
    // list is still empty and every row query comes back null.
    await act(async () => {
      await flushEffects()
      await flushEffects()
    })
  }

  async function openDetail(name: string) {
    const row = container.querySelector<HTMLButtonElement>(`button[aria-label="Manage ${name}"]`)
    expect(row).not.toBeNull()
    await act(async () => {
      row?.click()
      await flushEffects()
    })
  }

  async function searchFor(value: string) {
    const searchInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search skills"]',
    )
    expect(searchInput).not.toBeNull()
    await act(async () => {
      if (!searchInput) return
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
      valueSetter?.call(searchInput, value)
      searchInput.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }

  test("shows loading, then both bands in one untabbed list", async () => {
    const pendingCatalog = deferred<SkillsCatalog>()
    loadCatalog = () => pendingCatalog.promise
    await renderDrawer()

    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(
      "Loading skills...",
    )

    pendingCatalog.resolve(catalog)
    await act(async () => flushEffects())

    expect(container.querySelector('[role="tab"]')).toBeNull()
    expect(container.textContent).toContain("1 update available")

    // Installed band: what this notebook has, on or off.
    expect(container.textContent).toContain("Your skills")
    expect(container.textContent).toContain("PowerPoint Presentation")
    expect(container.textContent).toContain("Practice")
    expect(
      container.querySelector('button[aria-label="Toggle Practice"]')?.getAttribute("aria-checked"),
    ).toBe("false")

    // Library band: only what is NOT installed, so nothing appears twice.
    expect(container.textContent).toContain("Available to add")
    expect(container.textContent).toContain("DOCX")
    expect(container.textContent).toContain("Withdrawn Skill")
    expect(buttonWithText("Install", container)).not.toBeUndefined()
    expect(buttonWithText("Remove", container)).not.toBeUndefined()
    expect(
      container.querySelector(
        `img[src="/api/skills/library/slides-library/icon?sha256=${SLIDES_ICON_SHA256}"]`,
      ),
    ).not.toBeNull()
    expect(
      container.querySelector(
        `img[src="/api/skills/library/document-library/icon?sha256=${DOCUMENT_ICON_SHA256}"]`,
      ),
    ).not.toBeNull()

    await act(async () => {
      queryClient.setQueryData(["skills", "catalog", TEST_DIRECTORY], emptyCatalog())
      await flushEffects()
    })
    expect(container.textContent).toContain("No skills yet")
  })

  test("reuses the same catalog and search density in a two-column settings layout", async () => {
    const { SKILLS_CATALOG_LAYOUT_TWO_COLUMNS, SkillsCatalogSurface } =
      await import("../src/components/directory-chat/right-workspace-skills-drawer")
    queryClient.setQueryData(["skills", "catalog", TEST_DIRECTORY], catalog)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SkillsCatalogSurface
            directory={TEST_DIRECTORY}
            layout={SKILLS_CATALOG_LAYOUT_TWO_COLUMNS}
          />
        </QueryClientProvider>,
      )
      await flushEffects()
      await flushEffects()
    })

    const catalogGrids = container.querySelectorAll(
      '[data-component="skills-catalog-grid"][data-layout="two-columns"]',
    )
    expect(catalogGrids.length).toBe(2)
    expect(container.querySelector('input[aria-label="Search skills"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Close Skills"]')).toBeNull()
    expect(container.querySelector(".sticky")).toBeNull()
    expect(container.textContent).not.toContain("Your skills")
    expect(container.textContent).not.toContain("Available to add")

    await searchFor("document")

    expect(
      container.querySelector(
        '[data-component="skills-catalog-search-grid"][data-layout="two-columns"]',
      ),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-component="skill-row"][data-density="expanded"]'),
    ).not.toBeNull()
  })

  test("keeps a row to its name, summary, and control", async () => {
    await renderDrawer()

    // Category, tags, scope, and source stay in the detail dialog. A row that
    // leaks them turns a calm list into a wall of badges.
    expect(container.textContent).not.toContain("productivity")
    expect(container.textContent).not.toContain("slides")
    expect(container.textContent).not.toContain("Global")
    expect(container.textContent).not.toContain("anthropics/skills/pptx")

    await openDetail("PowerPoint Presentation")
    expect(document.body.textContent).toContain("productivity")
    expect(document.body.textContent).toContain("anthropics/skills/pptx")
  })

  test("falls back to initials and retries failed icons on refresh", async () => {
    await renderDrawer()

    const iconSelector = `img[src="/api/skills/library/slides-library/icon?sha256=${SLIDES_ICON_SHA256}"]`
    const icon = container.querySelector<HTMLImageElement>(iconSelector)
    expect(icon).not.toBeNull()

    await act(async () => {
      icon?.dispatchEvent(new Event("error"))
      await flushEffects()
    })

    expect(container.querySelector(iconSelector)).toBeNull()
    expect(container.textContent).toContain("PP")

    const refreshButton = container.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')
    expect(refreshButton).not.toBeNull()
    await act(async () => {
      refreshButton?.click()
      await flushEffects()
      await flushEffects()
    })

    expect(container.querySelector(iconSelector)).not.toBeNull()
  })

  test("keeps per-skill update and removal reachable from the detail dialog", async () => {
    const presentationQueryKey = ["skills", "presentations", TEST_DIRECTORY] as const
    queryClient.setQueryData(presentationQueryKey, [])
    await renderDrawer()
    await openDetail("PowerPoint Presentation")

    const updateButton = buttonWithText("Update", document.body)
    expect(updateButton).not.toBeUndefined()
    expect(buttonWithText("Remove", document.body)).not.toBeUndefined()

    const updateCalls: string[] = []
    installSkill = async (skillID) => {
      updateCalls.push(skillID)
      return { ok: true, name: skillID }
    }
    await act(async () => {
      updateButton?.click()
      await flushEffects()
      await flushEffects()
    })
    expect(updateCalls).toEqual(["slides-library"])
    expect(queryClient.getQueryState(presentationQueryKey)?.isInvalidated).toBe(true)
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

    expect(container.textContent).toContain("No skills yet")
  })

  test("searches both pools as one ranked list, without duplicating installed library skills", async () => {
    await renderDrawer()
    await searchFor("PowerPoint")

    // Searching dissolves the bands: one rank, no section headers.
    expect(container.textContent).toContain("Results")
    expect(container.textContent).not.toContain("Your skills")
    expect(container.textContent).not.toContain("Available to add")
    expect(
      container.querySelectorAll('button[aria-label="Manage PowerPoint Presentation"]'),
    ).toHaveLength(1)

    await searchFor("DOCX")
    expect(container.textContent).toContain("DOCX")

    await searchFor("nothing matches this")
    expect(container.textContent).toContain("No matching skills")
  })

  test("disables actions while install and permission changes are pending", async () => {
    const pendingInstall = deferred<{ ok: true; name: string }>()
    installSkill = () => pendingInstall.promise
    await renderDrawer()

    const installButton = buttonWithText("Install", container)
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
    expect(practiceSwitch?.getAttribute("aria-busy")).toBe("true")

    const practice = catalog.installed.find((skill) => skill.name === "practice")
    expect(practice).not.toBeUndefined()
    if (!practice) return
    pendingPermission.resolve({ ok: true, action: "allow", skill: practice })
    await act(async () => flushEffects())
  })

  test("updates library skills sequentially", async () => {
    const presentationQueryKey = ["skills", "presentations", TEST_DIRECTORY] as const
    queryClient.setQueryData(presentationQueryKey, [])
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
    expect(queryClient.getQueryState(presentationQueryKey)?.isInvalidated).toBe(true)
  })
})
