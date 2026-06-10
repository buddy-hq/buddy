import { createFileRoute } from "@tanstack/react-router"
import { useTheme } from "@/theme"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AspectRatio,
  Badge,
  BotIcon,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  Checkbox,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
  ComposerDock,
  ComposerDockActions,
  ComposerDockBody,
  ComposerDockFooter,
  ComposerDockHeader,
  ComposerDockTitle,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FolderIcon,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Input,
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  NativeSelect,
  NativeSelectOption,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SettingsIcon,
  Skeleton,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@buddy/ui"
import { BoldIcon, ItalicIcon, LaptopIcon, MoonIcon, SunIcon, Trash2Icon } from "lucide-react"

export const Route = createFileRoute("/component-playground")({
  component: ComponentPlaygroundPage,
})

/** Matches root layout `DesktopTitlebar` (`h-10` / 2.5rem). */
const PLAYGROUND_VIEWPORT_TOP_OFFSET_CLASS = "top-10"

const BUTTON_COLOR_VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const

const BADGE_COLOR_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const

const TOGGLE_COLOR_VARIANTS = ["default", "outline"] as const
const TABS_LIST_COLOR_VARIANTS = ["default", "line"] as const
const ITEM_COLOR_VARIANTS = ["default", "outline", "muted"] as const
const ITEM_MEDIA_COLOR_VARIANTS = ["default", "icon", "image"] as const
const RESIZABLE_HANDLE_COLOR_VARIANTS = ["divider", "overlay"] as const
const ALERT_DIALOG_BUTTON_VARIANTS = [
  { label: "AlertDialogCancel · outline", variant: "outline" },
  { label: "AlertDialogAction · default", variant: "default" },
  { label: "AlertDialogAction · destructive", variant: "destructive" },
] as const
const ITEM_MEDIA_PLACEHOLDER_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23888'/%3E%3C/svg%3E"

const TEXT_SWATCHES = [
  { label: "strong", className: "text-text-strong" },
  { label: "base", className: "text-text-base" },
  { label: "weak", className: "text-text-weak" },
  { label: "weaker", className: "text-text-weaker" },
  { label: "interactive", className: "text-text-interactive-base" },
  { label: "critical", className: "text-text-critical-base" },
  { label: "success", className: "text-text-success-base" },
  { label: "warning", className: "text-text-warning-base" },
] as const

const PLAYGROUND_SURFACES = [
  { id: "background", label: "background-base", className: "bg-background-base border-border-base" },
  { id: "surface-base", label: "surface-base", className: "bg-surface-base border-border-base" },
  {
    id: "surface-raised",
    label: "surface-raised-base",
    className: "bg-surface-raised-base border-border-base",
  },
  { id: "surface-weak", label: "surface-weak", className: "bg-surface-weak border-border-weak-base" },
  {
    id: "interactive",
    label: "surface-interactive-base",
    className: "bg-surface-interactive-base border-border-interactive-base",
  },
  {
    id: "success-weak",
    label: "surface-success-weak",
    className: "bg-surface-success-weak border-border-success-base",
  },
  {
    id: "warning-weak",
    label: "surface-warning-weak",
    className: "bg-surface-warning-weak border-border-warning-base",
  },
  {
    id: "critical-weak",
    label: "surface-critical-weak",
    className: "bg-surface-critical-weak border-border-critical-base",
  },
] as const

type TPlaygroundSurfaceId = (typeof PLAYGROUND_SURFACES)[number]["id"]

const DEFAULT_PLAYGROUND_SURFACE_ID: TPlaygroundSurfaceId = "surface-raised"

function isPlaygroundSurfaceId(value: string): value is TPlaygroundSurfaceId {
  return PLAYGROUND_SURFACES.some((surface) => surface.id === value)
}

function getPlaygroundSurface(id: TPlaygroundSurfaceId) {
  const surface = PLAYGROUND_SURFACES.find((entry) => entry.id === id)
  if (!surface) {
    return PLAYGROUND_SURFACES.find((entry) => entry.id === DEFAULT_PLAYGROUND_SURFACE_ID) ?? PLAYGROUND_SURFACES[0]
  }
  return surface
}

const PLAYGROUND_COMPONENTS = [
  { id: "design-tokens", title: "Design tokens" },
  { id: "button", title: "Button" },
  { id: "badge", title: "Badge" },
  { id: "tabs", title: "Tabs" },
  { id: "toggle-group", title: "ToggleGroup" },
  { id: "item", title: "Item" },
  { id: "item-media", title: "ItemMedia" },
  { id: "dropdown-menu", title: "DropdownMenu" },
  { id: "context-menu", title: "ContextMenu" },
  { id: "dialog", title: "Dialog" },
  { id: "alert-dialog", title: "AlertDialog" },
  { id: "popover", title: "Popover" },
  { id: "hover-card", title: "HoverCard" },
  { id: "tooltip", title: "Tooltip" },
  { id: "input", title: "Input" },
  { id: "textarea", title: "Textarea" },
  { id: "checkbox", title: "Checkbox" },
  { id: "switch", title: "Switch" },
  { id: "select", title: "Select" },
  { id: "native-select", title: "NativeSelect" },
  { id: "slider", title: "Slider" },
  { id: "combobox", title: "Combobox" },
  { id: "command", title: "Command" },
  { id: "card", title: "Card" },
  { id: "composer-dock", title: "ComposerDock" },
  { id: "table", title: "Table" },
  { id: "accordion", title: "Accordion" },
  { id: "collapsible", title: "Collapsible" },
  { id: "progress", title: "Progress" },
  { id: "skeleton", title: "Skeleton" },
  { id: "separator", title: "Separator" },
  { id: "scroll-area", title: "ScrollArea" },
  { id: "aspect-ratio", title: "AspectRatio" },
  { id: "resizable-handle", title: "ResizableHandle" },
  { id: "carousel", title: "Carousel" },
] as const

type TPlaygroundSectionProps = {
  id: string
  title: string
  description?: string
  defaultSurfaceId?: TPlaygroundSurfaceId
  children: ReactNode
}

function PlaygroundSection({
  id,
  title,
  description,
  defaultSurfaceId = DEFAULT_PLAYGROUND_SURFACE_ID,
  children,
}: TPlaygroundSectionProps) {
  const [surfaceId, setSurfaceId] = useState<TPlaygroundSurfaceId>(defaultSurfaceId)
  const surface = getPlaygroundSurface(surfaceId)

  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-text-strong">{title}</h2>
          {description ? <p className="mt-1 text-sm text-text-weak">{description}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <label htmlFor={`${id}-surface`} className="text-[11px] font-semibold uppercase tracking-wider text-text-weak">
            Surface
          </label>
          <Select
            value={surfaceId}
            onValueChange={(value) => {
              if (isPlaygroundSurfaceId(value)) setSurfaceId(value)
            }}
          >
            <SelectTrigger id={`${id}-surface`} className="w-52">
              <SelectValue placeholder="Pick surface" />
            </SelectTrigger>
            <SelectContent>
              {PLAYGROUND_SURFACES.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className={cn("rounded-xl border p-5 transition-colors duration-200", surface.className)}>
        {children}
      </div>
    </section>
  )
}

type TVariantGridProps = {
  label: string
  children: ReactNode
}

function VariantGrid({ label, children }: TVariantGridProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-weak">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function ThemeSidebar() {
  const { themeId, colorScheme, themes, setTheme, setColorScheme } = useTheme()
  const [themeFilter, setThemeFilter] = useState("")

  const filteredThemeIds = useMemo(() => {
    const query = themeFilter.trim().toLowerCase()
    const ids = Object.keys(themes).toSorted((a, b) => themes[a].name.localeCompare(themes[b].name))
    if (!query) return ids
    return ids.filter((id) => {
      const theme = themes[id]
      return id.toLowerCase().includes(query) || theme.name.toLowerCase().includes(query)
    })
  }, [themeFilter, themes])

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-border-base bg-surface-raised-base">
      <div className="space-y-4 border-b border-border-base p-4">
        <div>
          <h2 className="text-sm font-semibold text-text-strong">Theme</h2>
          <p className="mt-1 text-xs text-text-weak">{themes[themeId]?.name ?? themeId}</p>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border-base bg-background-base p-1">
          <button
            type="button"
            onClick={() => setColorScheme("light")}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              colorScheme === "light" ? "bg-surface-interactive-weak text-text-strong" : "hover:bg-surface-base-hover",
            )}
          >
            <SunIcon className="size-3.5 shrink-0" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setColorScheme("dark")}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              colorScheme === "dark" ? "bg-surface-interactive-weak text-text-strong" : "hover:bg-surface-base-hover",
            )}
          >
            <MoonIcon className="size-3.5 shrink-0" />
            Dark
          </button>
          <button
            type="button"
            onClick={() => setColorScheme("system")}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
              colorScheme === "system" ? "bg-surface-interactive-weak text-text-strong" : "hover:bg-surface-base-hover",
            )}
          >
            <LaptopIcon className="size-3.5 shrink-0" />
            System
          </button>
        </div>

        <Input
          value={themeFilter}
          onChange={(event) => setThemeFilter(event.target.value)}
          placeholder="Filter themes…"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {filteredThemeIds.map((id) => {
            const theme = themes[id]
            const isActive = themeId === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                className={cn(
                  "rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors",
                  isActive
                    ? "bg-surface-interactive-base text-text-on-interactive-base"
                    : "text-text-base hover:bg-surface-base-hover hover:text-text-strong",
                )}
              >
                {theme.name}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}

type TPlaygroundOutlineProps = {
  onNavigate: (componentId: string) => void
}

function PlaygroundOutline({ onNavigate }: TPlaygroundOutlineProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col overflow-hidden border-l border-border-base bg-surface-raised-base">
      <div className="shrink-0 border-b border-border-base p-4">
        <h2 className="text-sm font-semibold text-text-strong">Components</h2>
        <p className="mt-1 text-xs text-text-weak">Jump to a component</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-0.5 p-2">
          {PLAYGROUND_COMPONENTS.map((component) => (
            <a
              key={component.id}
              href={`#${component.id}`}
              onClick={(event) => {
                event.preventDefault()
                onNavigate(component.id)
              }}
              className="rounded-md px-2.5 py-2 text-left text-xs font-medium text-text-base transition-colors hover:bg-surface-base-hover hover:text-text-strong"
            >
              {component.title}
            </a>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  )
}

function scrollToPlaygroundComponent(componentId: string, scrollRoot: HTMLElement) {
  const section = document.getElementById(componentId)
  if (!section) return
  const rootTop = scrollRoot.getBoundingClientRect().top
  const sectionTop = section.getBoundingClientRect().top
  scrollRoot.scrollTo({
    top: scrollRoot.scrollTop + sectionTop - rootTop,
    behavior: "smooth",
  })
  window.history.replaceState(null, "", `#${componentId}`)
}

function ComponentPlaygroundPage() {
  const mainScrollRef = useRef<HTMLElement>(null)
  const [comboboxValue, setComboboxValue] = useState<string | null>("gpt-4o")
  const [selectValue, setSelectValue] = useState("light")
  const [nativeSelectValue, setNativeSelectValue] = useState("one")
  const [sliderValue, setSliderValue] = useState([42])
  const [progressValue, setProgressValue] = useState(62)
  const [activeTab, setActiveTab] = useState("one")
  const [accordionValue, setAccordionValue] = useState<string | undefined>("item-1")
  const [toggleGroupDefaultValue, setToggleGroupDefaultValue] = useState<string[]>(["bold"])
  const [toggleGroupOutlineValue, setToggleGroupOutlineValue] = useState<string[]>(["italic"])
  const [checkboxChecked, setCheckboxChecked] = useState(true)
  const [checkboxUnchecked, setCheckboxUnchecked] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [switchOff, setSwitchOff] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [alertDialogOpen, setAlertDialogOpen] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [collapsibleOpen, setCollapsibleOpen] = useState(false)

  useEffect(() => {
    const main = mainScrollRef.current
    if (!main) return
    main.scrollTop = 0
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)
    }
  }, [])

  return (
    <TooltipProvider>
      <div
        data-component="component-playground"
        className={cn(
          "fixed inset-x-0 bottom-0 flex overflow-hidden bg-background-base text-text-base transition-colors duration-200",
          PLAYGROUND_VIEWPORT_TOP_OFFSET_CLASS,
        )}
      >
        <ThemeSidebar />

        <main ref={mainScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-8">
          <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-10">
            <header className="border-b border-border-base pb-6">
              <h1 className="text-3xl font-bold tracking-tight text-text-strong">Component Playground</h1>
              <p className="mt-1 max-w-2xl text-sm text-text-weak">
                Fixed theme picker (left) and component list (right). Only the center column scrolls.
              </p>
            </header>

            <PlaygroundSection
              id="design-tokens"
              title="Design tokens"
              description="Theme token swatches only — not component variants."
            >
            <div className="space-y-6">
              <VariantGrid label="Text">
                {TEXT_SWATCHES.map((swatch) => (
                  <span key={swatch.label} className={cn("text-sm font-medium", swatch.className)}>
                    {swatch.label}
                  </span>
                ))}
              </VariantGrid>
              <VariantGrid label="Surfaces">
                {PLAYGROUND_SURFACES.map((swatch) => (
                  <div
                    key={swatch.id}
                    className={cn(
                      "flex h-14 w-28 items-end rounded-md border p-2 text-[10px] font-medium text-text-weak",
                      swatch.className,
                    )}
                  >
                    {swatch.label}
                  </div>
                ))}
              </VariantGrid>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="button" title="Button" description="All button color variants.">
            <VariantGrid label="Variants">
              {BUTTON_COLOR_VARIANTS.map((variant) => (
                <Button key={variant} variant={variant}>
                  {variant}
                </Button>
              ))}
            </VariantGrid>
          </PlaygroundSection>

          <PlaygroundSection id="badge" title="Badge" description="All badge color variants.">
            <VariantGrid label="Variants">
              {BADGE_COLOR_VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant}>
                  {variant}
                </Badge>
              ))}
            </VariantGrid>
          </PlaygroundSection>

          <PlaygroundSection id="tabs" title="Tabs" description="TabsList color variants.">
            <div className="space-y-6">
              {TABS_LIST_COLOR_VARIANTS.map((listVariant) => (
                <VariantGrid key={listVariant} label={`TabsList · ${listVariant}`}>
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-md">
                    <TabsList variant={listVariant}>
                      <TabsTrigger value="one">Overview</TabsTrigger>
                      <TabsTrigger value="two">Details</TabsTrigger>
                      <TabsTrigger value="three">Settings</TabsTrigger>
                    </TabsList>
                    <TabsContent value={activeTab} className="pt-3 text-sm text-text-weak">
                      Panel content for the active tab.
                    </TabsContent>
                  </Tabs>
                </VariantGrid>
              ))}
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="toggle-group" title="ToggleGroup" description="ToggleGroup color variants.">
            <div className="space-y-6">
              {TOGGLE_COLOR_VARIANTS.map((variant) => (
                <VariantGrid key={variant} label={variant}>
                  <ToggleGroup
                    type="multiple"
                    variant={variant}
                    value={variant === "default" ? toggleGroupDefaultValue : toggleGroupOutlineValue}
                    onValueChange={
                      variant === "default" ? setToggleGroupDefaultValue : setToggleGroupOutlineValue
                    }
                  >
                    <ToggleGroupItem value="bold" aria-label="Bold">
                      <BoldIcon />
                    </ToggleGroupItem>
                    <ToggleGroupItem value="italic" aria-label="Italic">
                      <ItalicIcon />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </VariantGrid>
              ))}
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="item" title="Item" description="Item color variants.">
            <div className="flex max-w-lg flex-col gap-3">
              {ITEM_COLOR_VARIANTS.map((variant) => (
                <Item key={variant} variant={variant}>
                  <ItemMedia variant="icon">
                    <BotIcon className="text-icon-info-base" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Item · {variant}</ItemTitle>
                    <ItemDescription>Secondary line using theme text tokens.</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="item-media" title="ItemMedia" description="ItemMedia color variants.">
            <div className="flex max-w-lg flex-col gap-3">
              {ITEM_MEDIA_COLOR_VARIANTS.map((variant) => (
                <Item key={variant} variant="outline">
                  <ItemMedia variant={variant}>
                    {variant === "icon" ? <FolderIcon className="text-icon-base" /> : null}
                    {variant === "image" ? (
                      <img src={ITEM_MEDIA_PLACEHOLDER_SRC} alt="Item media preview" />
                    ) : null}
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>ItemMedia · {variant}</ItemTitle>
                  </ItemContent>
                </Item>
              ))}
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="dropdown-menu" title="DropdownMenu" description="Menu item color variants.">
            <VariantGrid label="DropdownMenuItem">
              <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">{dropdownOpen ? "Close menu" : "Open menu"}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-52">
                  <DropdownMenuItem>
                    <SettingsIcon className="size-4" />
                    Default
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <Trash2Icon className="size-4" />
                    Destructive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </VariantGrid>
          </PlaygroundSection>

          <PlaygroundSection id="context-menu" title="ContextMenu" description="Menu item color variants.">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Button variant="outline">Right-click target</Button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem>Default</ContextMenuItem>
                <ContextMenuItem variant="destructive">Destructive</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </PlaygroundSection>

          <PlaygroundSection id="dialog" title="Dialog" description="No color variants.">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog title</DialogTitle>
                  <DialogDescription>Dialog body on the selected parent surface.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PlaygroundSection>

          <PlaygroundSection
            id="alert-dialog"
            title="AlertDialog"
            description="AlertDialogAction uses Button color variants."
          >
            <VariantGrid label="AlertDialogAction">
              {ALERT_DIALOG_BUTTON_VARIANTS.map((entry) => (
                <Button key={entry.label} variant={entry.variant}>
                  {entry.variant}
                </Button>
              ))}
            </VariantGrid>
            <div className="mt-4">
              <AlertDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Open alert dialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="popover" title="Popover" description="No color variants.">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline">{popoverOpen ? "Close popover" : "Open popover"}</Button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <PopoverHeader>
                  <PopoverTitle>Popover title</PopoverTitle>
                  <PopoverDescription>Popover body content.</PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          </PlaygroundSection>

          <PlaygroundSection id="hover-card" title="HoverCard" description="No color variants.">
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="ghost">Hover target</Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <p className="text-sm text-text-base">Hover card content.</p>
              </HoverCardContent>
            </HoverCard>
          </PlaygroundSection>

          <PlaygroundSection id="tooltip" title="Tooltip" description="No color variants.">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">Hover for tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip content</TooltipContent>
            </Tooltip>
          </PlaygroundSection>

          <PlaygroundSection id="input" title="Input" description="No color variants.">
            <div className="flex max-w-md flex-col gap-3">
              <Input placeholder="Default input" />
              <Input placeholder="Disabled input" disabled />
              <Input placeholder="Invalid input" aria-invalid />
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="textarea" title="Textarea" description="No color variants.">
            <Textarea className="max-w-md" placeholder="Textarea" />
          </PlaygroundSection>

          <PlaygroundSection id="checkbox" title="Checkbox" description="No color variants.">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={checkboxChecked} onCheckedChange={(value) => setCheckboxChecked(value === true)} />
                Checked
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checkboxUnchecked}
                  onCheckedChange={(value) => setCheckboxUnchecked(value === true)}
                />
                Unchecked
              </label>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="switch" title="Switch" description="No color variants.">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
                On
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={switchOff} onCheckedChange={setSwitchOff} />
                Off
              </label>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="select" title="Select" description="No color variants.">
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </PlaygroundSection>

          <PlaygroundSection id="native-select" title="NativeSelect" description="No color variants.">
            <NativeSelect
              className="max-w-md"
              value={nativeSelectValue}
              onChange={(event) => setNativeSelectValue(event.target.value)}
            >
              <NativeSelectOption value="one">Option one</NativeSelectOption>
              <NativeSelectOption value="two">Option two</NativeSelectOption>
            </NativeSelect>
          </PlaygroundSection>

          <PlaygroundSection id="slider" title="Slider" description="No color variants.">
            <Slider
              className="max-w-md"
              value={sliderValue}
              onValueChange={(value) => {
                setSliderValue(value)
                setProgressValue(value[0] ?? 0)
              }}
              max={100}
              step={1}
            />
          </PlaygroundSection>

          <PlaygroundSection id="combobox" title="Combobox" description="No color variants.">
            <Combobox value={comboboxValue} onValueChange={setComboboxValue}>
              <ComboboxTrigger className="flex w-full max-w-md items-center justify-between rounded-lg border border-border-base bg-background-base px-3 py-2 text-sm">
                <ComboboxValue placeholder="Pick a model" />
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxItem value="gpt-4o">GPT-4o</ComboboxItem>
                  <ComboboxItem value="claude">Claude</ComboboxItem>
                  <ComboboxItem value="gemini">Gemini</ComboboxItem>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </PlaygroundSection>

          <PlaygroundSection id="command" title="Command" description="No color variants.">
            <Command className="max-w-md rounded-lg border border-border-base">
              <CommandInput placeholder="Search commands…" />
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup heading="Actions">
                  <CommandItem>
                    <BotIcon className="size-4" />
                    New chat
                  </CommandItem>
                  <CommandItem>
                    <FolderIcon className="size-4" />
                    Open folder
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Settings">
                  <CommandItem>
                    <SettingsIcon className="size-4" />
                    Preferences
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PlaygroundSection>

          <PlaygroundSection id="card" title="Card" description="No color variants.">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Card title</CardTitle>
                <CardDescription>Card description.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-text-weak">Card body content.</p>
              </CardContent>
              <CardFooter className="gap-2">
                <Button variant="outline">Cancel</Button>
                <Button>Save</Button>
              </CardFooter>
            </Card>
          </PlaygroundSection>

          <PlaygroundSection id="composer-dock" title="ComposerDock" description="No color variants.">
            <ComposerDock size="sm" autoFocus={false} className="max-w-md">
              <ComposerDockHeader>
                <ComposerDockTitle icon={BotIcon} title="Composer dock" />
                <ComposerDockActions>
                  <Button variant="ghost" size="icon-sm">
                    <ChevronDownIcon />
                  </Button>
                </ComposerDockActions>
              </ComposerDockHeader>
              <ComposerDockBody padded>
                <p className="text-sm text-text-weak">Composer dock body.</p>
              </ComposerDockBody>
              <ComposerDockFooter>
                <Button variant="outline" size="sm">
                  Dismiss
                </Button>
                <Button size="sm">Continue</Button>
              </ComposerDockFooter>
            </ComposerDock>
          </PlaygroundSection>

          <PlaygroundSection id="table" title="Table" description="No color variants.">
            <Table className="max-w-lg">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Buddy</TableCell>
                  <TableCell className="text-text-weak">Active</TableCell>
                  <TableCell className="text-text-weak">Agent</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Reader</TableCell>
                  <TableCell className="text-text-weak">Idle</TableCell>
                  <TableCell className="text-text-weak">Reader</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </PlaygroundSection>

          <PlaygroundSection id="accordion" title="Accordion" description="No color variants.">
            <Accordion
              type="single"
              collapsible
              value={accordionValue}
              onValueChange={setAccordionValue}
              className="max-w-lg"
            >
              <AccordionItem value="item-1">
                <AccordionTrigger>Accordion section</AccordionTrigger>
                <AccordionContent className="text-text-weak">Accordion content.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </PlaygroundSection>

          <PlaygroundSection id="collapsible" title="Collapsible" description="No color variants.">
            <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="max-w-lg">
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  {collapsibleOpen ? "Hide" : "Show"} content
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 rounded-lg border border-border-base bg-surface-base p-3 text-sm text-text-weak">
                Collapsible content.
              </CollapsibleContent>
            </Collapsible>
          </PlaygroundSection>

          <PlaygroundSection id="progress" title="Progress" description="No color variants.">
            <Progress className="max-w-md" value={progressValue} />
          </PlaygroundSection>

          <PlaygroundSection id="skeleton" title="Skeleton" description="No color variants.">
            <div className="flex max-w-md items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="separator" title="Separator" description="No color variants.">
            <div className="flex max-w-md items-center gap-3 text-sm text-text-weak">
              <span>Left</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Right</span>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="scroll-area" title="ScrollArea" description="No color variants.">
            <ScrollArea className="h-24 max-w-md rounded-lg border border-border-base p-3">
              <p className="text-sm text-text-weak">ScrollArea content line one.</p>
              <p className="mt-3 text-sm text-text-weak">ScrollArea content line two forces overflow.</p>
            </ScrollArea>
          </PlaygroundSection>

          <PlaygroundSection id="aspect-ratio" title="AspectRatio" description="No color variants.">
            <div className="max-w-xs">
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg border border-border-base bg-surface-weak">
                <div className="flex size-full items-center justify-center text-sm text-text-weak">16:9</div>
              </AspectRatio>
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="resizable-handle" title="ResizableHandle" description="Handle color variants.">
            <div className="flex flex-col gap-6">
              {RESIZABLE_HANDLE_COLOR_VARIANTS.map((handleVariant) => (
                <VariantGrid key={handleVariant} label={handleVariant}>
                  <ResizablePanelGroup
                    orientation="horizontal"
                    className="min-h-28 w-full max-w-lg rounded-lg border border-border-base"
                  >
                    <ResizablePanel defaultSize={50} minSize={25}>
                      <div className="flex h-full items-center justify-center p-4 text-sm text-text-weak">A</div>
                    </ResizablePanel>
                    <ResizableHandle variant={handleVariant} withHandle={handleVariant === "divider"} />
                    <ResizablePanel defaultSize={50} minSize={25}>
                      <div className="flex h-full items-center justify-center p-4 text-sm text-text-weak">B</div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </VariantGrid>
              ))}
            </div>
          </PlaygroundSection>

          <PlaygroundSection id="carousel" title="Carousel" description="No color variants.">
            <Carousel className="mx-auto w-full max-w-sm">
              <CarouselContent>
                {["Slide 1", "Slide 2", "Slide 3"].map((label) => (
                  <CarouselItem key={label}>
                    <Card>
                      <CardContent className="flex aspect-video items-center justify-center p-6">
                        <span className="text-lg font-semibold text-text-strong">{label}</span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </PlaygroundSection>

          </div>
        </main>

        <PlaygroundOutline
          onNavigate={(componentId) => {
            const main = mainScrollRef.current
            if (!main) return
            scrollToPlaygroundComponent(componentId, main)
          }}
        />
      </div>
    </TooltipProvider>
  )
}
