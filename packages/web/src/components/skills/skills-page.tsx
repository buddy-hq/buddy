import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Badge,
  BookOpenIcon,
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

function statusLabel(action: InstalledSkillInfo["permissionAction"]) {
  if (action === "allow") return "Always available"
  if (action === "deny") return "Blocked"
  return "On-demand approval"
}

function sourceLabel(source: InstalledSkillInfo["source"]) {
  if (source === "custom") return "Custom"
  if (source === "library") return "Library"
  return "Detected"
}

function scopeLabel(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace" ? "Workspace" : "Global"
}

function scopeDescription(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace"
    ? "This skill is discovered from the current workspace."
    : "This skill is discovered from your global skills directory."
}

function permissionUpdateMessage(name: string, action: InstalledSkillInfo["permissionAction"]) {
  return `Set ${name} to ${statusLabel(action).toLowerCase()}.`
}

function permissionRuleMessage(name: string, action: SkillRuleAction) {
  if (action === "inherit") {
    return `Reset ${name} to the inherited/default rule.`
  }

  return permissionUpdateMessage(name, action)
}

function permissionSourceLabel(source: InstalledSkillInfo["permissionSource"]) {
  if (source === "explicit") return "Explicit"
  if (source === "inherited") return "Inherited"
  return "Default"
}

function permissionSourceDescription(skill: InstalledSkillInfo) {
  if (skill.permissionSource === "explicit") {
    return "This skill name has its own explicit permission rule."
  }

  if (skill.permissionSource === "inherited") {
    return "This skill name is matching a broader wildcard permission rule."
  }

  return "No matching name rule is set. Core behavior falls back to on-demand approval."
}

function resetPermissionLabel() {
  return "Use inherited/default rule"
}

async function copyText(text: string) {
  if (!text) return false
  if (!("clipboard" in navigator)) return false
  await navigator.clipboard.writeText(text)
  return true
}

function SectionHeader(props: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{props.title}</h2>
        <p className="text-sm text-muted-foreground">{props.description}</p>
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
          Permissions
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
          Always available
        </DropdownMenuItem>
        <DropdownMenuItem disabled={props.disabled} onSelect={() => props.onSelect("ask")}>
          On-demand approval
        </DropdownMenuItem>
        <DropdownMenuItem disabled={props.disabled} onSelect={() => props.onSelect("deny")}>
          Blocked
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
    <Card className="h-full border-border/60 bg-card/70">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate pr-2 text-base font-semibold text-foreground">{props.skill.name}</p>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Enabled</span>
                  <Switch
                    checked={props.skill.permissionAction !== "deny"}
                    onCheckedChange={props.onToggleEnabled}
                    disabled={props.disabled}
                    aria-label={`Toggle ${props.skill.name}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground"
                  onClick={props.onManage}
                  disabled={props.disabled}
                  aria-label={`Manage ${props.skill.name}`}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "h-5",
                  props.skill.permissionAction === "allow"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : props.skill.permissionAction === "ask"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                )}
              >
                {statusLabel(props.skill.permissionAction)}
              </Badge>
              <Badge variant="outline" className="h-5">
                {scopeLabel(props.skill.scope)}
              </Badge>
              <Badge variant="outline" className="h-5">
                {sourceLabel(props.skill.source)}
              </Badge>
            </div>

            <p className="min-h-[4.5rem] line-clamp-3 text-sm leading-6 text-muted-foreground">
              {props.skill.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LibraryCard(props: { skill: SkillLibraryEntry; disabled?: boolean; onInstall: () => void }) {
  return (
    <Card className="border-border/60 bg-card/60">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">{props.skill.name}</p>
          </div>
          <p className="text-sm text-muted-foreground">{props.skill.description}</p>
          <p className="text-xs text-muted-foreground/80">{props.skill.summary}</p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <Badge variant="outline" className="h-5">
            Placeholder
          </Badge>
          <Button
            type="button"
            variant={props.skill.installed ? "outline" : "default"}
            size="sm"
            disabled={props.disabled || props.skill.installed}
            onClick={props.onInstall}
          >
            {props.skill.installed ? "Installed" : "Add"}
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
        installed: current.installed.map((skill) => (skill.name === nextSkill.name ? nextSkill : skill)),
      }
    })
  }

  async function refreshCatalog(input?: { preserveSelection?: boolean; force?: boolean }) {
    if (!catalog) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const nextCatalog = await loadSkillsCatalog(currentDirectory, {
        refresh: input?.force,
      })
      setCatalog(nextCatalog)

      if (input?.force) {
        toast.success("Skills refreshed")
      }

      if (input?.preserveSelection && selectedSkillName) {
        const stillPresent = nextCatalog.installed.some((skill) => skill.name === selectedSkillName)
        if (!stillPresent) {
          setSelectedSkillName(undefined)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load skills"
      toast.error(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void refreshCatalog()
  }, [currentDirectory])

  async function runMutation<T>(key: string, work: () => Promise<T>, successMessage: string, preserveSelection = true) {
    setBusyKey(key)

    try {
      await work()
      toast.success(successMessage)
      await refreshCatalog({ preserveSelection })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed"
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

    if (action !== "inherit" && skill.permissionSource === "explicit" && skill.permissionAction === action) {
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
        const message = error instanceof Error ? error.message : "Request failed"
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
      "Created new skill.",
      false,
    )

    if (created) {
      setNewSkillOpen(false)
      setForm(EMPTY_FORM)
    }
  }

  const createDisabled =
    busyKey === "create-skill" || !form.name.trim() || !form.description.trim() || !form.content.trim()

  return (
    <>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6 bg-muted/20 px-2.5">
                <BookOpenIcon className="size-3.5" />
                Skills
              </Badge>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Manage skills</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Manage which skills are available when chatting with Buddy. Installed skills are discovered from your
                workspace and global skill directories. The library shows available skills you can enable. Set skills to
                always available, ask before using, or blocked. Workspace skills are discovered per notebook.
              </p>
              {catalog?.directory ? (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Workspace
                  </span>
                  <span className="truncate font-mono text-[11px] text-foreground/85">{catalog.directory}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="min-w-28"
              onClick={() => void refreshCatalog({ preserveSelection: true, force: true })}
            >
              Refresh
            </Button>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search skills"
              className="w-full sm:w-64"
            />
            <Button type="button" onClick={() => setNewSkillOpen(true)}>
              <SparklesIcon className="size-4" />
              New skill
            </Button>
          </div>
        </header>

        <div className="space-y-6" aria-busy={refreshing || loading}>
          {loading ? <p className="text-sm text-muted-foreground">Loading skills...</p> : null}
          <section className="space-y-4">
            <SectionHeader
              title="Installed"
              description="Set allow, ask, or block rules for each skill name, inspect details, and remove Buddy-managed skills."
            />

            {loading ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Card key={index} className="h-full border-border/60 bg-card/50">
                    <CardContent className="flex h-full flex-col gap-4 p-5">
                      <div className="h-5 w-2/5 rounded-md bg-muted/60" />
                      <div className="flex gap-2">
                        <div className="h-5 w-28 rounded-full bg-muted/50" />
                        <div className="h-5 w-20 rounded-full bg-muted/40" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-full rounded-md bg-muted/40" />
                        <div className="h-4 w-full rounded-md bg-muted/40" />
                        <div className="h-4 w-4/5 rounded-md bg-muted/40" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredInstalled.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredInstalled.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    disabled={busyKey === `permission:${skill.name}`}
                    onToggleEnabled={(enabled) => toggleSkillEnabled(skill, enabled)}
                    onManage={() => setSelectedSkillName(skill.name)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border/60 bg-card/30">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No installed skills matched your search. Add a placeholder skill below or create a new custom one.
                </CardContent>
              </Card>
            )}
          </section>

          <Separator />

          <section className="space-y-4 pb-4">
            <SectionHeader
              title="Library"
              description="Placeholder entries only for now. The fetch source can be swapped later without changing this screen."
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
                        `Added ${skill.name}.`,
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed border-border/60 bg-card/30">
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No library skills matched your search.
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
                    <DialogDescription className="text-left text-sm">{selectedSkill.description}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{sourceLabel(selectedSkill.source)}</Badge>
                <Badge variant="outline">{scopeLabel(selectedSkill.scope)}</Badge>
                <Badge variant="outline">{permissionSourceLabel(selectedSkill.permissionSource)}</Badge>
                <Badge variant="outline">{statusLabel(selectedSkill.permissionAction)}</Badge>
                {selectedSkill.libraryID ? (
                  <Badge variant="outline">Library ID: {selectedSkill.libraryID}</Badge>
                ) : null}
              </div>

              <div className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Permission</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{scopeDescription(selectedSkill.scope)}</p>
                    <p className="text-sm text-muted-foreground">{permissionSourceDescription(selectedSkill)}</p>
                  </div>
                  <PermissionActionMenu
                    source={selectedSkill.permissionSource}
                    disabled={busyKey === `permission:${selectedSkill.name}`}
                    onSelect={(action) => updateSkillPermission(selectedSkill, action)}
                  />
                </div>
              </div>

              {selectedSkill.examplePrompt ? (
                <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Example prompt
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void copyText(selectedSkill.examplePrompt!).then((copied) => {
                          if (copied) {
                            toast.success(`Copied prompt for ${selectedSkill.name}.`)
                          }
                        })
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground/90">{selectedSkill.examplePrompt}</p>
                </div>
              ) : null}

              <div className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Skill content
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void copyText(selectedSkill.content).then((copied) => {
                        if (copied) {
                          toast.success(`Copied skill content for ${selectedSkill.name}.`)
                        }
                      })
                    }
                  >
                    Copy
                  </Button>
                </div>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-sm text-foreground/90">
                  {selectedSkill.content}
                </pre>
              </div>

              <div className="space-y-2 rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Folder</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      void copyText(selectedSkill.directory).then((copied) => {
                        if (copied) {
                          toast.success(`Copied folder for ${selectedSkill.name}.`)
                        }
                      })
                    }
                  >
                    Copy path
                  </Button>
                </div>
                <p className="break-all text-sm text-foreground/90">{selectedSkill.directory}</p>
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
                            `Removed ${selectedSkill.name}.`,
                          )

                          if (removed) {
                            setSelectedSkillName(undefined)
                          }
                        })()
                      }
                    >
                      Remove
                    </Button>
                  ) : null}

                  <PermissionActionMenu
                    source={selectedSkill.permissionSource}
                    disabled={busyKey === `permission:${selectedSkill.name}`}
                    onSelect={(action) => updateSkillPermission(selectedSkill, action)}
                  />
                </div>

                <Button type="button" variant="ghost" onClick={() => setSelectedSkillName(undefined)}>
                  <XIcon className="size-4" />
                  Close
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
            <DialogTitle>Create skill</DialogTitle>
            <DialogDescription>
              Save a new Buddy-managed skill and wire it into the local skill path automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Name</p>
                <Input
                  value={form.name}
                  onChange={(event) => updateForm({ name: event.target.value })}
                  placeholder="release-check"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Description</p>
                <Input
                  value={form.description}
                  onChange={(event) => updateForm({ description: event.target.value })}
                  placeholder="What this skill does"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Example prompt</p>
              <Textarea
                value={form.examplePrompt}
                onChange={(event) => updateForm({ examplePrompt: event.target.value })}
                rows={3}
                placeholder="Optional. Give the user a strong starting prompt."
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Instructions</p>
              <Textarea
                value={form.content}
                onChange={(event) => updateForm({ content: event.target.value })}
                rows={10}
                placeholder="Write the actual skill instructions here."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSkillOpen(false)}>
              Cancel
            </Button>
            <Button disabled={createDisabled} onClick={() => void submitNewSkill()}>
              {busyKey === "create-skill" ? "Creating..." : "Create skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
