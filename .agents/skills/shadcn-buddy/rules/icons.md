# Icons

**Buddy uses Hugeicons for icons.** Prefer importing stable wrapper components from `@buddy/ui` (e.g. `CheckIcon`, `XIcon`, `PlusIcon`) so consumer-facing names stay consistent. For primitives and new one-off icons, use the official shadcn Hugeicons pattern below.

```tsx
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { SHADCN_HUGEICONS_STROKE_WIDTH } from "@buddy/ui"

// Official shadcn CLI default: strokeWidth={2}
<HugeiconsIcon icon={Cancel01Icon} strokeWidth={SHADCN_HUGEICONS_STROKE_WIDTH} className="..." />
```

**Defaults (shadcn official):**

| Prop | Value | Source |
|------|--------|--------|
| `strokeWidth` | `2` | shadcn CLI `iconLibraries.hugeicons.usage` |
| `color` | `currentColor` (package default) | `@hugeicons/react` |
| sizing | CSS `size-*` / parent `[&_svg]` — do not pass `size` prop unless needed | shadcn components |

**Icon *names* per component** must match the official radix-nova `IconPlaceholder` `hugeicons="..."` attrs (not a global Lucide rename). Verify with:

```bash
bun ./script/verify-shadcn-hugeicons.ts
```

Stable wrappers from `@buddy/ui` already render that pattern:

```tsx
import { CheckIcon, XIcon, PlusIcon } from "@buddy/ui"
// Common names are re-exported as thin Hugeicons wrappers from packages/ui/src/icons.tsx
```

When a wrapper does not exist yet, import icon *data* from `@hugeicons/core-free-icons` and pass it to `HugeiconsIcon`, or add a wrapper in `packages/ui/src/icons.tsx` and re-export it from `packages/ui/src/index.ts`.

---

## Icons in Button use data-icon attribute

Add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix) to the icon. No sizing classes on the icon.

**Incorrect:**

```tsx
<Button>
  <PlusIcon className="mr-2 size-4" />
  Add
</Button>
```

**Correct:**

```tsx
<Button>
  <PlusIcon data-icon="inline-start"/>
  Add
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end"/>
</Button>
```

---

## No sizing classes on icons inside components

Components handle icon sizing via CSS. Don't add `size-4`, `w-4 h-4`, or other sizing classes to icons inside `Button`, `DropdownMenuItem`, `Alert`, `Sidebar*`, or other shadcn components. Unless the user explicitly asks for custom icon sizes.

**Incorrect:**

```tsx
<Button>
  <PlusIcon className="size-4" data-icon="inline-start" />
  Add
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  Settings
</DropdownMenuItem>
```

**Correct:**

```tsx
<Button>
  <PlusIcon data-icon="inline-start" />
  Add
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  Settings
</DropdownMenuItem>
```

---

## Pass icons as component objects or Hugeicons data, not string keys

Use a component (`icon={CheckIcon}`) or Hugeicons icon data (`icon={Tick02Icon}` on `HugeiconsIcon`), not a string key to a lookup map.

**Incorrect:**

```tsx
const iconMap = {
  check: CheckIcon,
  alert: AlertIcon,
}

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon />
}

<StatusBadge icon="check" />
```

**Correct:**

```tsx
// Prefer stable wrappers from @buddy/ui when available.
import { CheckIcon } from "@buddy/ui"

function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />
}

<StatusBadge icon={CheckIcon} />
```

```tsx
// Or the official Hugeicons pattern for new / one-off icons.
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
```
