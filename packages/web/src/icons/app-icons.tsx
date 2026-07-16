/**
 * Web app icon components backed by Hugeicons free icons.
 *
 * Exposes stable app-local names that map to semantically matching free Hugeicons glyphs.
 *
 * Defaults match official shadcn Hugeicons:
 *   <HugeiconsIcon icon={…} strokeWidth={2} />
 * Package also defaults color=currentColor, size=24 (CSS size-* overrides display size).
 */
import { forwardRef } from "react"
import type {
  ComponentPropsWithoutRef,
  ForwardRefExoticComponent,
  RefAttributes,
} from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ALargeSmallIcon as ALargeSmallIconData,
  Alert02Icon as Alert02IconData,
  AlertCircleIcon as AlertCircleIconData,
  AlignLeftIcon as AlignLeftIconData,
  AppWindowIcon as AppWindowIconData,
  ArrowDown01Icon as ArrowDown01IconData,
  ArrowRight01Icon as ArrowRight01IconData,
  ArrowUp01Icon as ArrowUp01IconData,
  Award01Icon as Award01IconData,
  BlocksIcon as BlocksIconData,
  BookAIcon as BookAIconData,
  BookOpen01Icon as BookOpen01IconData,
  BookOpen02Icon as BookOpen02IconData,
  Books02Icon as Books02IconData,
  NotebookIcon as NotebookIconData,
  BotIcon as BotIconData,
  BotMessageSquareIcon as BotMessageSquareIconData,
  BoxesIcon as BoxesIconData,
  Bug01Icon as Bug01IconData,
  BulbIcon as BulbIconData,
  Cancel01Icon as Cancel01IconData,
  CancelCircleIcon as CancelCircleIconData,
  CheckListIcon as CheckListIconData,
  CheckmarkCircle02Icon as CheckmarkCircle02IconData,
  ClipboardCopyIcon as ClipboardCopyIconData,
  ClipboardPenLineIcon as ClipboardPenLineIconData,
  Clock3Icon as Clock3IconData,
  Compass01Icon as Compass01IconData,
  CpuSettingsIcon as CpuSettingsIconData,
  CopyIcon as CopyIconData,
  CornerUpLeftIcon as CornerUpLeftIconData,
  Delete02Icon as Delete02IconData,
  DnaIcon as DnaIconData,
  Download01Icon as Download01IconData,
  DragDropVerticalIcon as DragDropVerticalIconData,
  EllipsisIcon as EllipsisIconData,
  EraserIcon as EraserIconData,
  ExternalLinkIcon as ExternalLinkIconData,
  File01Icon as File01IconData,
  File02Icon as File02IconData,
  FileImageIcon as FileImageIconData,
  FileUnknownIcon as FileUnknownIconData,
  Folder01Icon as Folder01IconData,
  FolderOpenIcon as FolderOpenIconData,
  Gamepad2Icon as Gamepad2IconData,
  GitBranchIcon as GitBranchIconData,
  Globe02Icon as Globe02IconData,
  GraduationCapIcon as GraduationCapIconData,
  HandIcon as HandIconData,
  HelpCircleIcon as HelpCircleIconData,
  HighlighterIcon as HighlighterIconData,
  HistoryIcon as HistoryIconData,
  Image01Icon as Image01IconData,
  ImageCompositionIcon as ImageCompositionIconData,
  InformationCircleIcon as InformationCircleIconData,
  NeuralNetworkIcon as NeuralNetworkIconData,
  JusticeScale01Icon as JusticeScale01IconData,
  Key01Icon as Key01IconData,
  LaptopIcon as LaptopIconData,
  Layers01Icon as Layers01IconData,
  Layers02Icon as Layers02IconData,
  Layout01Icon as Layout01IconData,
  LayoutLeftIcon as LayoutLeftIconData,
  LayoutTopIcon as LayoutTopIconData,
  LeftToRightListBulletIcon as LeftToRightListBulletIconData,
  Link01Icon as Link01IconData,
  Loading03Icon as Loading03IconData,
  MapsIcon as MapsIconData,
  Message01Icon as Message01IconData,
  Message02Icon as Message02IconData,
  MinusSignIcon as MinusSignIconData,
  MusicNote01Icon as MusicNote01IconData,
  NoteIcon as NoteIconData,
  PauseIcon as PauseIconData,
  PencilEdit01Icon as PencilEdit01IconData,
  PencilEdit02Icon as PencilEdit02IconData,
  PencilRulerIcon as PencilRulerIconData,
  PictureInPictureOnIcon as PictureInPictureOnIconData,
  PinIcon as PinIconData,
  PlayIcon as PlayIconData,
  Plug01Icon as Plug01IconData,
  PowerIcon as PowerIconData,
  Presentation01Icon as Presentation01IconData,
  PrinterIcon as PrinterIconData,
  RotateLeft01Icon as RotateLeft01IconData,
  SaveIcon as SaveIconData,
  ScanIcon as ScanIconData,
  School01Icon as School01IconData,
  ScrollIcon as ScrollIconData,
  SearchAddIcon as SearchAddIconData,
  SearchMinusIcon as SearchMinusIconData,
  SearchRemoveIcon as SearchRemoveIconData,
  Settings05Icon as Settings05IconData,
  SentIcon as SentIconData,
  Settings01Icon as Settings01IconData,
  Shapes01Icon as Shapes01IconData,
  SlidersHorizontalIcon as SlidersHorizontalIconData,
  SparklesIcon as SparklesIconData,
  StudyLampIcon as StudyLampIconData,
  Summation01Icon as Summation01IconData,
  Sun01Icon as Sun01IconData,
  TeachingIcon as TeachingIconData,
  TerminalIcon as TerminalIconData,
  TextAlignJustifyCenterIcon as TextAlignJustifyCenterIconData,
  TextBoldIcon as TextBoldIconData,
  TextItalicIcon as TextItalicIconData,
  Tick02Icon as Tick02IconData,
  Upload01Icon as Upload01IconData,
  UserIcon as UserIconData,
  Video01Icon as Video01IconData,
  VolumeHighIcon as VolumeHighIconData,
  WorkflowSquare08Icon as WorkflowSquare08IconData,
  ZapIcon as ZapIconData,
  Add01Icon as Add01IconData,
  ArrowDown02Icon as ArrowDown02IconData,
  ArrowExpandIcon as ArrowExpandIconData,
  ArrowLeft02Icon as ArrowLeft02IconData,
  ArrowReloadHorizontalIcon as ArrowReloadHorizontalIconData,
  ArrowRight02Icon as ArrowRight02IconData,
  ArrowShrinkIcon as ArrowShrinkIconData,
  ArrowUpRight03Icon as ArrowUpRight03IconData,
  Bookmark02Icon as Bookmark02IconData,
  BrainCircuitIcon as BrainCircuitIconData,

  Moon02Icon as Moon02IconData,
  PaintBrush02Icon as PaintBrush02IconData,
  PanelLeftIcon as PanelLeftIconData,
  PanelRightIcon as PanelRightIconData,
  Redo03Icon as Redo03IconData,
  SearchIcon as SearchIconData,
  SettingsIcon as SettingsIconData,
  Shield02Icon as Shield02IconData,
  Undo03Icon as Undo03IconData,


  ScanImageIcon as ScanImageIconData,
  VolumeMute02Icon as VolumeMute02IconData,
  WrenchIcon as WrenchIconData,

} from "@hugeicons/core-free-icons"

export type IconProps = Omit<ComponentPropsWithoutRef<typeof HugeiconsIcon>, "icon">

/** Ref-safe component type shared by app icon consumers. */
export type AppIcon = ForwardRefExoticComponent<
  IconProps & RefAttributes<SVGSVGElement>
>

/** Official shadcn/ui Hugeicons default (CLI: strokeWidth={2}). */
const SHADCN_HUGEICONS_STROKE_WIDTH = 2

/**
 * Buddy brand panda — original Panda paths retained under the ISC license.
 * Hugeicons free has no panda; this is intentional product identity (thinking / "Buddy"), not a substitute glyph.
 */
const PANDA_STROKE_ATTRIBUTES = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

const BuddyPandaIconData = [
  [
    "path",
    { ...PANDA_STROKE_ATTRIBUTES, d: "M11.25 17.25h1.5L12 18z", key: "1wmwwj" },
  ],
  ["path", { ...PANDA_STROKE_ATTRIBUTES, d: "m15 12 2 2", key: "k60wz4" }],
  [
    "path",
    {
      ...PANDA_STROKE_ATTRIBUTES,
      d: "M18 6.5a.5.5 0 0 0-.5-.5",
      key: "1ch4h4",
    },
  ],
  [
    "path",
    {
      ...PANDA_STROKE_ATTRIBUTES,
      d: "M20.69 9.67a4.5 4.5 0 1 0-7.04-5.5 8.35 8.35 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5C2.49 11.2 2 12.88 2 14.5 2 19.47 6.48 22 12 22s10-2.53 10-7.5c0-1.62-.48-3.3-1.3-4.83",
      key: "1c660l",
    },
  ],
  [
    "path",
    {
      ...PANDA_STROKE_ATTRIBUTES,
      d: "M6 6.5a.495.495 0 0 1 .5-.5",
      key: "eviuep",
    },
  ],
  ["path", { ...PANDA_STROKE_ATTRIBUTES, d: "m9 12-2 2", key: "326nkw" }],
] as const satisfies IconSvgElement

function createIcon(icon: IconSvgElement, displayName: string): AppIcon {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { strokeWidth = SHADCN_HUGEICONS_STROKE_WIDTH, color = "currentColor", ...props },
    ref,
  ) {
    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        strokeWidth={strokeWidth}
        color={color}
        {...props}
      />
    )
  })
  Icon.displayName = displayName
  return Icon
}

export { HugeiconsIcon }
export type { IconSvgElement }

export const ALargeSmall = createIcon(ALargeSmallIconData, "ALargeSmall")
export const AlertCircle = createIcon(AlertCircleIconData, "AlertCircle")
export const AlertCircleIcon = createIcon(AlertCircleIconData, "AlertCircleIcon")
export const AlertTriangleIcon = createIcon(Alert02IconData, "AlertTriangleIcon")
/** Full-width justify lines; free pack TextAlignJustifyCenter matches (not *Left). */
export const AlignJustifyIcon = createIcon(
  TextAlignJustifyCenterIconData,
  "AlignJustifyIcon",
)
export const AlignLeftIcon = createIcon(AlignLeftIconData, "AlignLeftIcon")
export const AppWindow = createIcon(AppWindowIconData, "AppWindow")
export const AppWindowIcon = createIcon(AppWindowIconData, "AppWindowIcon")
export const ArrowDownIcon = createIcon(ArrowDown02IconData, "ArrowDownIcon")
export const ArrowLeft = createIcon(ArrowLeft02IconData, "ArrowLeft")
export const ArrowLeftIcon = createIcon(ArrowLeft02IconData, "ArrowLeftIcon")
export const ArrowRight = createIcon(ArrowRight02IconData, "ArrowRight")
export const ArrowRightIcon = createIcon(ArrowRight02IconData, "ArrowRightIcon")
export const ArrowUpRightIcon = createIcon(ArrowUpRight03IconData, "ArrowUpRightIcon")
export const BoldIcon = createIcon(TextBoldIconData, "BoldIcon")
export const BookAIcon = createIcon(BookAIconData, "BookAIcon")
export const BookOpen = createIcon(BookOpen01IconData, "BookOpen")
export const BookOpenIcon = createIcon(BookOpen01IconData, "BookOpenIcon")
export const BookOpenTextIcon = createIcon(BookOpen02IconData, "BookOpenTextIcon")
/** Sources rail — Hugeicons free Books02 (stacked books). */
export const Books02Icon = createIcon(Books02IconData, "Books02Icon")
/** Notebook (spiral pad) — free-pack `NotebookIcon` (exact user SVG). */
export const BookIcon = createIcon(NotebookIconData, "BookIcon")
export const Notebook = createIcon(NotebookIconData, "Notebook")
export const NotebookIcon = createIcon(NotebookIconData, "NotebookIcon")
export const NoteIcon = createIcon(NoteIconData, "NoteIcon")
export const Bookmark = createIcon(Bookmark02IconData, "Bookmark")
export const BookmarkIcon = createIcon(Bookmark02IconData, "BookmarkIcon")
/** Hugeicons free `BotIcon` (antenna + body + arms + eyes) — not Robot*. */
export const Bot = createIcon(BotIconData, "Bot")
export const BotMessageSquare = createIcon(BotMessageSquareIconData, "BotMessageSquare")
export const Boxes = createIcon(BoxesIconData, "Boxes")
export const BoxesIcon = createIcon(BoxesIconData, "BoxesIcon")
export const Brain = createIcon(BrainCircuitIconData, "Brain")
export const BrainIcon = createIcon(BrainCircuitIconData, "BrainIcon")
export const BugIcon = createIcon(Bug01IconData, "BugIcon")
export const Check = createIcon(Tick02IconData, "Check")
export const CheckCircle2 = createIcon(CheckmarkCircle02IconData, "CheckCircle2")
export const CheckIcon = createIcon(Tick02IconData, "CheckIcon")
export const ChevronDown = createIcon(ArrowDown01IconData, "ChevronDown")
export const ChevronDownIcon = createIcon(ArrowDown01IconData, "ChevronDownIcon")
export const ChevronRightIcon = createIcon(ArrowRight01IconData, "ChevronRightIcon")
export const ChevronUp = createIcon(ArrowUp01IconData, "ChevronUp")
export const ChevronUpIcon = createIcon(ArrowUp01IconData, "ChevronUpIcon")
export const ClipboardCopyIcon = createIcon(ClipboardCopyIconData, "ClipboardCopyIcon")
export const ClipboardPenLine = createIcon(ClipboardPenLineIconData, "ClipboardPenLine")
export const Clock3Icon = createIcon(Clock3IconData, "Clock3Icon")
export const CogIcon = createIcon(Settings01IconData, "CogIcon")
export const Compass = createIcon(Compass01IconData, "Compass")
/** Settings · Advanced nav — Hugeicons free CpuSettings. */
export const CpuSettingsIcon = createIcon(CpuSettingsIconData, "CpuSettingsIcon")
export const CopyIcon = createIcon(CopyIconData, "CopyIcon")
export const CornerUpLeftIcon = createIcon(CornerUpLeftIconData, "CornerUpLeftIcon")
export const Dna = createIcon(DnaIconData, "Dna")
/** Hugeicons free download-1 (`Download01Icon` / `DownloadIcon`) — tray + arrow. */
export const DownloadIcon = createIcon(Download01IconData, "DownloadIcon")
export const EllipsisIcon = createIcon(EllipsisIconData, "EllipsisIcon")
export const EraserIcon = createIcon(EraserIconData, "EraserIcon")
export const ExternalLinkIcon = createIcon(ExternalLinkIconData, "ExternalLinkIcon")
/** View / preview — Hugeicons free ScanImage (scan corners + image). */
export const Eye = createIcon(ScanImageIconData, "Eye")
export const FileIcon = createIcon(File01IconData, "FileIcon")
export const FileImageIcon = createIcon(FileImageIconData, "FileImageIcon")
export const FileQuestionIcon = createIcon(FileUnknownIconData, "FileQuestionIcon")
export const FileText = createIcon(File02IconData, "FileText")
export const FileTextIcon = createIcon(File02IconData, "FileTextIcon")
export const Folder = createIcon(Folder01IconData, "Folder")
export const FolderIcon = createIcon(Folder01IconData, "FolderIcon")
export const FolderOpen = createIcon(FolderOpenIconData, "FolderOpen")
export const FolderOpenIcon = createIcon(FolderOpenIconData, "FolderOpenIcon")
export const Gamepad2 = createIcon(Gamepad2IconData, "Gamepad2")
export const Gamepad2Icon = createIcon(Gamepad2IconData, "Gamepad2Icon")
export const GitBranch = createIcon(GitBranchIconData, "GitBranch")
export const Globe = createIcon(Globe02IconData, "Globe")
export const GraduationCapIcon = createIcon(GraduationCapIconData, "GraduationCapIcon")

export const GripVerticalIcon = createIcon(DragDropVerticalIconData, "GripVerticalIcon")
export const HandIcon = createIcon(HandIconData, "HandIcon")
export const HelpCircle = createIcon(HelpCircleIconData, "HelpCircle")
export const HighlighterIcon = createIcon(HighlighterIconData, "HighlighterIcon")
export const HistoryIcon = createIcon(HistoryIconData, "HistoryIcon")
export const Image = createIcon(Image01IconData, "Image")
export const ImageIcon = createIcon(Image01IconData, "ImageIcon")
export const ImagesIcon = createIcon(ImageCompositionIconData, "ImagesIcon")
export const Info = createIcon(InformationCircleIconData, "Info")
export const InfoIcon = createIcon(InformationCircleIconData, "InfoIcon")
export const ItalicIcon = createIcon(TextItalicIconData, "ItalicIcon")
export const KeyRound = createIcon(Key01IconData, "KeyRound")
export const LaptopIcon = createIcon(LaptopIconData, "LaptopIcon")
export const Layers = createIcon(Layers01IconData, "Layers")
export const Layers3Icon = createIcon(Layers02IconData, "Layers3Icon")
export const LayoutPanelLeftIcon = createIcon(LayoutLeftIconData, "LayoutPanelLeftIcon")
export const LayoutTemplateIcon = createIcon(Layout01IconData, "LayoutTemplateIcon")
export const Lightbulb = createIcon(BulbIconData, "Lightbulb")
export const LinkIcon = createIcon(Link01IconData, "LinkIcon")
export const ListIcon = createIcon(LeftToRightListBulletIconData, "ListIcon")
export const ListTodo = createIcon(CheckListIconData, "ListTodo")
export const ListChecksIcon = createIcon(CheckListIconData, "ListChecksIcon")
export const Loader2Icon = createIcon(Loading03IconData, "Loader2Icon")
export const LoaderCircleIcon = createIcon(Loading03IconData, "LoaderCircleIcon")
export const MapIcon = createIcon(MapsIconData, "MapIcon")
export const Maximize2Icon = createIcon(ArrowExpandIconData, "Maximize2Icon")
export const MessageSquare = createIcon(Message01IconData, "MessageSquare")
export const MessageSquareIcon = createIcon(Message01IconData, "MessageSquareIcon")
export const MessageSquareTextIcon = createIcon(Message02IconData, "MessageSquareTextIcon")
export const Minimize2Icon = createIcon(ArrowShrinkIconData, "Minimize2Icon")
export const MinusIcon = createIcon(MinusSignIconData, "MinusIcon")
export const MoonIcon = createIcon(Moon02IconData, "MoonIcon")
export const Music2Icon = createIcon(MusicNote01IconData, "Music2Icon")
/** Hugeicons free NeuralNetwork (nodes + edges). */
export const Network = createIcon(NeuralNetworkIconData, "Network")
export const PaintbrushIcon = createIcon(PaintBrush02IconData, "PaintbrushIcon")
export const PanelLeftIcon = createIcon(PanelLeftIconData, "PanelLeftIcon")
export const PanelRightIcon = createIcon(PanelRightIconData, "PanelRightIcon")
export const PanelsTopLeftIcon = createIcon(LayoutTopIconData, "PanelsTopLeftIcon")
/** Buddy brand panda — do not replace with a generic “thinking” icon. */
export const Panda = createIcon(BuddyPandaIconData, "Panda")
export const PauseIcon = createIcon(PauseIconData, "PauseIcon")
export const PenLineIcon = createIcon(PencilEdit01IconData, "PenLineIcon")
export const PencilIcon = createIcon(PencilEdit01IconData, "PencilIcon")
export const PencilLineIcon = createIcon(PencilEdit01IconData, "PencilLineIcon")
export const PencilRuler = createIcon(PencilRulerIconData, "PencilRuler")
export const PictureInPicture2Icon = createIcon(PictureInPictureOnIconData, "PictureInPicture2Icon")
export const PinIcon = createIcon(PinIconData, "PinIcon")
export const PlayIcon = createIcon(PlayIconData, "PlayIcon")
export const PlugIcon = createIcon(Plug01IconData, "PlugIcon")
export const PlusIcon = createIcon(Add01IconData, "PlusIcon")
export const PowerIcon = createIcon(PowerIconData, "PowerIcon")
export const Presentation = createIcon(Presentation01IconData, "Presentation")
export const PresentationIcon = createIcon(Presentation01IconData, "PresentationIcon")
export const PrinterIcon = createIcon(PrinterIconData, "PrinterIcon")
export const BlocksIcon = createIcon(BlocksIconData, "BlocksIcon")
export const Redo2Icon = createIcon(Redo03IconData, "Redo2Icon")
export const RefreshCwIcon = createIcon(ArrowReloadHorizontalIconData, "RefreshCwIcon")
export const RotateCcwIcon = createIcon(RotateLeft01IconData, "RotateCcwIcon")
export const SaveIcon = createIcon(SaveIconData, "SaveIcon")
export const ScaleIcon = createIcon(JusticeScale01IconData, "ScaleIcon")
export const ScanText = createIcon(ScanIconData, "ScanText")
export const SchoolIcon = createIcon(School01IconData, "SchoolIcon")
export const ScrollText = createIcon(ScrollIconData, "ScrollText")
export const ScrollTextIcon = createIcon(ScrollIconData, "ScrollTextIcon")
export const Search = createIcon(SearchIconData, "Search")
export const SearchIcon = createIcon(SearchIconData, "SearchIcon")
export const SearchXIcon = createIcon(SearchRemoveIconData, "SearchXIcon")
export const SendHorizontalIcon = createIcon(SentIconData, "SendHorizontalIcon")
export const Settings = createIcon(SettingsIconData, "Settings")
/** Settings · General nav — Hugeicons free Settings05 (sliders in square). */
export const Settings05Icon = createIcon(Settings05IconData, "Settings05Icon")
/** Hugeicons free Shapes01 (triangle + circle + rounded square). */
export const ShapesIcon = createIcon(Shapes01IconData, "ShapesIcon")
export const ShieldAlert = createIcon(Shield02IconData, "ShieldAlert")
export const Sigma = createIcon(Summation01IconData, "Sigma")
export const SlidersHorizontalIcon = createIcon(SlidersHorizontalIconData, "SlidersHorizontalIcon")
export const Sparkles = createIcon(SparklesIconData, "Sparkles")
export const SparklesIcon = createIcon(SparklesIconData, "SparklesIcon")
/** Practice rail — Hugeicons free StudyLamp. */
export const StudyLampIcon = createIcon(StudyLampIconData, "StudyLampIcon")
/** Hugeicons free PencilEdit02 (pen + document corner). */
export const SquarePen = createIcon(PencilEdit02IconData, "SquarePen")
export const SquarePenIcon = createIcon(PencilEdit02IconData, "SquarePenIcon")
export const SunIcon = createIcon(Sun01IconData, "SunIcon")
export const TableOfContents = createIcon(LeftToRightListBulletIconData, "TableOfContents")
/** Settings · Standards nav — Hugeicons free Teaching. */
export const TeachingIcon = createIcon(TeachingIconData, "TeachingIcon")
export const Terminal = createIcon(TerminalIconData, "Terminal")
export const Trash2Icon = createIcon(Delete02IconData, "Trash2Icon")
export const TriangleAlertIcon = createIcon(Alert02IconData, "TriangleAlertIcon")
export const TrophyIcon = createIcon(Award01IconData, "TrophyIcon")
export const Undo2Icon = createIcon(Undo03IconData, "Undo2Icon")
/** Hugeicons free upload-1 (`Upload01Icon`) — tray + arrow up. */
export const UploadIcon = createIcon(Upload01IconData, "UploadIcon")
/** Hugeicons free UserIcon (head circle + shoulders arc). */
export const UserRoundIcon = createIcon(UserIconData, "UserRoundIcon")
export const VideoIcon = createIcon(Video01IconData, "VideoIcon")
export const Volume2Icon = createIcon(VolumeHighIconData, "Volume2Icon")
/** Hugeicons free VolumeMute02 (speaker + X). */
export const VolumeXIcon = createIcon(VolumeMute02IconData, "VolumeXIcon")
/** Hugeicons free WorkflowSquare08 (three nodes + connector). */
export const WorkflowIcon = createIcon(WorkflowSquare08IconData, "WorkflowIcon")
export const Wrench = createIcon(WrenchIconData, "Wrench")
export const WrenchIcon = createIcon(WrenchIconData, "WrenchIcon")
export const XCircle = createIcon(CancelCircleIconData, "XCircle")
export const XCircleIcon = createIcon(CancelCircleIconData, "XCircleIcon")
export const XIcon = createIcon(Cancel01IconData, "XIcon")
export const ZapIcon = createIcon(ZapIconData, "ZapIcon")
export const ZoomInIcon = createIcon(SearchAddIconData, "ZoomInIcon")
export const ZoomOutIcon = createIcon(SearchMinusIconData, "ZoomOutIcon")
