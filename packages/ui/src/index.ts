export { Button, buttonVariants } from "./components/ui/button"
export { Badge, badgeVariants } from "./components/ui/badge"
export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
} from "./components/ui/avatar"
export { Checkbox } from "./components/ui/checkbox"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./components/ui/card"
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog"
export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./components/ui/context-menu"
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible"
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./components/ui/accordion"
export { AspectRatio } from "./components/ui/aspect-ratio"
export {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "./components/ui/combobox"
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog"
export { Alert, AlertAction, AlertDescription, AlertTitle } from "./components/ui/alert"
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu"
export { HoverCard, HoverCardContent, HoverCardTrigger } from "./components/ui/hover-card"
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./components/ui/popover"
export { Input } from "./components/ui/input"
export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
} from "./components/ui/field"
export {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "./components/ui/native-select"
export { Progress } from "./components/ui/progress"
export { RadioGroup, RadioGroupItem } from "./components/ui/radio-group"
export { ResizeHandle } from "./components/ui/resize-handle"
export type { ResizeHandleIntent } from "./components/ui/resize-handle"
export {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelLayout,
  useResizablePanelRef,
} from "./components/ui/resizable"
export type { ResizablePanelHandle, ResizablePanelLayoutStorage } from "./components/ui/resizable"
export { Separator } from "./components/ui/separator"
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select"
export { Switch } from "./components/ui/switch"
export { Skeleton } from "./components/ui/skeleton"
export { Spinner } from "./components/ui/spinner"
export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./components/ui/empty"
export { Slider } from "./components/ui/slider"
export { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"
export { Toaster } from "./components/ui/sonner"
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
export { Textarea } from "./components/ui/textarea"
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip"
export { ThemeProvider } from "next-themes"
export {
  HugeiconsIcon,
  // Component wrappers (stable consumer-facing names)
  ArchiveIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BookIcon,
  NotebookIcon,
  BotIcon,
  BrainIcon,
  CheckIcon,
  CircleCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleQuestionMarkIcon,
  Clock3Icon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ExpandIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HomeIcon,
  MailIcon,
  MailOpenIcon,
  MoveLeftIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  SearchXIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  TargetIcon,
  UnlinkIcon,
  FileSlidersIcon,
  ZapIcon,
  XIcon,
  MessagesSquareIcon,
  // Raw free-icon data for HugeiconsIcon
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Book01Icon,
  BookOpen01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Download01Icon,
  NoteEditIcon,
  FolderAddIcon,
  Folder01Icon,
  Home01Icon,
  Mail01Icon,
  MessageMultiple01Icon,
  PlusSignIcon,
  SearchRemoveIcon,
  Settings01Icon,
  Target01Icon,
  Tick02Icon,
} from "./icons"
export type { IconProps, IconSvgElement } from "./icons"
export { SHADCN_HUGEICONS_STROKE_WIDTH, SHADCN_HUGEICONS_DEFAULT_COLOR } from "./lib/icon-defaults"
export { Z_INDEX } from "./lib/z-index"
export { cn } from "./lib/utils"
export { toast } from "sonner"

export { ScrollArea } from "./components/ui/scroll-area"
export {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "./components/ui/carousel"
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "./components/ui/command"
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table"
export * from "./components/ui/item"
export {
  ComposerDock,
  ComposerDockHeader,
  ComposerDockTitle,
  ComposerDockActions,
  ComposerDockBody,
  ComposerDockFooter,
} from "./components/ui/composer-dock"

// Experimental — ported from shadcn radix-nova, restyled to Buddy tokens.
// Requires shadcn-utilities.css (scroll-fade, shimmer) imported in index.css.
export { Marker, MarkerIcon, MarkerContent } from "./components/experimental/marker"
export {
  MessageGroup,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "./components/experimental/message"
export {
  BubbleGroup,
  Bubble,
  BubbleContent,
  BubbleReactions,
} from "./components/experimental/bubble"
export {
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
} from "./components/experimental/attachment"
