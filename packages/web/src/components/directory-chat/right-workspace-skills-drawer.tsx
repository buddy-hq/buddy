import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@buddy/ui"
import { AlertTriangleIcon, RefreshCwIcon, SearchXIcon, SparklesIcon } from "lucide-react"
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
import { skillsCatalogQueryOptions } from "@/state/skills-catalog-query"
import {
  skillLibraryAction,
  skillLibraryButtonVariant,
  type SkillLibraryAction,
} from "@/components/skills/skill-library-actions"
import { matchesInstalledSkillSearch } from "@/components/skills/skill-presentation"
import {
  SkillsRailDetailField,
  SkillsRailListRow,
  SkillsRailSearchResultGroup,
} from "@/components/skills/skills-rail-ui"
import { RightWorkspaceDrawerShell } from "./right-workspace-drawer-ui"

type SkillsTab = "installed" | "discover"
type BusyOperation = "install" | "permission" | "remove" | "update"
type SelectedSkill =
  | { kind: "library"; skillID: string }
  | { kind: "installed"; skillName: string }

const SKILL_LIST_SKELETON_COUNT = 5
const UPDATE_ALL_BUSY_KEY = "update-all"

function installLibraryBusyKey(skillID: string) {
  return `install:${skillID}`
}

function removeLibraryBusyKey(skillID: string) {
  return `remove-library:${skillID}`
}

function permissionBusyKey(skillName: string) {
  return `permission:${skillName}`
}

function isSkillsTab(value: string): value is SkillsTab {
  return value === "installed" || value === "discover"
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
  return [skill.displayName, skill.summary, skill.sourceLabel, ...skill.categories, ...skill.tags].some(
    (value) => value.toLocaleLowerCase().includes(normalizedQuery),
  )
}

function installedSourceOrder(source: InstalledSkillInfo["source"]): number {
  if (source === "library") return 0
  if (source === "system") return 1
  if (source === "custom") return 2
  return 3
}

function compareInstalledSkills(left: InstalledSkillInfo, right: InstalledSkillInfo): number {
  const sourceDifference = installedSourceOrder(left.source) - installedSourceOrder(right.source)
  if (sourceDifference !== 0) return sourceDifference
  return left.displayName.localeCompare(right.displayName)
}

function compareLibrarySkills(left: SkillLibraryEntry, right: SkillLibraryEntry): number {
  const leftInstalled = left.state !== "available"
  const rightInstalled = right.state !== "available"
  if (leftInstalled && !rightInstalled) return -1
  if (!leftInstalled && rightInstalled) return 1
  return left.displayName.localeCompare(right.displayName)
}

function mutationSuccessMessage(skill: SkillLibraryEntry): string {
  return skill.state === "update_available"
    ? language.t("skills.librarySection.updatedSkill", { name: skill.displayName })
    : language.t("skills.librarySection.addedSkill", { name: skill.displayName })
}

function SkillListSkeleton() {
  return (
    <div aria-label={language.t("skills.loadingSkills")} role="status">
      {Array.from({ length: SKILL_LIST_SKELETON_COUNT }, (_, index) => (
        <Fragment key={index}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center px-4 py-3">
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          {index < SKILL_LIST_SKELETON_COUNT - 1 ? <Separator /> : null}
        </Fragment>
      ))}
    </div>
  )
}

function SkillEmptyState(props: { kind: "discover" | "installed" | "search" }) {
  const search = props.kind === "search"
  const installed = props.kind === "installed"
  return (
    <Empty className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {search ? <SearchXIcon aria-hidden /> : <SparklesIcon aria-hidden />}
        </EmptyMedia>
        <EmptyTitle>
          {search
            ? language.t("skills.empty.search.title")
            : installed
              ? language.t("skills.empty.installed.title")
              : language.t("skills.empty.discover.title")}
        </EmptyTitle>
        <EmptyDescription>
          {search
            ? language.t("skills.empty.search.description")
            : installed
              ? language.t("skills.empty.installed.description")
              : language.t("skills.empty.discover.description")}
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

function LibraryActionControl(props: {
  skill: SkillLibraryEntry
  busyAction?: SkillLibraryAction
  disabled?: boolean
  onAction: () => void
}) {
  const action = skillLibraryAction(props.skill.state)
  const displayAction = props.busyAction ?? action
  const busy = props.busyAction !== undefined
  return (
    <Button
      type="button"
      size="xs"
      variant={skillLibraryButtonVariant(displayAction)}
      className="w-24"
      aria-busy={busy}
      disabled={props.disabled || busy || action === "installed"}
      onClick={props.onAction}
    >
      {busy ? <Spinner data-icon="inline-start" /> : null}
      {busy ? libraryBusyLabel(displayAction) : libraryActionLabel(displayAction)}
    </Button>
  )
}

function InstalledToggle(props: {
  skill: InstalledSkillInfo
  pending: boolean
  onToggle: (checked: boolean) => void
}) {
  const active = props.skill.permissionAction !== "deny"
  return (
    <div className="flex w-24 items-center justify-end gap-2" aria-busy={props.pending}>
      {props.pending ? (
        <Spinner className="size-3.5" />
      ) : (
        <span className="text-xs text-text-weaker">{statusLabel(props.skill.permissionAction)}</span>
      )}
      <Switch
        size="sm"
        checked={active}
        disabled={props.pending}
        aria-label={language.t("skills.toggleAria", { name: props.skill.displayName })}
        onCheckedChange={props.onToggle}
      />
    </div>
  )
}

function SkillActivationControl(props: {
  skill: InstalledSkillInfo
  pending: boolean
  onToggle: (checked: boolean) => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg border border-border-weaker-base bg-surface-base p-3"
      aria-busy={props.pending}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-text-base">{language.t("skills.active")}</span>
        <span className="text-xs text-text-weaker">
          {language.t("skills.activeDescription")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {props.pending ? <Spinner className="size-3.5" /> : null}
        <Switch
          checked={props.skill.permissionAction !== "deny"}
          disabled={props.pending}
          aria-label={language.t("skills.toggleAria", { name: props.skill.displayName })}
          onCheckedChange={props.onToggle}
        />
      </div>
    </div>
  )
}

export function RightWorkspaceSkillsDrawer(props: { directory: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const catalogQuery = useQuery(skillsCatalogQueryOptions(props.directory))
  const catalog = catalogQuery.data
  const loading = !catalog && (catalogQuery.isPending || catalogQuery.isFetching)
  const [activeTab, setActiveTab] = useState<SkillsTab>("installed")
  const [search, setSearch] = useState("")
  const [refreshing, setRefreshing] = useState(false)
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
        .toSorted(compareInstalledSkills),
    [catalog?.installed, search],
  )
  const visibleLibrary = useMemo(
    () =>
      (catalog?.library ?? [])
        .filter((skill) => matchesLibrarySearch(skill, search))
        .toSorted(compareLibrarySkills),
    [catalog?.library, search],
  )
  const updateSkills = useMemo(
    () => (catalog?.library ?? []).filter((skill) => skill.state === "update_available"),
    [catalog?.library],
  )

  const searchActive = search.trim().length > 0
  const visibleDiscoverSearch = visibleLibrary.filter((skill) => skill.state === "available")
  const searchResultCount = visibleInstalled.length + visibleDiscoverSearch.length
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
      await refreshCatalog({ showToast: false })
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
      await refreshCatalog({ showToast: false })
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

  function renderInstalledSkills(skills: readonly InstalledSkillInfo[]) {
    return skills.map((skill, index) => (
      <Fragment key={skill.name}>
        <SkillsRailListRow
          title={libraryByID.get(skill.libraryID ?? "")?.displayName ?? skill.displayName}
          description={libraryByID.get(skill.libraryID ?? "")?.summary ?? skill.shortDescription}
          ariaLabel={language.t("skills.manageAria", { name: skill.displayName })}
          control={
            <InstalledToggle
              skill={skill}
              pending={busyOperations.has(permissionBusyKey(skill.name))}
              onToggle={(checked) => updateSkillPermission(skill, checked ? "allow" : "deny")}
            />
          }
          onSelect={() => selectInstalledSkill(skill)}
        />
        {index < skills.length - 1 ? <Separator /> : null}
      </Fragment>
    ))
  }

  function renderLibrarySkills(skills: readonly SkillLibraryEntry[]) {
    return skills.map((skill, index) => {
      const busyAction = libraryBusyAction(skill.id, busyOperations)
      return (
        <Fragment key={skill.id}>
          <SkillsRailListRow
            title={skill.displayName}
            description={skill.summary}
            ariaLabel={language.t("skills.manageAria", { name: skill.displayName })}
            control={
              <LibraryActionControl
                skill={skill}
                busyAction={busyAction}
                disabled={busyAction !== undefined}
                onAction={() => void runLibraryMutation(skill)}
              />
            }
            onSelect={() => setSelectedSkill({ kind: "library", skillID: skill.id })}
          />
          {index < skills.length - 1 ? <Separator /> : null}
        </Fragment>
      )
    })
  }

  function closeDetail() {
    setSelectedSkill(undefined)
  }

  return (
    <>
      <RightWorkspaceDrawerShell
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
        ) : searchActive ? (
          <div className="scrollbar-hover flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-2">
            <div className="flex items-baseline justify-between gap-3 px-4">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-xs font-medium text-text-strong">
                  {language.t("skills.searchResults")}
                </h2>
                <p className="text-[11px] text-text-weaker">
                  {language.t("skills.searchAcross")}
                </p>
              </div>
              <span className="text-xs text-text-weaker">{searchResultCount}</span>
            </div>
            {loading ? <SkillListSkeleton /> : null}
            {!loading && searchResultCount === 0 ? <SkillEmptyState kind="search" /> : null}
            {!loading && visibleDiscoverSearch.length > 0 ? (
              <SkillsRailSearchResultGroup label={language.t("skills.discover")}>
                {renderLibrarySkills(visibleDiscoverSearch)}
              </SkillsRailSearchResultGroup>
            ) : null}
            {!loading && visibleInstalled.length > 0 ? (
              <SkillsRailSearchResultGroup label={language.t("skills.installed")}>
                {renderInstalledSkills(visibleInstalled)}
              </SkillsRailSearchResultGroup>
            ) : null}
          </div>
        ) : (
          <Tabs
            value={activeTab}
            className="min-h-0 flex-1 gap-0"
            onValueChange={(value) => {
              if (isSkillsTab(value)) setActiveTab(value)
            }}
          >
            <div className="shrink-0 border-b border-border-weaker-base px-3 pt-1">
              <TabsList variant="line" className="w-full">
                <TabsTrigger value="installed">{language.t("skills.installed")}</TabsTrigger>
                <TabsTrigger value="discover">{language.t("skills.discover")}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="installed"
              className="scrollbar-hover min-h-0 overflow-y-auto"
              aria-busy={loading || refreshing}
            >
              {!loading && updateSkills.length > 0 ? (
                <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base bg-surface-base px-4 py-2.5">
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
              {loading ? <SkillListSkeleton /> : null}
              {!loading && visibleInstalled.length === 0 ? (
                <SkillEmptyState kind="installed" />
              ) : null}
              {!loading && visibleInstalled.length > 0 ? (
                <div>{renderInstalledSkills(visibleInstalled)}</div>
              ) : null}
            </TabsContent>

            <TabsContent
              value="discover"
              className="scrollbar-hover min-h-0 overflow-y-auto"
              aria-busy={loading || refreshing}
            >
              {loading ? <SkillListSkeleton /> : null}
              {!loading && visibleLibrary.length === 0 ? (
                <SkillEmptyState kind="discover" />
              ) : null}
              {!loading && visibleLibrary.length > 0 ? (
                <div>{renderLibrarySkills(visibleLibrary)}</div>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </RightWorkspaceDrawerShell>

      <Dialog
        open={selectedSkill !== undefined}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
      >
        <DialogContent className="sm:max-w-xl">
          {selectedLibrarySkill ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedLibrarySkill.displayName}</DialogTitle>
                <DialogDescription>{selectedLibrarySkill.summary}</DialogDescription>
              </DialogHeader>

              {selectedLibraryInstalledSkill ? (
                <SkillActivationControl
                  skill={selectedLibraryInstalledSkill}
                  pending={busyOperations.has(
                    permissionBusyKey(selectedLibraryInstalledSkill.name),
                  )}
                  onToggle={(checked) =>
                    updateSkillPermission(
                      selectedLibraryInstalledSkill,
                      checked ? "allow" : "deny",
                    )
                  }
                />
              ) : null}

              <dl className="flex flex-col gap-4 py-2">
                <SkillsRailDetailField label={language.t("skills.detail.source")}>
                  {selectedLibrarySkill.sourceLabel}
                </SkillsRailDetailField>
                <SkillsRailDetailField label={language.t("skills.detail.category")}>
                  {selectedLibrarySkill.categories.join(", ")}
                </SkillsRailDetailField>
                <SkillsRailDetailField label={language.t("skills.detail.tags")}>
                  {selectedLibrarySkill.tags.join(", ")}
                </SkillsRailDetailField>
              </dl>

              <DialogFooter>
                {selectedLibrarySkill.state === "installed" ||
                selectedLibrarySkill.state === "update_available" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={libraryBusyAction(selectedLibrarySkill.id, busyOperations) !== undefined}
                    onClick={() => {
                      closeDetail()
                      void runLibraryMutation(selectedLibrarySkill, "remove")
                    }}
                  >
                    {language.t("skills.detail.remove")}
                  </Button>
                ) : null}
                <LibraryActionControl
                  skill={selectedLibrarySkill}
                  busyAction={libraryBusyAction(selectedLibrarySkill.id, busyOperations)}
                  onAction={() => {
                    closeDetail()
                    void runLibraryMutation(selectedLibrarySkill)
                  }}
                />
              </DialogFooter>
            </>
          ) : null}

          {selectedInstalledSkill ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedInstalledSkill.displayName}</DialogTitle>
                <DialogDescription>{selectedInstalledSkill.shortDescription}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{sourceLabel(selectedInstalledSkill.source)}</Badge>
                <Badge variant="outline">{scopeLabel(selectedInstalledSkill.scope)}</Badge>
              </div>
              <SkillActivationControl
                skill={selectedInstalledSkill}
                pending={busyOperations.has(permissionBusyKey(selectedInstalledSkill.name))}
                onToggle={(checked) =>
                  updateSkillPermission(selectedInstalledSkill, checked ? "allow" : "deny")
                }
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
