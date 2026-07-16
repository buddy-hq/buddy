import { forwardRef } from "react"
import type { ComponentPropsWithoutRef } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import { SHADCN_HUGEICONS_STROKE_WIDTH } from "@buddy/ui/lib/icon-defaults"
import {
  ArchiveIcon as ArchiveIconData,
  ArrowDown01Icon as ArrowDown01IconData,
  ArrowLeft01Icon as ArrowLeft01IconData,
  ArrowRight01Icon as ArrowRight01IconData,
  ArrowUp01Icon as ArrowUp01IconData,
  // *02 variants preserve the two-stroke line-and-tip arrow silhouette.

  ArrowUpDownIcon as ArrowUpDownIconData,
  BookOpen01Icon as BookOpenIconData,
  NotebookIcon as NotebookIconData,

  Cancel01Icon as Cancel01IconData,
  CheckmarkCircle02Icon as CheckmarkCircle02IconData,
  CircleQuestionMarkIcon as CircleQuestionMarkIconData,
  Clock3Icon as Clock3IconData,
  CopyIcon as CopyIconData,

  EllipsisIcon as EllipsisIconData,
  FileSlidersIcon as FileSlidersIconData,
  NoteEditIcon as NoteEditIconData,
  Folder01Icon as FolderIconData,
  FolderAddIcon as FolderAddIconData,
  FolderOpenIcon as FolderOpenIconData,
  Home01Icon as HomeIconData,
  Mail01Icon as MailIconData,

  MoveLeftIcon as MoveLeftIconData,
  PanelLeftCloseIcon as PanelLeftCloseIconData,
  PanelLeftOpenIcon as PanelLeftOpenIconData,
  PanelRightCloseIcon as PanelRightCloseIconData,
  PanelRightOpenIcon as PanelRightOpenIconData,
  PinIcon as PinIconData,
  PlusSignIcon as PlusSignIconData,
  SearchRemoveIcon as SearchRemoveIconData,
  SlidersHorizontalIcon as SlidersHorizontalIconData,
  SparklesIcon as SparklesIconData,
  SquareIcon as SquareIconData,
  Target01Icon as TargetIconData,
  Tick02Icon as Tick02IconData,
  ZapIcon as ZapIconData,
  Add01Icon as Add01IconData,
  ArrowDown02Icon as ArrowDown02IconData,
  ArrowExpandIcon as ArrowExpandIconData,
  ArrowLeft02Icon as ArrowLeft02IconData,
  ArrowRight02Icon as ArrowRight02IconData,
  ArrowUp02Icon as ArrowUp02IconData,
  BrainCircuitIcon as BrainCircuitIconData,
  Download01Icon as Download01IconData,
  MailOpen02Icon as MailOpen02IconData,
  MessageMultiple02Icon as MessageMultiple02IconData,
  PencilEdit01Icon as PencilEdit01IconData,
  PencilEdit02Icon as PencilEdit02IconData,
  BotIcon as BotIconData,
  SettingsIcon as SettingsIconData,
} from "@hugeicons/core-free-icons"

export type IconProps = Omit<ComponentPropsWithoutRef<typeof HugeiconsIcon>, "icon">

function createIcon(icon: IconSvgElement, displayName: string) {
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

/** Consumer-stable icon components. */
export const ArchiveIcon = createIcon(ArchiveIconData, "ArchiveIcon")
export const ArrowUpDownIcon = createIcon(ArrowUpDownIconData, "ArrowUpDownIcon")
export const ArrowUpIcon = createIcon(ArrowUp02IconData, "ArrowUpIcon")
export const ArrowDownIcon = createIcon(ArrowDown02IconData, "ArrowDownIcon")
export const ArrowLeftIcon = createIcon(ArrowLeft02IconData, "ArrowLeftIcon")
export const ArrowRightIcon = createIcon(ArrowRight02IconData, "ArrowRightIcon")
export const BookOpenIcon = createIcon(BookOpenIconData, "BookOpenIcon")
/** Notebook (spiral pad) — Hugeicons free `NotebookIcon`; used for Buddy notebooks. */
export const BookIcon = createIcon(NotebookIconData, "BookIcon")
export const NotebookIcon = createIcon(NotebookIconData, "NotebookIcon")
/** Hugeicons free `BotIcon` — not Robot*. */
export const BotIcon = createIcon(BotIconData, "BotIcon")
export const BrainIcon = createIcon(BrainCircuitIconData, "BrainIcon")
export const CheckIcon = createIcon(Tick02IconData, "CheckIcon")
export const CircleCheckIcon = createIcon(CheckmarkCircle02IconData, "CircleCheckIcon")
export const ChevronDownIcon = createIcon(ArrowDown01IconData, "ChevronDownIcon")
export const ChevronLeftIcon = createIcon(ArrowLeft01IconData, "ChevronLeftIcon")
export const ChevronRightIcon = createIcon(ArrowRight01IconData, "ChevronRightIcon")
export const CircleQuestionMarkIcon = createIcon(CircleQuestionMarkIconData, "CircleQuestionMarkIcon")
export const Clock3Icon = createIcon(Clock3IconData, "Clock3Icon")
export const CopyIcon = createIcon(CopyIconData, "CopyIcon")
/** Hugeicons free download-1 (`Download01Icon`). */
export const DownloadIcon = createIcon(Download01IconData, "DownloadIcon")
export const EllipsisIcon = createIcon(EllipsisIconData, "EllipsisIcon")
export const ExpandIcon = createIcon(ArrowExpandIconData, "ExpandIcon")
export const FolderIcon = createIcon(FolderIconData, "FolderIcon")
export const FolderOpenIcon = createIcon(FolderOpenIconData, "FolderOpenIcon")
export const FolderPlusIcon = createIcon(FolderAddIconData, "FolderPlusIcon")
export const HomeIcon = createIcon(HomeIconData, "HomeIcon")
export const MailIcon = createIcon(MailIconData, "MailIcon")
export const MailOpenIcon = createIcon(MailOpen02IconData, "MailOpenIcon")
export const MoveLeftIcon = createIcon(MoveLeftIconData, "MoveLeftIcon")
export const PanelLeftCloseIcon = createIcon(PanelLeftCloseIconData, "PanelLeftCloseIcon")
export const PanelLeftOpenIcon = createIcon(PanelLeftOpenIconData, "PanelLeftOpenIcon")
export const PanelRightCloseIcon = createIcon(PanelRightCloseIconData, "PanelRightCloseIcon")
export const PanelRightOpenIcon = createIcon(PanelRightOpenIconData, "PanelRightOpenIcon")
export const PencilIcon = createIcon(PencilEdit01IconData, "PencilIcon")
export const PinIcon = createIcon(PinIconData, "PinIcon")
export const PlusIcon = createIcon(Add01IconData, "PlusIcon")
export const SearchXIcon = createIcon(SearchRemoveIconData, "SearchXIcon")
export const SettingsIcon = createIcon(SettingsIconData, "SettingsIcon")
export const SlidersHorizontalIcon = createIcon(SlidersHorizontalIconData, "SlidersHorizontalIcon")
export const SparklesIcon = createIcon(SparklesIconData, "SparklesIcon")
export const SquareIcon = createIcon(SquareIconData, "SquareIcon")
/** Hugeicons free PencilEdit02 (pen + document). */
export const SquarePenIcon = createIcon(PencilEdit02IconData, "SquarePenIcon")
export const TargetIcon = createIcon(TargetIconData, "TargetIcon")
export const FileSlidersIcon = createIcon(FileSlidersIconData, "FileSlidersIcon")
export const ZapIcon = createIcon(ZapIconData, "ZapIcon")
export const XIcon = createIcon(Cancel01IconData, "XIcon")
export const MessagesSquareIcon = createIcon(MessageMultiple02IconData, "MessagesSquareIcon")

export { HugeiconsIcon }
export type { IconSvgElement }

/**
 * Raw Hugeicons free icon data for `<HugeiconsIcon icon={...} strokeWidth={2} />`.
 * Named with free-package identifiers so they do not collide with component wrappers above.
 */
export {
  ArrowDown01IconData as ArrowDown01Icon,
  ArrowLeft01IconData as ArrowLeft01Icon,
  ArrowRight01IconData as ArrowRight01Icon,
  ArrowUp01IconData as ArrowUp01Icon,
  NotebookIconData as Book01Icon,
  BookOpenIconData as BookOpen01Icon,
  NotebookIconData as NotebookIconRaw,
  Cancel01IconData as Cancel01Icon,
  CheckmarkCircle02IconData as CheckmarkCircle02Icon,
  Download01IconData as Download01Icon,
  NoteEditIconData as NoteEditIcon,
  FolderAddIconData as FolderAddIcon,
  FolderIconData as Folder01Icon,
  HomeIconData as Home01Icon,
  MailIconData as Mail01Icon,
  MessageMultiple02IconData as MessageMultiple01Icon,
  PlusSignIconData as PlusSignIcon,
  SearchRemoveIconData as SearchRemoveIcon,
  SettingsIconData as Settings01Icon,
  TargetIconData as Target01Icon,
  Tick02IconData as Tick02Icon,
}
