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
  ToggleGroup,
  ToggleGroupItem,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@buddy/ui"
import { Markdown } from "@/components/markdown/Markdown"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table"
import {
  RefreshCwIcon,
  LayoutGridIcon,
  ListIcon,
  CopyIcon,
  FolderSearchIcon,
  BadgeCheckIcon,
  Loader2Icon,
} from "lucide-react"
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
import { usePlatform } from "@/context/platform"
import {
  isInstalledLibrarySkill,
  skillLibraryAction,
  skillLibraryButtonVariant,
  type SkillLibraryAction,
} from "./skill-library-actions"

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
  return language.t("skills.source.detected")
}

function scopeLabel(scope: InstalledSkillInfo["scope"]) {
  return scope === "workspace"
    ? language.t("skills.scope.workspace")
    : language.t("skills.scope.global")
}

function permissionUpdateMessage(name: string, action: InstalledSkillInfo["permissionAction"]) {
  return language.t("skills.permissionUpdated", {
    name: name,
    statusLabel: statusLabel(action).toLowerCase(),
  })
}

function permissionRuleMessage(name: string, action: SkillRuleAction) {
  return permissionUpdateMessage(name, action)
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

function SkillCard(props: { skill: InstalledSkillInfo; onManage: () => void }) {
  const isActive = props.skill.permissionAction !== "deny"
  return (
    <Card
      onClick={props.onManage}
      className="group/card cursor-pointer border-border-base/60 bg-surface-raised-base/60 transition-colors hover:border-border-base active:scale-[0.985]"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-3 pb-0">
        <CardTitle className="text-sm font-semibold text-text-base leading-snug">
          {props.skill.name}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {isActive && <BadgeCheckIcon className="size-4 text-surface-success-base" />}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-1.5">
        <p className="line-clamp-2 text-sm text-text-weak leading-relaxed">
          {props.skill.description}
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

const installedColumnHelper = createColumnHelper<InstalledSkillInfo>()

function InstalledSkillTable(props: {
  skills: InstalledSkillInfo[]
  onManage: (skill: InstalledSkillInfo) => void
}) {
  const { skills, onManage } = props
  const columns = useMemo(
    () => [
      installedColumnHelper.accessor("name", {
        header: "Name",
        cell: (info) => {
          return <span className="font-medium">{info.getValue()}</span>
        },
      }),
      installedColumnHelper.accessor("description", {
        header: "Description",
        cell: (info) => (
          <div className="max-w-[300px] truncate text-text-weak" title={info.getValue()}>
            {info.getValue()}
          </div>
        ),
      }),

      installedColumnHelper.display({
        id: "active",
        header: "Active",
        cell: (info) => {
          const skill = info.row.original
          const isActive = skill.permissionAction !== "deny"
          const isCurated = skill.source === "library"
          if (isActive || isCurated) {
            return (
              <div className="flex items-center gap-1.5">
                {isActive && <BadgeCheckIcon className="size-4 text-surface-success-base" />}
              </div>
            )
          }
          return null
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: skills,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="border border-border-base/60 rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border-base/60 bg-surface-base">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-text-weak">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-border-base/60 transition-colors hover:bg-surface-weak/30 cursor-pointer"
                onClick={() => onManage(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {language.t("skills.installedSection.empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

const libraryColumnHelper = createColumnHelper<SkillLibraryEntry>()

function LibrarySkillTable(props: {
  skills: SkillLibraryEntry[]
  busyOperations: ReadonlyMap<string, BusyOperation>
  onInstall: (skill: SkillLibraryEntry) => void
  onRemove: (skill: SkillLibraryEntry) => void
  onManage: (skill: SkillLibraryEntry) => void
}) {
  const { busyOperations, onInstall, onRemove, onManage, skills } = props
  const columns = useMemo(
    () => [
      libraryColumnHelper.accessor("displayName", {
        header: "Name",
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      libraryColumnHelper.accessor("summary", {
        header: "Description",
        cell: (info) => (
          <div className="max-w-[300px] truncate text-text-weak" title={info.getValue()}>
            {info.getValue()}
          </div>
        ),
      }),

      libraryColumnHelper.display({
        id: "actions",
        header: () => null,
        cell: (info) => {
          const skill = info.row.original
          return (
            <div className="flex justify-end">
              <LibraryActionButton
                skill={skill}
                compact
                busyAction={libraryBusyAction(skill.id, busyOperations)}
                disabled={isLibrarySkillBusy(skill.id, busyOperations)}
                onInstall={() => onInstall(skill)}
                onRemove={() => onRemove(skill)}
              />
            </div>
          )
        },
      }),
    ],
    [busyOperations, onInstall, onRemove],
  )

  const table = useReactTable({
    data: skills,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="border border-border-base/60 rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border-base/60 bg-surface-base">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-text-weak">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-border-base/60 transition-colors hover:bg-surface-weak/30 cursor-pointer"
                onClick={() => onManage(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {language.t("skills.librarySection.empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function SkillsPage(props: { directory?: string }) {
  const platform = usePlatform()
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
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const lastLibrarySyncError = useRef<string | undefined>(undefined)

  const selectedSkill = useMemo(
    () => catalog?.installed.find((skill) => skill.name === selectedSkillName),
    [catalog?.installed, selectedSkillName],
  )

  const selectedLibrarySkill = useMemo(
    () => catalog?.library.find((skill) => skill.id === selectedLibrarySkillID),
    [catalog?.library, selectedLibrarySkillID],
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
      const aInstalled =
        isInstalledLibrarySkill(a.state) || a.state === "withdrawn_installed"
      const bInstalled =
        isInstalledLibrarySkill(b.state) || b.state === "withdrawn_installed"
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
        toast.success(permissionRuleMessage(skill.name, action))
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

  return (
    <>
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-8 md:px-8">
        <Tabs defaultValue="installed" className="flex flex-col flex-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-base/60 mb-6 gap-4">
            <TabsList variant="line" className="w-fit shrink-0">
              <TabsTrigger value="installed" className="data-[state=active]:text-interactive-base">
                {language.t("skills.installedSection.title")}
              </TabsTrigger>
              <TabsTrigger value="library" className="data-[state=active]:text-interactive-base">
                {language.t("skills.librarySection.title")}
              </TabsTrigger>
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
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as any)}
                className="bg-surface-raised-base/60 border border-border-base/60 rounded-md shrink-0 ml-2"
              >
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <LayoutGridIcon className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="table" aria-label="Table view">
                  <ListIcon className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
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
            value="installed"
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-14 rounded-full bg-surface-weak/30" />
                          <div className="h-5 w-10 rounded-full bg-surface-weak/30" />
                        </div>
                        <div className="h-8 w-8 rounded-full bg-surface-weak/30" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : viewMode === "grid" ? (
              filteredInstalled.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {filteredInstalled.map((skill) => (
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
                    {language.t("skills.installedSection.empty")}
                  </CardContent>
                </Card>
              )
            ) : (
              <InstalledSkillTable
                skills={filteredInstalled}
                onManage={(skill) => setSelectedSkillName(skill.name)}
              />
            )}
          </TabsContent>

          <TabsContent
            value="library"
            className="flex-1 mt-0 focus-visible:outline-none"
            aria-busy={refreshing || loading}
          >
            {loading ? (
              <p className="text-sm text-text-weak">{language.t("skills.loadingSkills")}</p>
            ) : viewMode === "grid" ? (
              filteredLibrary.length > 0 ? (
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
              )
            ) : (
              <LibrarySkillTable
                skills={filteredLibrary}
                busyOperations={busyOperations}
                onInstall={(skill) =>
                  void runMutation(
                    installLibraryBusyKey(skill.id),
                    installOrUpdateBusyOperation(skill),
                    () => installLibrarySkill(skill.id, currentDirectory),
                    skillLibraryMutationMessage(skill),
                  )
                }
                onRemove={(skill) =>
                  void runMutation(
                    removeLibraryBusyKey(skill.id),
                    "remove",
                    () => removeLibrarySkill(skill.id, currentDirectory),
                    language.t("skills.detail.removedSkill", { name: skill.displayName }),
                  )
                }
                onManage={(skill) => setSelectedLibrarySkillID(skill.id)}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={!!selectedSkill}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSkillName(undefined)
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          {selectedSkill ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* ── Header (Fixed) ── */}
              <div className="border-b border-border-base/60 bg-surface-raised-base/30 px-6 py-6 shrink-0">
                <div className="space-y-3 min-w-0">
                  <DialogTitle className="text-2xl font-bold leading-tight text-text-base">
                    {selectedSkill.name}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-text-weak leading-relaxed max-w-2xl">
                    {selectedSkill.description}
                  </DialogDescription>
                </div>

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

                <div className="flex flex-wrap items-center gap-3 mt-8">
                  <div className="flex items-center gap-3 px-3 bg-surface-base rounded-lg border border-border-base/60 shadow-sm h-8 scale-95 origin-left">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-text-weaker/80">
                      Active
                    </span>
                    <Switch
                      className="scale-90"
                      checked={selectedSkill.permissionAction !== "deny"}
                      onCheckedChange={(checked) => toggleSkillEnabled(selectedSkill, checked)}
                      disabled={busyOperations.has(permissionBusyKey(selectedSkill.name))}
                      aria-label={language.t("skills.toggleAria", { name: selectedSkill.name })}
                    />
                  </div>
                </div>
              </div>

              {/* File reference section (Fixed Top Bar) */}
              <div className="px-6 h-12 flex items-center justify-between border-b border-border-base/40 bg-surface-base shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-weaker/80">
                  SKILL.md
                </span>
                {platform.revealPath && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7 px-2 text-[10px] uppercase tracking-widest text-text-weaker hover:text-text-base hover:bg-surface-weak/10 transition-colors"
                    onClick={() => {
                      void platform.revealPath!(selectedSkill.directory).catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : String(e)),
                      )
                    }}
                  >
                    <FolderSearchIcon className="size-3 mr-1.5 opacity-70" />
                    Reveal in Finder
                  </Button>
                )}
              </div>

              {/* ── Scrollable Body ── */}
              <div className="flex-1 overflow-y-auto min-h-0 bg-surface-base scrollbar-track-surface">
                <div className="flex flex-col">
                  {/* Example prompt */}
                  {selectedSkill.examplePrompt && (
                    <div className="space-y-3 px-6 py-8 border-b border-border-base/40 bg-surface-raised-base/20">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-weaker">
                          {language.t("skills.detail.examplePrompt")}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 text-xs text-text-weak hover:text-text-base"
                          onClick={() =>
                            void copyWithSuccessToast(
                              selectedSkill.examplePrompt!,
                              language.t("skills.detail.copiedPrompt", {
                                name: selectedSkill.name,
                              }),
                            )
                          }
                        >
                          <CopyIcon className="size-3 mr-1.5" />
                          {language.t("skills.detail.copy")}
                        </Button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-text-base rounded-xl bg-surface-base px-5 py-4 border border-border-base/40 font-medium leading-relaxed shadow-sm">
                        {selectedSkill.examplePrompt}
                      </p>
                    </div>
                  )}

                  {/* Skill content */}
                  <div className="px-6 py-8">
                    <Markdown text={selectedSkill.content} directory={selectedSkill.directory} />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedLibrarySkillID}
        onOpenChange={(open) => !open && setSelectedLibrarySkillID(undefined)}
      >
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden bg-surface-raised-base max-h-[90vh] flex flex-col">
          {selectedLibrarySkill ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* ── Header (Fixed) ── */}
              <div className="px-6 py-8 border-b border-border-base/40 bg-surface-raised-base/10 shrink-0">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-2xl font-bold leading-tight text-text-base flex-1">
                      {selectedLibrarySkill.displayName}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-sm text-text-weak leading-relaxed max-w-lg">
                    {selectedLibrarySkill.summary}
                  </DialogDescription>
                </div>
              </div>

              {/* ── Scrollable Body ── */}
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
