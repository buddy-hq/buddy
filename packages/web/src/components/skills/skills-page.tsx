import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Separator,
  SettingsIcon,
  SparklesIcon,
  Switch,
  Textarea,
  XIcon,
  cn,
  toast,
} from "@buddy/ui"
import { PlusIcon, RefreshCwIcon } from "lucide-react"
import { language } from "@/context/language"
import {
  createCustomSkill,
  installLibrarySkill,
  loadSkillsCatalog,
  removeSkill,
  setSkillPermissionAction,
  type CreateCustomSkillInput,
  type InstalledSkillInfo,
  type SkillLibraryEntry,
  type SkillRuleAction,
  type SkillsCatalog,
} from "@/state/skills-actions"

type SkillsFormState = {
  name: string
  description: string
  examplePrompt: string
  content: string
}

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

function statusLabel(action: InstalledSkillInfo["permissionAction"]) {
  if (action === "allow") return language.t("skills.status.allow")
  if (action === "deny") return language.t("skills.status.deny")
  return language.t("skills.status.ask")
}

function sourceLabel(source: InstalledSkillInfo["source"]) {
  if (source === "custom") return language.t("skills.source.custom")
  if (source === "library") return language.t("skills.source.library")
  return language.t("skills.source.detected")
}

function scopeLabel(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace"
    ? language.t("skills.scope.workspace")
    : language.t("skills.scope.global")
}

function scopeDescription(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace"
    ? language.t("skills.scope.workspaceDescription")
    : language.t("skills.scope.globalDescription")
}

function permissionUpdateMessage(name: string, action: InstalledSkillInfo["permissionAction"]) {
  return language.t("skills.permissionUpdated", {
    name: name,
    statusLabel: statusLabel(action).toLowerCase(),
  })
}

function permissionRuleMessage(name: string, action: SkillRuleAction) {
  if (action === "inherit") {
    return language.t("skills.permissionReset", { name: name })
  }

  return permissionUpdateMessage(name, action)
}

function permissionSourceLabel(source: InstalledSkillInfo["permissionSource"]) {
  if (source === "explicit") return language.t("skills.permissionSource.explicit")
  if (source === "inherited") return language.t("skills.permissionSource.inherited")
  return language.t("skills.permissionSource.default")
}

function permissionSourceDescription(skill: InstalledSkillInfo) {
  if (skill.permissionSource === "explicit") {
    return language.t("skills.permissionSource.explicitDescription")
  }

  if (skill.permissionSource === "inherited") {
    return language.t("skills.permissionSource.inheritedDescription")
  }

  return language.t("skills.permissionSource.defaultDescription")
}

function resetPermissionLabel() {
  return language.t("skills.resetPermissionLabel")
}

async function copyText(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

async function copyWithSuccessToast(text: string, message: string) {
  const copied = await copyText(text)
  if (copied) {
    toast.success(message)
  }
}

function SectionHeader(props: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-text-base">{props.title}</h2>
        <p className="text-sm text-text-weak">{props.description}</p>
      </div>
      {props.action}
    </div>
  )
}

function PermissionActionMenu(props: {
  source: InstalledSkillInfo["permissionSource"]
  disabled?: boolean
  onSelect: (action: SkillRuleAction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={props.disabled}>
          {language.t("skills.actionsMenu")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          disabled={props.disabled || props.source !== "explicit"}
          onSelect={() => props.onSelect("inherit")}
        >
          {resetPermissionLabel()}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={props.disabled} onSelect={() => props.onSelect("allow")}>
          {language.t("skills.status.allow")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={props.disabled} onSelect={() => props.onSelect("ask")}>
          {language.t("skills.status.ask")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={props.disabled} onSelect={() => props.onSelect("deny")}>
          {language.t("skills.status.deny")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SkillCard(props: {
  skill: InstalledSkillInfo
  disabled?: boolean
  onToggleEnabled: (enabled: boolean) => void
  onManage: () => void
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-text-base">{props.skill.name}</p>
            <Badge
              variant="outline"
              className={cn(
                "h-5",
                props.skill.permissionAction === "allow"
                  ? "border-border-success-base bg-surface-success-base/10 text-icon-success-base"
                  : props.skill.permissionAction === "ask"
                    ? "border-border-info-base bg-surface-info-base/10 text-icon-info-base"
                    : "border-border-critical-base bg-surface-critical-base/10 text-icon-critical-base",
              )}
            >
              {statusLabel(props.skill.permissionAction)}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-text-weak">{props.skill.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Switch
            checked={props.skill.permissionAction !== "deny"}
            onCheckedChange={props.onToggleEnabled}
            disabled={props.disabled}
            aria-label={language.t("skills.toggleAria", { name: props.skill.name })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-text-weak"
            onClick={props.onManage}
            disabled={props.disabled}
            aria-label={language.t("skills.manageAria", { name: props.skill.name })}
          >
            <SettingsIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function LibraryCard(props: {
  skill: SkillLibraryEntry
  disabled?: boolean
  onInstall: () => void
}) {
  return (
    <Card className="border-border-base/60 bg-surface-raised-base/60 transition-colors hover:border-border-base">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-icon-info-base" />
            <p className="text-sm font-semibold text-text-base">{props.skill.name}</p>
          </div>
          <p className="text-sm text-text-weak">{props.skill.description}</p>
          <p className="text-xs text-text-weak">{props.skill.summary}</p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <Badge
            variant="outline"
            className="h-5 border-border-info-base bg-surface-info-base/10 text-icon-info-base"
          >
            {language.t("skills.curated")}
          </Badge>
          <Button
            type="button"
            variant={props.skill.installed ? "outline" : "default"}
            size="sm"
            disabled={props.disabled || props.skill.installed}
            onClick={props.onInstall}
          >
            {props.skill.installed ? language.t("skills.installed") : language.t("skills.add")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function SkillsPage(props: { directory?: string }) {
  const currentDirectory = props.directory
  const [catalog, setCatalog] = useState<SkillsCatalog | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedSkillName, setSelectedSkillName] = useState<string | undefined>(undefined)
  const [newSkillOpen, setNewSkillOpen] = useState(false)
  const [form, setForm] = useState<SkillsFormState>(EMPTY_FORM)
  const [busyKey, setBusyKey] = useState<string | undefined>(undefined)
  const catalogRef = useRef<SkillsCatalog | undefined>(catalog)

  useEffect(() => {
    catalogRef.current = catalog
  }, [catalog])

  const selectedSkill = useMemo(
    () => catalog?.installed.find((skill) => skill.name === selectedSkillName),
    [catalog?.installed, selectedSkillName],
  )

  const filteredInstalled = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return catalog?.installed ?? []

    return (catalog?.installed ?? []).filter((skill) => {
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.source.toLowerCase().includes(query) ||
        skill.scope.toLowerCase().includes(query) ||
        statusLabel(skill.permissionAction).toLowerCase().includes(query)
      )
    })
  }, [catalog?.installed, search])

  const filteredLibrary = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return catalog?.library ?? []

    return (catalog?.library ?? []).filter((skill) => {
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.summary.toLowerCase().includes(query)
      )
    })
  }, [catalog?.library, search])

  function replaceInstalledSkill(nextSkill: InstalledSkillInfo) {
    setCatalog((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        installed: current.installed.map((skill) =>
          skill.name === nextSkill.name ? nextSkill : skill,
        ),
      }
    })
  }

  const refreshCatalog = useCallback(
    async (input?: {
      preserveSelection?: boolean
      force?: boolean
      showRefreshToast?: boolean
    }) => {
      if (!catalogRef.current) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const nextCatalog = await loadSkillsCatalog(currentDirectory, {
          refresh: input?.force,
        })
        setCatalog(nextCatalog)

        if (input?.force && input.showRefreshToast !== false) {
          toast.success(language.t("skills.refreshed"))
        }

        if (nextCatalog.librarySyncError) {
          toast.error(
            language.t("skills.curatedSyncFailed", { error: nextCatalog.librarySyncError }),
          )
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
        setLoading(false)
        setRefreshing(false)
      }
    },
    [currentDirectory],
  )

  useEffect(() => {
    void refreshCatalog()
  }, [refreshCatalog])

  async function runMutation<T>(
    key: string,
    work: () => Promise<T>,
    successMessage: string,
    preserveSelection = true,
  ) {
    setBusyKey(key)

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
      setBusyKey(undefined)
    }
  }

  function updateForm(patch: Partial<SkillsFormState>) {
    setForm((current) => ({
      ...current,
      ...patch,
    }))
  }

  function updateSkillPermission(skill: InstalledSkillInfo, action: SkillRuleAction) {
    if (action === "inherit" && skill.permissionSource !== "explicit") {
      return
    }

    if (
      action !== "inherit" &&
      skill.permissionSource === "explicit" &&
      skill.permissionAction === action
    ) {
      return
    }

    void (async () => {
      const key = `permission:${skill.name}`
      setBusyKey(key)

      try {
        const response = await setSkillPermissionAction(skill.name, action, currentDirectory)
        replaceInstalledSkill(response.skill)
        toast.success(permissionRuleMessage(skill.name, action))
      } catch (error) {
        const message = error instanceof Error ? error.message : language.t("skills.requestFailed")
        toast.error(message)
      } finally {
        setBusyKey(undefined)
      }
    })()
  }

  function toggleSkillEnabled(skill: InstalledSkillInfo, enabled: boolean) {
    const nextAction: SkillRuleAction = enabled ? "ask" : "deny"

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
      "create-skill",
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
    busyKey === "create-skill" ||
    !form.name.trim() ||
    !form.description.trim() ||
    !form.content.trim()

  return (
    <>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={language.t("skills.searchPlaceholder")}
              className="min-w-0 flex-1"
            />
            <Button type="button" className="shrink-0" onClick={() => setNewSkillOpen(true)}>
              <PlusIcon className="size-4" />
              {language.t("skills.newSkill")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              onClick={() => void refreshCatalog({ preserveSelection: true, force: true })}
            >
              <RefreshCwIcon className="size-4" />
              {language.t("common.refresh")}
            </Button>
          </div>
        </header>

        <div className="space-y-6" aria-busy={refreshing || loading}>
          {loading ? (
            <p className="text-sm text-text-weak">{language.t("skills.loadingSkills")}</p>
          ) : null}
          <section className="space-y-4">
            <SectionHeader
              title={language.t("skills.installedSection.title")}
              description={language.t("skills.installedSection.description")}
            />

            {loading ? (
              <Card className="border-border-base/60 bg-surface-raised-base/50">
                <CardContent className="px-0">
                  {SKELETON_CARD_KEYS.map((key, index) => (
                    <div key={key}>
                      <div className="px-4 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-40 rounded-md bg-surface-weak/60" />
                            <div className="h-3 w-full max-w-xl rounded-md bg-surface-weak/40" />
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-12 rounded-full bg-surface-weak/40" />
                            <div className="h-8 w-8 rounded-full bg-surface-weak/40" />
                          </div>
                        </div>
                      </div>
                      {index === SKELETON_CARD_KEYS.length - 1 ? null : <Separator />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : filteredInstalled.length > 0 ? (
              <Card className="border-border-base/60 bg-surface-raised-base/70">
                <CardContent className="px-0">
                  {filteredInstalled.map((skill, index) => (
                    <div key={skill.name}>
                      <SkillCard
                        skill={skill}
                        disabled={busyKey === `permission:${skill.name}`}
                        onToggleEnabled={(enabled) => toggleSkillEnabled(skill, enabled)}
                        onManage={() => setSelectedSkillName(skill.name)}
                      />
                      {index === filteredInstalled.length - 1 ? null : <Separator />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-border-base/60 bg-surface-raised-base/30">
                <CardContent className="p-6 text-sm text-text-weak">
                  {language.t("skills.installedSection.empty")}
                </CardContent>
              </Card>
            )}
          </section>

          <Separator />

          <section className="space-y-4 pb-4">
            <SectionHeader
              title={language.t("skills.librarySection.title")}
              description={language.t("skills.librarySection.description")}
            />

            {filteredLibrary.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {filteredLibrary.map((skill) => (
                  <LibraryCard
                    key={skill.id}
                    skill={skill}
                    disabled={busyKey === `install:${skill.id}`}
                    onInstall={() =>
                      void runMutation(
                        `install:${skill.id}`,
                        () => installLibrarySkill(skill.id, currentDirectory),
                        language.t("skills.librarySection.addedSkill", { name: skill.name }),
                      )
                    }
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
          </section>
        </div>
      </div>

      <Dialog
        open={!!selectedSkill}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSkillName(undefined)
          }
        }}
      >
        <DialogContent className="max-h-[min(90vh,900px)] overflow-y-auto sm:max-w-4xl">
          {selectedSkill ? (
            <div className="flex min-h-0 flex-col gap-5">
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <DialogTitle className="text-left text-2xl">{selectedSkill.name}</DialogTitle>
                    <DialogDescription className="text-left text-sm">
                      {selectedSkill.description}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{sourceLabel(selectedSkill.source)}</Badge>
                <Badge variant="outline">{scopeLabel(selectedSkill.scope)}</Badge>
                <Badge variant="outline">
                  {permissionSourceLabel(selectedSkill.permissionSource)}
                </Badge>
                <Badge variant="outline">{statusLabel(selectedSkill.permissionAction)}</Badge>
                {selectedSkill.libraryID ? (
                  <Badge variant="outline">
                    {language.t("skills.detail.libraryIdPrefix")} {selectedSkill.libraryID}
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2 rounded-2xl border border-border-base/60 bg-surface-raised-base/60 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weak">
                  {language.t("skills.detail.permission")}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-text-weak">
                      {scopeDescription(selectedSkill.scope)}
                    </p>
                    <p className="text-sm text-text-weak">
                      {permissionSourceDescription(selectedSkill)}
                    </p>
                  </div>
                  <PermissionActionMenu
                    source={selectedSkill.permissionSource}
                    disabled={busyKey === `permission:${selectedSkill.name}`}
                    onSelect={(action) => updateSkillPermission(selectedSkill, action)}
                  />
                </div>
              </div>

              {selectedSkill.examplePrompt ? (
                <div className="space-y-2 rounded-2xl border border-border-base/60 bg-surface-weak/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weak">
                      {language.t("skills.detail.examplePrompt")}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void copyWithSuccessToast(
                          selectedSkill.examplePrompt!,
                          language.t("skills.detail.copiedPrompt", { name: selectedSkill.name }),
                        )
                      }
                    >
                      {language.t("skills.detail.copy")}
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-text-base">
                    {selectedSkill.examplePrompt}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2 rounded-2xl border border-border-base/60 bg-surface-raised-base/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weak">
                    {language.t("skills.detail.skillContent")}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void copyWithSuccessToast(
                        selectedSkill.content,
                        language.t("skills.detail.copiedSkillContent", {
                          name: selectedSkill.name,
                        }),
                      )
                    }
                  >
                    {language.t("skills.detail.copy")}
                  </Button>
                </div>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-weak/30 p-3 text-sm text-text-base">
                  {selectedSkill.content}
                </pre>
              </div>

              <div className="space-y-2 rounded-2xl border border-border-base/60 bg-surface-raised-base/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-weak">
                    {language.t("skills.detail.folder")}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void copyWithSuccessToast(
                        selectedSkill.directory,
                        language.t("skills.detail.copiedFolder", { name: selectedSkill.name }),
                      )
                    }
                  >
                    {language.t("skills.detail.copyPath")}
                  </Button>
                </div>
                <p className="break-all text-sm text-text-base">{selectedSkill.directory}</p>
              </div>

              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedSkill.removable ? (
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busyKey === `remove:${selectedSkill.name}`}
                      onClick={() =>
                        void (async () => {
                          const removed = await runMutation(
                            `remove:${selectedSkill.name}`,
                            () => removeSkill(selectedSkill.name, currentDirectory),
                            language.t("skills.detail.removedSkill", { name: selectedSkill.name }),
                          )

                          if (removed) {
                            setSelectedSkillName(undefined)
                          }
                        })()
                      }
                    >
                      {language.t("skills.detail.remove")}
                    </Button>
                  ) : null}

                  <PermissionActionMenu
                    source={selectedSkill.permissionSource}
                    disabled={busyKey === `permission:${selectedSkill.name}`}
                    onSelect={(action) => updateSkillPermission(selectedSkill, action)}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedSkillName(undefined)}
                >
                  <XIcon className="size-4" />
                  {language.t("skills.detail.close")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
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
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder={language.t("skills.createDialog.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-base">
                  {language.t("skills.createDialog.descriptionLabel")}
                </p>
                <Input
                  value={form.description}
                  onChange={(event) => updateForm({ description: event.target.value })}
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
                onChange={(event) => updateForm({ examplePrompt: event.target.value })}
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
                onChange={(event) => updateForm({ content: event.target.value })}
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
              {busyKey === "create-skill"
                ? language.t("skills.createDialog.creating")
                : language.t("skills.createDialog.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
