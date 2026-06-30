import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Textarea,
  toast,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@buddy/ui"
import { RefreshCwIcon, BadgeCheckIcon, Loader2Icon } from "lucide-react"
import { language } from "@/context/language"
import {
  createCustomSkill,
  installLibrarySkill,
  loadSkillsCatalog,
  removeLibrarySkill,
  setSkillPermissionAction,
  type CreateCustomSkillInput,
  type InstalledSkillInfo,
  type SkillLibraryEntry,
  type SkillRuleAction,
  type SkillsCatalog,
} from "@/state/skills-actions"
import { skillsCatalogQueryOptions } from "@/state/skills-catalog-query"
import {
  isInstalledLibrarySkill,
  skillLibraryAction,
  skillLibraryButtonVariant,
  type SkillLibraryAction,
} from "./skill-library-actions"
import { matchesInstalledSkillSearch } from "./skill-presentation"

type SkillsFormState = {
  name: string
  description: string
  examplePrompt: string
  content: string
}
type BusyOperation = "create" | "install" | "permission" | "remove" | "update"

const EMPTY_FORM: SkillsFormState = {
  name: "",
  description: "",
  examplePrompt: "",
  content: "",
}

const SKELETON_CARD_KEYS = [
  "skill-skeleton-1",
  "skill-skeleton-2",
  "skill-skeleton-3",
  "skill-skeleton-4",
] as const
const CREATE_SKILL_BUSY_KEY = "create-skill"

function installLibraryBusyKey(skillID: string) {
  return `install:${skillID}`
}

function removeLibraryBusyKey(skillID: string) {
  return `remove-library:${skillID}`
}

function permissionBusyKey(skillName: string) {
  return `permission:${skillName}`
}

function installOrUpdateBusyOperation(
  skill: SkillLibraryEntry,
): Extract<BusyOperation, "install" | "update"> {
  return skill.state === "update_available" ? "update" : "install"
}

function statusLabel(action: InstalledSkillInfo["permissionAction"]) {
  return action === "allow" ? language.t("skills.status.allow") : language.t("skills.status.deny")
}

function sourceLabel(source: InstalledSkillInfo["source"]) {
  if (source === "custom") return language.t("skills.source.custom")
  if (source === "library") return "Curated"
  if (source === "system") return language.t("skills.source.system")
  return language.t("skills.source.detected")
}

function scopeLabel(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace"
    ? language.t("skills.scope.workspace")
    : language.t("skills.scope.global")
}

function permissionUpdateMessage(
  displayName: string,
  action: InstalledSkillInfo["permissionAction"],
) {
  return language.t("skills.permissionUpdated", {
    name: displayName,
    statusLabel: statusLabel(action).toLowerCase(),
  })
}

function permissionRuleMessage(displayName: string, action: SkillRuleAction) {
  return permissionUpdateMessage(displayName, action)
}

function skillLibraryActionLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.install")
  if (action === "update") return language.t("skills.update")
  if (action === "remove") return language.t("skills.detail.remove")
  return language.t("skills.installed")
}

function skillLibraryBusyLabel(action: SkillLibraryAction): string {
  if (action === "install") return language.t("skills.installing")
  if (action === "update") return language.t("skills.updating")
  if (action === "remove") return language.t("skills.removing")
  return language.t("skills.installed")
}

function skillLibraryMutationMessage(skill: SkillLibraryEntry): string {
  return skill.state === "update_available"
    ? language.t("skills.librarySection.updatedSkill", { name: skill.displayName })
    : language.t("skills.librarySection.addedSkill", { name: skill.displayName })
}

function libraryBusyAction(
  skillID: string,
  busyOperations: ReadonlyMap<string, BusyOperation>,
): SkillLibraryAction | undefined {
  const removeOperation = busyOperations.get(removeLibraryBusyKey(skillID))
  if (removeOperation === "remove") return "remove"

  const installOperation = busyOperations.get(installLibraryBusyKey(skillID))
  if (installOperation === "install" || installOperation === "update") {
    return installOperation
  }

  return undefined
}

function isLibrarySkillBusy(skillID: string, busyOperations: ReadonlyMap<string, BusyOperation>) {
  return (
    busyOperations.has(installLibraryBusyKey(skillID)) ||
    busyOperations.has(removeLibraryBusyKey(skillID))
  )
}

function SkillCard(props: { skill: InstalledSkillInfo; onManage: () => void }) {
  const isActive = props.skill.permissionAction !== "deny"
  return (
    <Card
      onClick={props.onManage}
      className="group/card cursor-pointer border-border-base/60 bg-surface-raised-base/60 transition-colors hover:border-border-base active:scale-[0.985]"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-3 pb-0">
        <CardTitle className="text-sm font-semibold text-text-base leading-snug">
          {props.skill.displayName}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isActive && <BadgeCheckIcon className="size-4 text-surface-success-base" />}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-1.5">
        <p className="line-clamp-2 text-sm text-text-weak leading-relaxed">
          {props.skill.shortDescription}
        </p>
      </CardContent>
    </Card>
  )
}

function LibraryActionButton(props: {
  skill: SkillLibraryEntry
  disabled?: boolean
  busyAction?: SkillLibraryAction
  compact?: boolean
  onInstall: () => void
  onRemove: () => void
}) {
  const action = skillLibraryAction(props.skill.state)
  const displayAction = props.busyAction ?? action
  const variant = skillLibraryButtonVariant(displayAction)
  const busy = props.busyAction !== undefined

  return (
    <Button
      type="button"
      variant={variant}
      size={props.compact ? "sm" : "default"}
      className={props.compact ? "h-8 min-w-28 text-xs" : "h-10 min-w-[132px]"}
      disabled={props.disabled || busy || action === "installed"}
      onClick={(event) => {
        event.stopPropagation()
        if (action === "remove") {
          props.onRemove()
          return
        }
        props.onInstall()
      }}
    >
      {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : null}
      {busy ? skillLibraryBusyLabel(displayAction) : skillLibraryActionLabel(displayAction)}
    </Button>
  )
}

function LibraryCard(props: {
  skill: SkillLibraryEntry
  busyOperations: ReadonlyMap<string, BusyOperation>
  onInstall: () => void
  onRemove: () => void
  onManage: () => void
}) {
  const busyAction = libraryBusyAction(props.skill.id, props.busyOperations)
  const disabled = isLibrarySkillBusy(props.skill.id, props.busyOperations)

  return (
    <Card
      onClick={props.onManage}
      className="flex flex-col border-border-base/60 bg-surface-raised-base/60 transition-colors hover:border-border-base cursor-pointer group/card active:scale-[0.985]"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-3 pb-0">
        <div className="flex items-center gap-2 min-w-0">
          <CardTitle className="text-sm font-semibold text-text-base leading-snug truncate">
            {props.skill.displayName}
          </CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0" />
      </CardHeader>
      <CardContent className="flex-1 p-3 pt-1.5">
        <p className="line-clamp-2 text-sm text-text-weak leading-relaxed">{props.skill.summary}</p>
      </CardContent>
      <div className="p-3 pt-0 flex justify-end">
        <LibraryActionButton
          skill={props.skill}
          compact
          busyAction={busyAction}
          disabled={disabled}
          onInstall={props.onInstall}
          onRemove={props.onRemove}
        />
      </div>
    </Card>
  )
}

export function SkillsPage(props: { directory?: string }) {
  const queryClient = useQueryClient()
  const currentDirectory = props.directory
  const catalogQuery = useQuery(skillsCatalogQueryOptions(currentDirectory))
  const catalog = catalogQuery.data
  const loading = !catalog && (catalogQuery.isPending || catalogQuery.isFetching)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedSkillName, setSelectedSkillName] = useState<string | undefined>(undefined)
  const [selectedLibrarySkillID, setSelectedLibrarySkillID] = useState<string | undefined>(
    undefined,
  )
  const [newSkillOpen, setNewSkillOpen] = useState(false)
  const [form, setForm] = useState<SkillsFormState>(EMPTY_FORM)
  const [busyOperations, setBusyOperations] = useState<ReadonlyMap<string, BusyOperation>>(
    () => new Map(),
  )
  const lastLibrarySyncError = useRef<string | undefined>(undefined)

  const selectedSkill = useMemo(
    () => catalog?.installed.find((skill) => skill.name === selectedSkillName),
    [catalog?.installed, selectedSkillName],
  )

  const selectedLibrarySkill = useMemo(
    () => catalog?.library.find((skill) => skill.id === selectedLibrarySkillID),
    [catalog?.library, selectedLibrarySkillID],
  )

  const selectedLibraryInstalledSkill = useMemo(
    () =>
      selectedLibrarySkill
        ? catalog?.installed.find((skill) => skill.libraryID === selectedLibrarySkill.id)
        : undefined,
    [catalog?.installed, selectedLibrarySkill],
  )

  const filteredCustom = useMemo(() => {
    const list = (catalog?.installed ?? []).filter(
      (skill) => skill.source === "custom" || skill.source === "external",
    )

    return list.filter((skill) =>
      matchesInstalledSkillSearch(skill, search, [
        skill.source,
        skill.scope,
        statusLabel(skill.permissionAction),
      ]),
    )
  }, [catalog?.installed, search])

  const filteredDefault = useMemo(() => {
    const list = (catalog?.installed ?? []).filter((skill) => skill.source === "system")

    return list.filter((skill) =>
      matchesInstalledSkillSearch(skill, search, [
        skill.scope,
        statusLabel(skill.permissionAction),
      ]),
    )
  }, [catalog?.installed, search])

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase()
    let list = catalog?.library ?? []

    if (query) {
      list = list.filter((skill) => {
        return (
          skill.displayName.toLowerCase().includes(query) ||
          skill.summary.toLowerCase().includes(query) ||
          skill.sourceLabel.toLowerCase().includes(query)
        )
      })
    }

    return list.toSorted((a, b) => {
      const aInstalled = isInstalledLibrarySkill(a.state) || a.state === "withdrawn_installed"
      const bInstalled = isInstalledLibrarySkill(b.state) || b.state === "withdrawn_installed"
      if (aInstalled && !bInstalled) return -1
      if (!aInstalled && bInstalled) return 1
      return 0
    })
  }, [catalog?.library, search])

  function replaceInstalledSkill(nextSkill: InstalledSkillInfo) {
    queryClient.setQueryData<SkillsCatalog>(
      skillsCatalogQueryOptions(currentDirectory).queryKey,
      (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          installed: current.installed.map((skill) =>
            skill.name === nextSkill.name ? nextSkill : skill,
          ),
        }
      },
    )
  }

  const refreshCatalog = useCallback(
    async (input?: {
      preserveSelection?: boolean
      force?: boolean
      showRefreshToast?: boolean
    }) => {
      setRefreshing(true)

      try {
        const nextCatalog = input?.force
          ? await loadSkillsCatalog(currentDirectory, { refresh: true })
          : await queryClient.fetchQuery(skillsCatalogQueryOptions(currentDirectory))
        queryClient.setQueryData<SkillsCatalog>(
          skillsCatalogQueryOptions(currentDirectory).queryKey,
          nextCatalog,
        )

        if (input?.force && input.showRefreshToast !== false) {
          toast.success(language.t("skills.refreshed"))
        }

        if (
          nextCatalog.librarySyncError &&
          nextCatalog.librarySyncError !== lastLibrarySyncError.current
        ) {
          lastLibrarySyncError.current = nextCatalog.librarySyncError
          toast.error(
            language.t("skills.curatedSyncFailed", { error: nextCatalog.librarySyncError }),
          )
        } else if (!nextCatalog.librarySyncError) {
          lastLibrarySyncError.current = undefined
        }

        if (input?.preserveSelection) {
          setSelectedSkillName((current) => {
            if (!current) return current
            const stillPresent = nextCatalog.installed.some((skill) => skill.name === current)
            return stillPresent ? current : undefined
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : language.t("skills.loadFailed")
        toast.error(message)
      } finally {
        setRefreshing(false)
      }
    },
    [currentDirectory, queryClient],
  )

  useEffect(() => {
    if (!catalogQuery.error) return
    const message =
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : language.t("skills.loadFailed")
    toast.error(message)
  }, [catalogQuery.error])

  useEffect(() => {
    const librarySyncError = catalog?.librarySyncError
    if (librarySyncError && librarySyncError !== lastLibrarySyncError.current) {
      lastLibrarySyncError.current = librarySyncError
      toast.error(language.t("skills.curatedSyncFailed", { error: librarySyncError }))
      return
    }

    if (!librarySyncError) {
      lastLibrarySyncError.current = undefined
    }
  }, [catalog?.librarySyncError])

  async function runMutation<T>(
    key: string,
    operation: BusyOperation,
    work: () => Promise<T>,
    successMessage: string,
    preserveSelection = true,
  ) {
    setBusyOperations((current) => {
      const next = new Map(current)
      next.set(key, operation)
      return next
    })

    try {
      await work()
      toast.success(successMessage)
      await refreshCatalog({ preserveSelection })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : language.t("skills.requestFailed")
      toast.error(message)
      return false
    } finally {
      setBusyOperations((current) => {
        const next = new Map(current)
        next.delete(key)
        return next
      })
    }
  }

  function updateForm(patch: Partial<SkillsFormState>) {
    setForm((current) => ({
      ...current,
      ...patch,
    }))
  }

  function updateSkillPermission(skill: InstalledSkillInfo, action: SkillRuleAction) {
    if (skill.permissionAction === action) {
      return
    }

    void (async () => {
      const key = permissionBusyKey(skill.name)
      setBusyOperations((current) => {
        const next = new Map(current)
        next.set(key, "permission")
        return next
      })

      try {
        const response = await setSkillPermissionAction(skill.name, action, currentDirectory)
        replaceInstalledSkill(response.skill)
        toast.success(permissionRuleMessage(skill.displayName, action))
      } catch (error) {
        const message = error instanceof Error ? error.message : language.t("skills.requestFailed")
        toast.error(message)
      } finally {
        setBusyOperations((current) => {
          const next = new Map(current)
          next.delete(key)
          return next
        })
      }
    })()
  }

  function toggleSkillEnabled(skill: InstalledSkillInfo, enabled: boolean) {
    const nextAction: SkillRuleAction = enabled ? "allow" : "deny"

    if (enabled && skill.permissionAction !== "deny") {
      return
    }

    if (!enabled && skill.permissionAction === "deny") {
      return
    }

    updateSkillPermission(skill, nextAction)
  }

  async function submitNewSkill() {
    const payload: CreateCustomSkillInput = {
      name: form.name,
      description: form.description,
      examplePrompt: form.examplePrompt.trim() || undefined,
      content: form.content,
    }

    const created = await runMutation(
      CREATE_SKILL_BUSY_KEY,
      "create",
      () => createCustomSkill(payload, currentDirectory),
      language.t("skills.createdNewSkill"),
      false,
    )

    if (created) {
      setNewSkillOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const createDisabled =
    busyOperations.has(CREATE_SKILL_BUSY_KEY) ||
    !form.name.trim() ||
    !form.description.trim() ||
    !form.content.trim()

  const activeToggleSkill = selectedSkill ?? selectedLibraryInstalledSkill
  const detailTitle = selectedSkill?.displayName ?? selectedLibrarySkill?.displayName ?? ""
  const detailDescription = selectedSkill?.shortDescription ?? selectedLibrarySkill?.summary ?? ""

  return (
    <>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-8 md:px-8">
        <Tabs defaultValue="library" className="flex flex-col flex-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-base/60 mb-6 gap-4">
            <TabsList variant="line" className="w-fit shrink-0">
              <TabsTrigger value="library" className="data-[state=active]:text-interactive-base">
                {language.t("skills.librarySection.title")}
              </TabsTrigger>
              <TabsTrigger value="default" className="data-[state=active]:text-interactive-base">
                {language.t("skills.defaultSection.title")}
              </TabsTrigger>
              {filteredCustom.length > 0 && (
                <TabsTrigger value="custom" className="data-[state=active]:text-interactive-base">
                  {language.t("skills.customSection.title")}
                </TabsTrigger>
              )}
            </TabsList>
            <div className="flex flex-1 items-center gap-2 pb-2">
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => void refreshCatalog({ preserveSelection: true, force: true })}
                aria-label={language.t("common.refresh")}
              >
                <RefreshCwIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={language.t("skills.searchPlaceholder")}
              className="w-full"
            />
          </div>

          <TabsContent
            value="library"
            className="flex-1 mt-0 focus-visible:outline-none"
            aria-busy={refreshing || loading}
          >
            {loading ? (
              <p className="text-sm text-text-weak">{language.t("skills.loadingSkills")}</p>
            ) : filteredLibrary.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredLibrary.map((skill) => (
                  <LibraryCard
                    key={skill.id}
                    skill={skill}
                    busyOperations={busyOperations}
                    onInstall={() =>
                      void runMutation(
                        installLibraryBusyKey(skill.id),
                        installOrUpdateBusyOperation(skill),
                        () => installLibrarySkill(skill.id, currentDirectory),
                        skillLibraryMutationMessage(skill),
                      )
                    }
                    onRemove={() =>
                      void runMutation(
                        removeLibraryBusyKey(skill.id),
                        "remove",
                        () => removeLibrarySkill(skill.id, currentDirectory),
                        language.t("skills.detail.removedSkill", { name: skill.displayName }),
                      )
                    }
                    onManage={() => setSelectedLibrarySkillID(skill.id)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border-base/60 bg-surface-raised-base/30">
                <CardContent className="p-6 text-sm text-text-weak">
                  {language.t("skills.librarySection.empty")}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent
            value="default"
            className="flex-1 mt-0 focus-visible:outline-none"
            aria-busy={refreshing || loading}
          >
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {SKELETON_CARD_KEYS.map((key) => (
                  <Card key={key} className="border-border-base/60 bg-surface-raised-base/50">
                    <CardContent className="flex flex-col gap-4 p-5">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="size-3.5 rounded-full bg-surface-weak/40" />
                          <div className="h-4 w-32 rounded-md bg-surface-weak/60" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-3 w-full rounded-md bg-surface-weak/30" />
                          <div className="h-3 w-3/4 rounded-md bg-surface-weak/30" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredDefault.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredDefault.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    onManage={() => setSelectedSkillName(skill.name)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border-base/60 bg-surface-raised-base/30">
                <CardContent className="p-6 text-sm text-text-weak">
                  {language.t("skills.defaultSection.empty")}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {filteredCustom.length > 0 && (
            <TabsContent
              value="custom"
              className="flex-1 mt-0 focus-visible:outline-none"
              aria-busy={refreshing || loading}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {filteredCustom.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    onManage={() => setSelectedSkillName(skill.name)}
                  />
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <Dialog
        open={!!selectedSkill || !!selectedLibrarySkillID}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSkillName(undefined)
            setSelectedLibrarySkillID(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-surface-raised-base max-h-[90vh] flex flex-col">
          {(selectedSkill || selectedLibrarySkill) && (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-8 border-b border-border-base/40 bg-surface-raised-base/10 shrink-0">
                <div className="space-y-4">
                  <DialogTitle className="text-2xl font-bold leading-tight text-text-base flex-1">
                    {detailTitle}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-text-weak leading-relaxed max-w-lg">
                    {detailDescription}
                  </DialogDescription>
                </div>

                {selectedSkill && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-4">
                    <Badge
                      variant="outline"
                      className="h-6 rounded-md border-border-base/60 bg-surface-base/50 text-text-weak text-xs px-2.5 py-0.5"
                    >
                      {sourceLabel(selectedSkill.source)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-6 rounded-md border-border-base/60 bg-surface-base/50 text-text-weak text-xs px-2.5 py-0.5"
                    >
                      {scopeLabel(selectedSkill.scope)}
                    </Badge>
                    {selectedSkill.libraryID ? (
                      <Badge
                        variant="outline"
                        className="h-6 rounded-md border-border-base/60 bg-surface-base/50 text-text-weak text-xs px-2.5 py-0.5"
                      >
                        {language.t("skills.detail.libraryIdPrefix")} {selectedSkill.libraryID}
                      </Badge>
                    ) : null}
                  </div>
                )}

                {activeToggleSkill && (
                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    <div className="flex items-center gap-3 px-3 bg-surface-base rounded-lg border border-border-base/60 shadow-sm h-8 scale-95 origin-left">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-text-weaker/80">
                        Active
                      </span>
                      <Switch
                        className="scale-90"
                        checked={activeToggleSkill.permissionAction !== "deny"}
                        onCheckedChange={(checked) =>
                          toggleSkillEnabled(activeToggleSkill, checked)
                        }
                        disabled={busyOperations.has(permissionBusyKey(activeToggleSkill.name))}
                        aria-label={language.t("skills.toggleAria", {
                          name: activeToggleSkill.displayName,
                        })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {selectedLibrarySkill && (
                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-track-surface">
                  <div className="px-6 py-8 space-y-6">
                    <div className="grid gap-6 pt-2">
                      <div className="grid grid-cols-[80px_1fr] items-baseline gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-weaker">
                          Source
                        </span>
                        <span className="text-sm text-text-weak">
                          {selectedLibrarySkill.sourceLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-[80px_1fr] items-baseline gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-weaker">
                          Category
                        </span>
                        <div className="flex flex-wrap gap-2 text-sm text-text-weak">
                          {selectedLibrarySkill.categories.join(", ")}
                        </div>
                      </div>

                      {selectedLibrarySkill.tags.length > 0 && (
                        <div className="grid grid-cols-[80px_1fr] items-baseline gap-4">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-text-weaker">
                            Tags
                          </span>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-weak italic">
                            {selectedLibrarySkill.tags.map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {selectedLibrarySkill && (
                <DialogFooter className="px-6 py-6 border-t border-border-base/40 shrink-0">
                  <div className="flex justify-end gap-3 w-full">
                    {isInstalledLibrarySkill(selectedLibrarySkill.state) && (
                      <Button
                        variant="destructive"
                        className="min-w-[120px] h-10"
                        disabled={isLibrarySkillBusy(selectedLibrarySkill.id, busyOperations)}
                        onClick={() => {
                          void runMutation(
                            removeLibraryBusyKey(selectedLibrarySkill.id),
                            "remove",
                            () => removeLibrarySkill(selectedLibrarySkill.id, currentDirectory),
                            language.t("skills.detail.removedSkill", {
                              name: selectedLibrarySkill.displayName,
                            }),
                          )
                          setSelectedLibrarySkillID(undefined)
                        }}
                      >
                        {busyOperations.has(removeLibraryBusyKey(selectedLibrarySkill.id)) ? (
                          <Loader2Icon className="size-4 animate-spin" aria-hidden />
                        ) : null}
                        {busyOperations.has(removeLibraryBusyKey(selectedLibrarySkill.id))
                          ? language.t("skills.removing")
                          : language.t("skills.detail.remove")}
                      </Button>
                    )}
                    <LibraryActionButton
                      skill={selectedLibrarySkill}
                      busyAction={libraryBusyAction(selectedLibrarySkill.id, busyOperations)}
                      disabled={isLibrarySkillBusy(selectedLibrarySkill.id, busyOperations)}
                      onInstall={() => {
                        void runMutation(
                          installLibraryBusyKey(selectedLibrarySkill.id),
                          installOrUpdateBusyOperation(selectedLibrarySkill),
                          () => installLibrarySkill(selectedLibrarySkill.id, currentDirectory),
                          skillLibraryMutationMessage(selectedLibrarySkill),
                        )
                        setSelectedLibrarySkillID(undefined)
                      }}
                      onRemove={() => {
                        void runMutation(
                          removeLibraryBusyKey(selectedLibrarySkill.id),
                          "remove",
                          () => removeLibrarySkill(selectedLibrarySkill.id, currentDirectory),
                          language.t("skills.detail.removedSkill", {
                            name: selectedLibrarySkill.displayName,
                          }),
                        )
                        setSelectedLibrarySkillID(undefined)
                      }}
                    />
                  </div>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={newSkillOpen}
        onOpenChange={(open) => {
          setNewSkillOpen(open)
          if (!open) {
            setForm(EMPTY_FORM)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{language.t("skills.createDialog.title")}</DialogTitle>
            <DialogDescription>{language.t("skills.createDialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-base">
                  {language.t("skills.createDialog.name")}
                </p>
                <Input
                  value={form.name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateForm({ name: event.target.value })
                  }
                  placeholder={language.t("skills.createDialog.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-base">
                  {language.t("skills.createDialog.descriptionLabel")}
                </p>
                <Input
                  value={form.description}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    updateForm({ description: event.target.value })
                  }
                  placeholder={language.t("skills.createDialog.descriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-base">
                {language.t("skills.createDialog.examplePrompt")}
              </p>
              <Textarea
                value={form.examplePrompt}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  updateForm({ examplePrompt: event.target.value })
                }
                rows={3}
                placeholder={language.t("skills.createDialog.examplePromptPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-base">
                {language.t("skills.createDialog.instructions")}
              </p>
              <Textarea
                value={form.content}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                  updateForm({ content: event.target.value })
                }
                rows={10}
                placeholder={language.t("skills.createDialog.instructionsPlaceholder")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSkillOpen(false)}>
              {language.t("common.cancel")}
            </Button>
            <Button disabled={createDisabled} onClick={() => void submitNewSkill()}>
              {busyOperations.has(CREATE_SKILL_BUSY_KEY)
                ? language.t("skills.createDialog.creating")
                : language.t("skills.createDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
