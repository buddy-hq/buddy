import { useState, type ReactNode } from "react"
import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Z_INDEX,
  cn,
} from "@buddy/ui"
import { ThemeSelectors } from "./theme-selectors"
import { findCatalogID } from "./easel/select-value"
import {
  GALLERY_SURFACES,
  gallerySurface,
  isGallerySurfaceID,
  type GallerySurfaceID,
} from "./ui-gallery/gallery-primitives"
import { SurfacesStory } from "./ui-gallery/surfaces-story"
import { TextInputsStory } from "./ui-gallery/text-inputs-story"
import { SelectStory } from "./ui-gallery/select-story"
import { SelectionControlsStory } from "./ui-gallery/selection-controls-story"
import { ButtonsStory } from "./ui-gallery/buttons-story"

type UIGalleryStoryID = "surfaces" | "text-inputs" | "select" | "selection-controls" | "buttons"

type UIGalleryStoryConfig = {
  id: UIGalleryStoryID
  label: string
  subtitle: string
  render: () => ReactNode
}

const UI_GALLERY_STORIES: UIGalleryStoryConfig[] = [
  {
    id: "surfaces",
    label: "Surfaces · elevation ladder",
    subtitle:
      "Live token readings for every stacking surface, with the composited color and relative luminance of each rung",
    render: () => <SurfacesStory />,
  },
  {
    id: "text-inputs",
    label: "Input · text fields",
    subtitle:
      "Input and Textarea across rest, placeholder, hover, focus, disabled, readonly and invalid",
    render: () => <TextInputsStory />,
  },
  {
    id: "select",
    label: "Select · triggers & menus",
    subtitle:
      "Radix Select and NativeSelect across sizes and states, with grouped, popper and scrolling menus",
    render: () => <SelectStory />,
  },
  {
    id: "selection-controls",
    label: "Selection · switch, checkbox, radio, toggle",
    subtitle: "Binary and segmented controls across checked, disabled and invalid states",
    render: () => <SelectionControlsStory />,
  },
  {
    id: "buttons",
    label: "Button & Badge",
    subtitle: "Every variant against every size, plus icon, loading and disabled states",
    render: () => <ButtonsStory />,
  },
]

const DEFAULT_STORY_ID: UIGalleryStoryID = "surfaces"
const DEFAULT_SURFACE_ID: GallerySurfaceID = "page"

function storyConfig(id: UIGalleryStoryID): UIGalleryStoryConfig {
  return UI_GALLERY_STORIES.find((config) => config.id === id) ?? UI_GALLERY_STORIES[0]
}

function SurfaceBand(props: { surfaceID: GallerySurfaceID; children: ReactNode }) {
  const surface = gallerySurface(props.surfaceID)

  return (
    <section className={cn("min-w-0", surface.className)}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-weaker-base/60 bg-inherit px-4 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-weaker">
          {surface.label}
        </span>
        <code className="font-mono text-[10px] text-text-weak">{surface.token}</code>
      </div>
      {props.children}
    </section>
  )
}

export function DevToolsUITab() {
  const [story, setStory] = useState<UIGalleryStoryID>(DEFAULT_STORY_ID)
  const [surfaceID, setSurfaceID] = useState<GallerySurfaceID>(DEFAULT_SURFACE_ID)
  const [compareSurfaces, setCompareSurfaces] = useState(false)

  const active = storyConfig(story)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-weaker-base px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <Select
            value={story}
            onValueChange={(value) => {
              const nextStory = findCatalogID(value, UI_GALLERY_STORIES)
              if (nextStory) setStory(nextStory)
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-auto w-fit border-none bg-transparent px-0 py-0 text-xs font-medium text-text-base hover:bg-transparent focus-visible:ring-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }}>
              {UI_GALLERY_STORIES.map((config) => (
                <SelectItem key={config.id} value={config.id} className="text-xs">
                  {config.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="truncate text-[11px] text-text-weaker">{active.subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="ui-gallery-compare" className="text-xs text-text-weak">
            All surfaces
          </label>
          <Switch
            id="ui-gallery-compare"
            size="sm"
            checked={compareSurfaces}
            aria-label="Render the story on every surface at once"
            onCheckedChange={setCompareSurfaces}
          />
          <Select
            value={surfaceID}
            onValueChange={(value) => {
              if (isGallerySurfaceID(value)) setSurfaceID(value)
            }}
            disabled={compareSurfaces}
          >
            <SelectTrigger size="sm" aria-label="Surface" className="w-28 text-xs">
              <SelectValue placeholder="Surface" />
            </SelectTrigger>
            <SelectContent style={{ zIndex: Z_INDEX.devtoolsFloating }}>
              {GALLERY_SURFACES.map((surface) => (
                <SelectItem key={surface.id} value={surface.id} className="text-xs">
                  {surface.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ThemeSelectors compact />
          <Badge variant="outline">UI</Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {compareSurfaces ? (
          GALLERY_SURFACES.map((surface) => (
            <SurfaceBand key={surface.id} surfaceID={surface.id}>
              {active.render()}
            </SurfaceBand>
          ))
        ) : (
          <div className={cn("min-h-full min-w-0", gallerySurface(surfaceID).className)}>
            {active.render()}
          </div>
        )}
      </div>
    </div>
  )
}
