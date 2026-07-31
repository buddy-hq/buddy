import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { workspaceDrawerUiKey } from "@/state/workspace-drawer-ui-state"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Spinner,
  Switch,
  toast,
} from "@buddy/ui"
import { AlertTriangleIcon, RefreshCwIcon, SearchXIcon, SparklesIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import {
  installLibrarySkill,
  loadSkillsCatalog,
  removeLibrarySkill,
  setSkillPermissionAction,
  type InstalledSkillInfo,
  type SkillLibraryEntry,
  type SkillRuleAction,
  type SkillsCatalog,
} from "@/state/skills-actions"
import {
  invalidateSkillPresentationsQuery,
  invalidateSkillsCatalogQuery,
  skillsCatalogQueryOptions,
} from "@/state/skills-catalog-query"
import {
  isInstalledLibrarySkill,
  skillLibraryAction,
  skillLibraryButtonVariant,
  type SkillLibraryAction,
} from "@/components/skills/skill-library-actions"
import { matchesInstalledSkillSearch } from "@/components/skills/skill-presentation"
import {
  SKILL_DETAIL_FIELD_CHIPS,
  SKILL_DETAIL_FIELD_TEXT,
  SkillDetailDialog,
  type SkillDetail,
  type SkillDetailActivation,
  type SkillDetailField,
} from "@/components/skills/skill-detail-dialog"
import {
  SKILL_ROW_DENSITY_COMPACT,
  SKILL_ROW_DENSITY_DEFAULT,
  SKILL_ROW_DENSITY_EXPANDED,
  SkillsListRow,
  SkillsSectionHeader,
  type SkillRowDensity,
} from "@/components/skills/skills-drawer-ui"
import { RightWorkspaceDrawerShell } from "./right-workspace-drawer-ui"

type BusyOperation = "install" | "permission" | "remove" | "update"
type SelectedSkill = { kind: "library"; skillID: string } | { kind: "installed"; skillName: string }

/**
 * One list, no tabs: everything installed here, then everything in the library
 * that is not. A row shows what it always showed — name, summary, control —
 * and the band it sits in says which pool it came from.
 */
type SkillListItem =
  | {
      kind: "installed"
      id: string
      title: string
      description: string
      icon?: string
      skill: InstalledSkillInfo
    }
  | {
      kind: "library"
      id: string
      title: string
      description: string
      icon?: string
      entry: SkillLibraryEntry
    }

const SKILL_LIST_SKELETON_COUNT = 5
const UPDATE_ALL_BUSY_KEY = "update-all"

/** How many top results earn the taller card while searching. */
const EXPANDED_RESULT_COUNT = 3
/** Below this the whole result set is scannable, so nothing needs collapsing. */
const COMPACT_TAIL_MIN_RESULTS = 12
const COMPACT_TAIL_START_INDEX = 8

function installLibraryBusyKey(skillID: string) {
  return `install:${skillID}`
}

function removeLibraryBusyKey(skillID: string) {
  return `remove-library:${skillID}`
}

function permissionBusyKey(skillName: string) {
  return `permission:${skillName}`
}

function statusLabel(action: InstalledSkillInfo["permissionAction"]): string {
  return action === "deny" ? language.t("skills.status.off") : language.t("skills.status.on")
}

function sourceLabel(source: InstalledSkillInfo["source"]): string {
  if (source === "custom") return language.t("skills.source.custom")
  if (source === "library") return language.t("skills.curated")
  if (source === "system") return language.t("skills.source.system")
  return language.t("skills.source.detected")
}

function scopeLabel(scope: InstalledSkillInfo["scope"]): string {
  return scope === "workspace"
    ? language.t("skills.scope.workspace")
    : language.t("skills.scope.global")
}

function installOrUpdateOperation(
  skill: SkillLibraryEntry,
): Extract<BusyOperation, "install" | "update"> {
  return skill.state === "update_available" ? "update" : "install"
}

function libraryBusyAction(
  skillID: string,
  busyOperations: ReadonlyMap<string, BusyOperation>,
): SkillLibraryAction | undefined {
  if (busyOperations.get(removeLibraryBusyKey(skillID)) === "remove") return "remove"
  const operation = busyOperations.get(installLibraryBusyKey(skillID))
  return operation === "install" || operation === "update" ? operation : undefined
}

function libraryActionLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.install")
  if (action === "update") return language.t("skills.update")
  if (action === "remove") return language.t("skills.detail.remove")
  return language.t("skills.installed")
}

function libraryBusyLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.installing")
  if (action === "update") return language.t("skills.updating")
  if (action === "remove") return language.t("skills.removing")
  return language.t("skills.installed")
}

function matchesLibrarySearch(skill: SkillLibraryEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true
  return [
    skill.displayName,
    skill.summary,
    skill.sourceLabel,
    ...skill.categories,
    ...skill.tags,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
}

/**
 * One pool, one order. Source used to drive the installed order, but source is
 * not shown on a row, so ordering by it only looked arbitrary — the name is the
 * thing the eye scans.
 */
function compareListItems(left: SkillListItem, right: SkillListItem): number {
  return left.title.localeCompare(right.title)
}

/**
 * While searching the two bands dissolve into one rank. A hit in the name or
 * the summary — the two things a row actually shows — outranks a hit in
 * metadata the row does not show, and what you already have wins ties: it is a
 * shorter path to the thing you asked for than something you must install.
 */
function searchRank(item: SkillListItem, query: string): number {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = [item.title, item.description].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  )
  return (visible ? 0 : 2) + (item.kind === "installed" ? 0 : 1)
}

function compareSearchResults(left: SkillListItem, right: SkillListItem, query: string): number {
  return searchRank(left, query) - searchRank(right, query) || compareListItems(left, right)
}

/**
 * Density follows the state of the list, not the item: the best few answers get
 * room for a fuller summary, and once a result set is long enough that the user
 * is scanning names rather than reading, the tail gives its summary back.
 */
function resultDensity(index: number, total: number): SkillRowDensity {
  if (index < EXPANDED_RESULT_COUNT) return SKILL_ROW_DENSITY_EXPANDED
  if (total > COMPACT_TAIL_MIN_RESULTS && index >= COMPACT_TAIL_START_INDEX) {
    return SKILL_ROW_DENSITY_COMPACT
  }
  return SKILL_ROW_DENSITY_DEFAULT
}

function mutationSuccessMessage(skill: SkillLibraryEntry): string {
  return skill.state === "update_available"
    ? language.t("skills.librarySection.updatedSkill", { name: skill.displayName })
    : language.t("skills.librarySection.addedSkill", { name: skill.displayName })
}

function SkillListSkeleton() {
  return (
    <div
      className="flex flex-col gap-1.5 p-2.5"
      aria-label={language.t("skills.loadingSkills")}
      role="status"
    >
      {Array.from({ length: SKILL_LIST_SKELETON_COUNT }, (_, index) => (
        <div key={index} className="flex h-[4.5rem] items-center gap-3.5 px-2.5">
          <Skeleton className="size-13 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  )
}

function SkillEmptyState(props: { kind: "empty" | "search" }) {
  const search = props.kind === "search"
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {search ? <SearchXIcon aria-hidden /> : <SparklesIcon aria-hidden />}
        </EmptyMedia>
        <EmptyTitle>
          {search
            ? language.t("skills.empty.search.title")
            : language.t("skills.empty.installed.title")}
        </EmptyTitle>
        <EmptyDescription>
          {search
            ? language.t("skills.empty.search.description")
            : language.t("skills.empty.installed.description")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function SkillLoadErrorState(props: { message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangleIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{language.t("skills.error.title")}</EmptyTitle>
        <EmptyDescription>{props.message}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" size="sm" disabled={props.retrying} onClick={props.onRetry}>
        {props.retrying ? <Spinner data-icon="inline-start" /> : null}
        {props.retrying ? language.t("skills.error.retrying") : language.t("skills.error.retry")}
      </Button>
    </Empty>
  )
}

/**
 * The same control at two scales: a row's control has to sit inside a 72px row
 * without becoming the loudest thing in it, and a dialog's has to look like the
 * button you came to press.
 */
function LibraryActionControl(props: {
  skill: SkillLibraryEntry
  busyAction?: SkillLibraryAction
  disabled?: boolean
  size?: "xs" | "default"
  onAction: () => void
}) {
  const action = skillLibraryAction(props.skill.state)
  const displayAction = props.busyAction ?? action
  const busy = props.busyAction !== undefined
  const size = props.size ?? "xs"
  return (
    <Button
      type="button"
      size={size}
      variant={skillLibraryButtonVariant(displayAction)}
      className={size === "default" ? "min-w-28" : "w-24"}
      aria-busy={busy}
      disabled={props.disabled || busy || action === "installed"}
      onClick={props.onAction}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {busy ? libraryBusyLabel(displayAction) : libraryActionLabel(displayAction)}
    </Button>
  )
}

/**
 * The switch is the whole control. An "On"/"Off" word beside it repeats what the
 * switch already shows, and it lands at the same optical height as the second
 * line of the summary — so the row reads as three competing text blocks with a
 * small toggle orbiting them. State survives without it: the switch says on or
 * off, and a switched-off row greys out.
 */
function InstalledToggle(props: {
  skill: InstalledSkillInfo
  pending: boolean
  onToggle: (checked: boolean) => void
}) {
  const active = props.skill.permissionAction !== "deny"
  return (
    <div className="flex w-24 items-center justify-end gap-2" aria-busy={props.pending}>
      {props.pending ? <Spinner className="size-3.5" /> : null}
      <Switch
        checked={active}
        disabled={props.pending}
        aria-label={language.t("skills.toggleAria", { name: props.skill.displayName })}
        onCheckedChange={props.onToggle}
      />
    </div>
  )
}

/** Drops fields whose value list is empty, so no label sits over nothing. */
function presentFields(fields: readonly SkillDetailField[]): SkillDetailField[] {
  return fields.filter((field) => field.values.length > 0)
}

export function RightWorkspaceSkillsDrawer(props: { directory: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const catalogQuery = useQuery(skillsCatalogQueryOptions(props.directory))
  const catalog = catalogQuery.data
  const loading = !catalog && (catalogQuery.isPending || catalogQuery.isFetching)
  const [search, setSearch] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [iconRetryToken, setIconRetryToken] = useState(0)
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkill>()
  const [busyOperations, setBusyOperations] = useState<ReadonlyMap<string, BusyOperation>>(
    () => new Map(),
  )
  const lastLibrarySyncError = useRef<string>()

  const installedByLibraryID = useMemo(
    () =>
      new Map(
        (catalog?.installed ?? [])
          .filter((skill) => skill.libraryID !== undefined)
          .map((skill) => [skill.libraryID, skill] as const),
      ),
    [catalog?.installed],
  )
  const libraryByID = useMemo(
    () => new Map((catalog?.library ?? []).map((skill) => [skill.id, skill] as const)),
    [catalog?.library],
  )

  /**
   * A library entry that is already installed is the same skill as its
   * installed row, so only the ones you do not have join the list.
   */
  const visibleInstalled = useMemo(
    () =>
      (catalog?.installed ?? [])
        .filter((skill) =>
          matchesInstalledSkillSearch(skill, search, [
            sourceLabel(skill.source),
            scopeLabel(skill.scope),
            statusLabel(skill.permissionAction),
          ]),
        )
        .map((skill): SkillListItem => {
          const libraryEntry = libraryByID.get(skill.libraryID ?? "")
          const icon = libraryEntry?.icon ?? skill.icon
          const item: SkillListItem = {
            kind: "installed",
            id: skill.libraryID ?? skill.name,
            title: libraryEntry?.displayName ?? skill.displayName,
            description: libraryEntry?.summary ?? skill.shortDescription,
            skill,
          }
          if (icon) item.icon = icon
          return item
        })
        .toSorted(compareListItems),
    [catalog?.installed, libraryByID, search],
  )
  const visibleAvailable = useMemo(
    () =>
      (catalog?.library ?? [])
        .filter(
          (entry) =>
            (entry.state === "available" || entry.state === "withdrawn_installed") &&
            matchesLibrarySearch(entry, search),
        )
        .map((entry): SkillListItem => {
          const item: SkillListItem = {
            kind: "library",
            id: entry.id,
            title: entry.displayName,
            description: entry.summary,
            entry,
          }
          if (entry.icon) item.icon = entry.icon
          return item
        })
        .toSorted(compareListItems),
    [catalog?.library, search],
  )
  const updateSkills = useMemo(
    () => (catalog?.library ?? []).filter((skill) => skill.state === "update_available"),
    [catalog?.library],
  )

  const searchActive = search.trim().length > 0
  const searchResults = useMemo(
    () =>
      [...visibleInstalled, ...visibleAvailable].toSorted((left, right) =>
        compareSearchResults(left, right, search),
      ),
    [search, visibleAvailable, visibleInstalled],
  )
  const loadError =
    !catalog && catalogQuery.error
      ? catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : language.t("skills.loadFailed")
      : undefined
  const selectedLibrarySkill =
    selectedSkill?.kind === "library" ? libraryByID.get(selectedSkill.skillID) : undefined
  const selectedInstalledSkill =
    selectedSkill?.kind === "installed"
      ? catalog?.installed.find((skill) => skill.name === selectedSkill.skillName)
      : undefined
  const selectedLibraryInstalledSkill = selectedLibrarySkill
    ? installedByLibraryID.get(selectedLibrarySkill.id)
    : undefined
  const refreshCatalog = useCallback(
    async (options?: { force?: boolean; showToast?: boolean }) => {
      setRefreshing(true)
      try {
        const nextCatalog = options?.force
          ? await loadSkillsCatalog(props.directory, { refresh: true })
          : await queryClient.fetchQuery(skillsCatalogQueryOptions(props.directory))
        queryClient.setQueryData<SkillsCatalog>(
          skillsCatalogQueryOptions(props.directory).queryKey,
          nextCatalog,
        )
        if (options?.force) {
          setIconRetryToken((token) => token + 1)
          await invalidateSkillPresentationsQuery(queryClient, props.directory)
        }
        if (options?.force && options.showToast !== false) {
          toast.success(language.t("skills.refreshed"))
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : language.t("skills.loadFailed"))
      } finally {
        setRefreshing(false)
      }
    },
    [props.directory, queryClient],
  )

  useEffect(() => {
    if (!catalog || !catalogQuery.error) return
    toast.error(
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : language.t("skills.loadFailed"),
    )
  }, [catalog, catalogQuery.error])

  useEffect(() => {
    const syncError = catalog?.librarySyncError
    if (syncError && syncError !== lastLibrarySyncError.current) {
      lastLibrarySyncError.current = syncError
      toast.error(language.t("skills.curatedSyncFailed", { error: syncError }))
      return
    }
    if (!syncError) lastLibrarySyncError.current = undefined
  }, [catalog?.librarySyncError])

  function setBusyOperation(key: string, operation: BusyOperation) {
    setBusyOperations((current) => new Map(current).set(key, operation))
  }

  function clearBusyOperation(key: string) {
    setBusyOperations((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
  }

  async function runLibraryMutation(skill: SkillLibraryEntry, requestedAction?: "remove") {
    const action = skillLibraryAction(skill.state)
    const removing = requestedAction === "remove" || action === "remove"
    const key = removing ? removeLibraryBusyKey(skill.id) : installLibraryBusyKey(skill.id)
    setBusyOperation(key, removing ? "remove" : installOrUpdateOperation(skill))
    try {
      if (removing) {
        await removeLibrarySkill(skill.id, props.directory)
        toast.success(language.t("skills.detail.removedSkill", { name: skill.displayName }))
      } else {
        await installLibrarySkill(skill.id, props.directory)
        toast.success(mutationSuccessMessage(skill))
      }
      await invalidateSkillsCatalogQuery(queryClient, props.directory)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : language.t("skills.requestFailed"))
    } finally {
      clearBusyOperation(key)
    }
  }

  async function updateAllSkills() {
    if (updateSkills.length === 0 || busyOperations.has(UPDATE_ALL_BUSY_KEY)) return
    setBusyOperation(UPDATE_ALL_BUSY_KEY, "update")
    setBusyOperations((current) => {
      const next = new Map(current)
      for (const skill of updateSkills) next.set(installLibraryBusyKey(skill.id), "update")
      return next
    })
    try {
      let failureCount = 0
      for (const skill of updateSkills) {
        try {
          await installLibrarySkill(skill.id, props.directory)
        } catch {
          failureCount += 1
        }
      }
      await invalidateSkillsCatalogQuery(queryClient, props.directory)
      if (failureCount === 0) {
        toast.success(language.t("skills.updateAll.success", { count: updateSkills.length }))
      } else {
        toast.error(
          language.t("skills.updateAll.partialFailure", {
            failed: failureCount,
            updated: updateSkills.length - failureCount,
          }),
        )
      }
    } finally {
      setBusyOperations((current) => {
        const next = new Map(current)
        next.delete(UPDATE_ALL_BUSY_KEY)
        for (const skill of updateSkills) next.delete(installLibraryBusyKey(skill.id))
        return next
      })
    }
  }

  function updateSkillPermission(skill: InstalledSkillInfo, action: SkillRuleAction) {
    if (skill.permissionAction === action) return
    const key = permissionBusyKey(skill.name)
    setBusyOperation(key, "permission")
    void setSkillPermissionAction(skill.name, action, props.directory)
      .then((response) => {
        queryClient.setQueryData<SkillsCatalog>(
          skillsCatalogQueryOptions(props.directory).queryKey,
          (current) =>
            current
              ? {
                  ...current,
                  installed: current.installed.map((item) =>
                    item.name === response.skill.name ? response.skill : item,
                  ),
                }
              : current,
        )
        toast.success(
          language.t("skills.permissionUpdated", {
            name: skill.displayName,
            statusLabel: statusLabel(action).toLocaleLowerCase(),
          }),
        )
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : language.t("skills.requestFailed"))
      })
      .finally(() => clearBusyOperation(key))
  }

  function selectInstalledSkill(skill: InstalledSkillInfo) {
    if (skill.libraryID && libraryByID.has(skill.libraryID)) {
      setSelectedSkill({ kind: "library", skillID: skill.libraryID })
      return
    }
    setSelectedSkill({ kind: "installed", skillName: skill.name })
  }

  /**
   * One renderer for both pools. The control is the only thing that differs —
   * a switch for what you have, an install for what you do not — and it sits in
   * the same slot either way, so the right edge of the list stays a straight
   * line and no row needs a badge repeating what its control already says.
   */
  function renderListItem(item: SkillListItem, density: SkillRowDensity) {
    const shared = {
      id: item.id,
      title: item.title,
      description: item.description,
      ...(item.icon ? { icon: item.icon } : {}),
      iconRetryToken,
      density,
      ariaLabel: language.t("skills.manageAria", { name: item.title }),
      ...(searchActive ? { query: search } : {}),
    }

    if (item.kind === "installed") {
      const off = item.skill.permissionAction === "deny"
      return (
        <SkillsListRow
          key={`installed:${item.skill.name}`}
          {...shared}
          {...(off ? { dimmed: true } : {})}
          control={
            <InstalledToggle
              skill={item.skill}
              pending={busyOperations.has(permissionBusyKey(item.skill.name))}
              onToggle={(checked) => updateSkillPermission(item.skill, checked ? "allow" : "deny")}
            />
          }
          onSelect={() => selectInstalledSkill(item.skill)}
        />
      )
    }

    const busyAction = libraryBusyAction(item.entry.id, busyOperations)
    return (
      <SkillsListRow
        key={`library:${item.entry.id}`}
        {...shared}
        muted
        control={
          <LibraryActionControl
            skill={item.entry}
            busyAction={busyAction}
            disabled={busyAction !== undefined}
            onAction={() => void runLibraryMutation(item.entry)}
          />
        }
        onSelect={() => setSelectedSkill({ kind: "library", skillID: item.entry.id })}
      />
    )
  }

  function renderBand(items: readonly SkillListItem[]) {
    return (
      <div className="flex flex-col gap-1.5 px-2.5 pb-1.5 pt-1">
        {items.map((item) => renderListItem(item, SKILL_ROW_DENSITY_DEFAULT))}
      </div>
    )
  }

  function closeDetail() {
    setSelectedSkill(undefined)
  }

  function skillActivation(skill: InstalledSkillInfo): SkillDetailActivation {
    return {
      active: skill.permissionAction !== "deny",
      pending: busyOperations.has(permissionBusyKey(skill.name)),
      ariaLabel: language.t("skills.toggleAria", { name: skill.displayName }),
      onToggle: (checked) => updateSkillPermission(skill, checked ? "allow" : "deny"),
    }
  }

  /**
   * One dialog for both pools, because a skill is one thing however you reached
   * it. What differs is what the skill has to say: a library entry carries the
   * catalogue's metadata and an install action, a skill already on disk carries
   * where it came from — and either can be switched on and off once installed.
   */
  function skillDetail(): SkillDetail | undefined {
    if (selectedLibrarySkill) {
      const busyAction = libraryBusyAction(selectedLibrarySkill.id, busyOperations)
      const entry = selectedLibrarySkill
      return {
        id: entry.id,
        title: entry.displayName,
        description: entry.summary,
        ...(entry.icon ? { icon: entry.icon } : {}),
        fields: presentFields([
          {
            label: language.t("skills.detail.source"),
            kind: SKILL_DETAIL_FIELD_TEXT,
            values: [entry.sourceLabel],
          },
          {
            label: language.t("skills.detail.category"),
            kind: SKILL_DETAIL_FIELD_CHIPS,
            values: entry.categories,
          },
          {
            label: language.t("skills.detail.tags"),
            kind: SKILL_DETAIL_FIELD_CHIPS,
            values: entry.tags,
          },
        ]),
        ...(selectedLibraryInstalledSkill
          ? { activation: skillActivation(selectedLibraryInstalledSkill) }
          : {}),
        ...(isInstalledLibrarySkill(entry.state)
          ? {
              removal: {
                disabled: busyAction !== undefined,
                onRemove: () => {
                  closeDetail()
                  void runLibraryMutation(entry, "remove")
                },
              },
            }
          : {}),
        // An "Installed" button that cannot be pressed is a status wearing a
        // button's clothes; the switch above already says the skill is here.
        ...(skillLibraryAction(entry.state) === "installed"
          ? {}
          : {
              primaryAction: (
                <LibraryActionControl
                  skill={entry}
                  busyAction={busyAction}
                  size="default"
                  onAction={() => {
                    closeDetail()
                    void runLibraryMutation(entry)
                  }}
                />
              ),
            }),
      }
    }

    if (selectedInstalledSkill) {
      return {
        id: selectedInstalledSkill.name,
        title: selectedInstalledSkill.displayName,
        description: selectedInstalledSkill.shortDescription,
        ...(selectedInstalledSkill.icon ? { icon: selectedInstalledSkill.icon } : {}),
        fields: presentFields([
          {
            label: language.t("skills.detail.source"),
            kind: SKILL_DETAIL_FIELD_TEXT,
            values: [sourceLabel(selectedInstalledSkill.source)],
          },
          {
            label: language.t("skills.detail.scope"),
            kind: SKILL_DETAIL_FIELD_TEXT,
            values: [scopeLabel(selectedInstalledSkill.scope)],
          },
        ]),
        activation: skillActivation(selectedInstalledSkill),
      }
    }

    return undefined
  }

  const detail = skillDetail()

  return (
    <>
      <RightWorkspaceDrawerShell
        durableScrollKey={workspaceDrawerUiKey({ directory: props.directory, drawer: "skills" })}
        title={language.t("sidebar.skills")}
        searchLabel={language.t("skills.searchPlaceholder")}
        searchValue={search}
        action={{
          label: language.t("common.refresh"),
          icon: RefreshCwIcon,
          busy: refreshing || loading,
          onClick: () => void refreshCatalog({ force: true }),
        }}
        bodyClassName="flex flex-col overflow-hidden p-0"
        onSearchValueChange={setSearch}
        onClose={props.onClose}
      >
        {loadError ? (
          <SkillLoadErrorState
            message={loadError}
            retrying={refreshing}
            onRetry={() => void refreshCatalog()}
          />
        ) : (
          <div
            className="scrollbar-hover min-h-0 flex-1 overflow-y-auto"
            aria-busy={loading || refreshing}
          >
            {loading ? <SkillListSkeleton /> : null}

            {/* Searching dissolves the two bands into one rank: a band header
                while searching would only push the best answer down the page
                for the crime of not being installed yet. */}
            {!loading && searchActive ? (
              <>
                <div className="flex items-baseline justify-between gap-3 px-3 pb-1 pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
                    {language.t("skills.searchResults")}
                  </p>
                  <span className="text-[11px] tabular-nums text-text-weaker">
                    {searchResults.length}
                  </span>
                </div>
                {searchResults.length === 0 ? (
                  <SkillEmptyState kind="search" />
                ) : (
                  <div className="flex flex-col gap-1.5 px-2.5 pb-2.5 pt-1">
                    {searchResults.map((item, index) =>
                      renderListItem(item, resultDensity(index, searchResults.length)),
                    )}
                  </div>
                )}
              </>
            ) : null}

            {!loading && !searchActive ? (
              <>
                {updateSkills.length > 0 ? (
                  <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base bg-surface-base px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-base">
                      <RefreshCwIcon className="size-3.5" aria-hidden />
                      {language.t(
                        updateSkills.length === 1
                          ? "skills.updateAvailable.one"
                          : "skills.updateAvailable.other",
                        { count: updateSkills.length },
                      )}
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={busyOperations.has(UPDATE_ALL_BUSY_KEY)}
                      onClick={() => void updateAllSkills()}
                    >
                      {busyOperations.has(UPDATE_ALL_BUSY_KEY) ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      {busyOperations.has(UPDATE_ALL_BUSY_KEY)
                        ? language.t("skills.updating")
                        : language.t("skills.updateAll")}
                    </Button>
                  </div>
                ) : null}

                {visibleInstalled.length === 0 && visibleAvailable.length === 0 ? (
                  <SkillEmptyState kind="empty" />
                ) : null}

                {visibleInstalled.length > 0 ? (
                  <>
                    <SkillsSectionHeader
                      label={language.t("skills.section.installed")}
                      count={visibleInstalled.length}
                    />
                    {renderBand(visibleInstalled)}
                  </>
                ) : null}

                {visibleAvailable.length > 0 ? (
                  <>
                    <SkillsSectionHeader
                      label={language.t("skills.section.available")}
                      count={visibleAvailable.length}
                    />
                    {renderBand(visibleAvailable)}
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </RightWorkspaceDrawerShell>

      <SkillDetailDialog
        {...(detail ? { detail } : {})}
        iconRetryToken={iconRetryToken}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
      />
    </>
  )
}
