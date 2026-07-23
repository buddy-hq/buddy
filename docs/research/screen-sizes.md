# Screen-size and chat vertical-space research

Date: 2026-07-24

## Executive conclusion

Buddy does not currently have one container-owned vertical budget for the transcript, prompt
composer, and above-composer surfaces.

- The empty regular composer occupies about 166 CSS px and can grow to about 322 CSS px before
  attachments, selection chips, warnings, or other extra content.
- The composer does not switch density based on screen or chat-pane height. Compact mode is enabled
  specifically for floating Bench chat.
- Tasks is partially viewport-responsive, but Game and Sketch are fixed at 440 CSS px.
- Permission, question, follow-up, and terminal-error surfaces are content-sized with no shared
  maximum.
- The problem is most severe on Windows laptops using 125% or 150% display scaling, short/resized
  windows, and floating Bench chat. It is not Windows-specific.

The responsive input must be the actual chat-pane height, not the advertised panel resolution and
not the whole Electron window's `vh`.

## Measurement model

### Physical pixels are not layout pixels

Electron lays Buddy out in CSS/logical pixels. Native panel resolution therefore does not directly
describe the space available to Buddy.

- macOS presents Retina displays through a logical "Looks like" resolution. Apple normally hides
  the scaling percentage from the user.
- Windows exposes display scaling directly, commonly as 100%, 125%, or 150%. A DPI-aware
  application receives proportionally fewer logical layout pixels as scaling increases.
- Users can change display scaling, resize Buddy, use OS chrome, or put chat in a smaller floating
  container. Device model detection would therefore be the wrong implementation strategy.

### Windows scaling examples

For a 1920 × 1080 panel, the approximate effective layout resolution is the native resolution
divided by the scale factor:

| Windows scale | Approximate logical layout | Logical vertical space |
| --- | ---: | ---: |
| 100% | 1920 × 1080 | 1080 px |
| 125% | 1536 × 864 | 864 px |
| 150% | 1280 × 720 | 720 px |

Microsoft documents supported Windows scale factors including 100%, 125%, and 150%, and separately
notes a target of at least 720 effective vertical lines for applications after scaling.

Sources:

- [Microsoft display guidance](https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/display)
- [Microsoft DPI-related APIs and registry settings](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/dpi-related-apis-and-registry-settings?view=windows-11)

## Laptop display data

Native resolutions below are official Apple specifications. Default logical resolutions are common
macOS defaults reported by platform references; Apple does not list them on the current technical
specification pages, users can change them, and they must not be treated as guaranteed runtime
viewport sizes.

| Device family | Native panel resolution | Common default logical resolution |
| --- | ---: | ---: |
| MacBook Air 13.6-inch | 2560 × 1664 | about 1470 × 956 |
| MacBook Air 15.3-inch | 2880 × 1864 | about 1710 × 1107 |
| MacBook Pro 14.2-inch | 3024 × 1964 | 1512 × 982 |
| MacBook Pro 16.2-inch | 3456 × 2234 | 1728 × 1117 |

Official native-resolution sources:

- [MacBook Air 13-inch technical specifications](https://support.apple.com/en-euro/122209)
- [MacBook Air 15-inch technical specifications](https://support.apple.com/en-la/122210)
- [MacBook Pro 14-inch technical specifications](https://support.apple.com/en-ca/125405)
- [MacBook Pro 16-inch technical specifications](https://support.apple.com/en-ca/111901)

Logical-resolution references:

- [Apple Community discussion of the 13-inch Air's 1470 × 956 default](https://discussions.apple.com/thread/255933885)
- [MacBook Air Apple-silicon display table](https://en.wikipedia.org/wiki/MacBook_Air_%28Apple_silicon%29)
- [14-inch and 16-inch MacBook Pro default Retina resolutions](https://9to5mac.com/2021/10/19/new-macbook-pro-screen-resolution-options/)

## India-specific evidence

Statcounter reported 1366 × 768 as 7.55% of Indian desktop screen-resolution traffic in June 2026.
This is web-traffic data for desktop-class devices, not a laptop installed-base measurement, but it
shows that 768-pixel-high layouts remain material rather than purely historical.

Source:

- [Statcounter desktop screen-resolution statistics for India](https://gs.statcounter.com/screen-resolution-stats/desktop/india)

The practical compatibility set should consequently include at least:

- 1366 × 768 at 100% scaling;
- 1920 × 1080 at 125% scaling, yielding about 864 logical px vertically;
- 1920 × 1080 at 150% scaling, yielding about 720 logical px vertically;
- MacBook logical heights around 956–1117 px;
- manually resized windows and the smaller floating Bench chat container.

## Buddy's current vertical sizing

### Titlebar

The normal Directory chat shell reserves 52 CSS px for Buddy's titlebar:

- [`packages/web/src/components/directory-chat/directory-chat-shell.tsx`](../../packages/web/src/components/directory-chat/directory-chat-shell.tsx)

### Prompt composer

The prompt editor currently uses fixed CSS-pixel minimums and maximums:

| Part | Regular | Compact |
| --- | ---: | ---: |
| Editable area | 84–240 px | 56–120 px |
| Toolbar in its normal one-row state | about 44 px | about 44 px |
| Rounded composer surface | about 128–284 px | about 100–164 px |
| Bottom status/action row | about 34 px | about 34 px |
| Current bottom margin | 4 px | 4 px |
| Whole base composer region | **about 166–322 px** | **about 138–202 px** |

Source:

- [`packages/web/src/components/prompt/prompt-composer.tsx`](../../packages/web/src/components/prompt/prompt-composer.tsx)
- [`packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx`](../../packages/web/src/components/prompt/components/prompt-composer-toolbar.tsx)

These are base measurements, not a total-height guarantee. The following can add more height outside
the editor's maximum:

- up to eight native-resource attachments;
- image attachments and wrapping attachment rows;
- selection/context chips;
- unsupported-attachment warnings;
- a pending-steer badge;
- width-induced wrapping.

Compact mode is currently selected by floating Bench layout, not by screen or chat-pane height:

- [`packages/web/src/components/directory-chat/directory-workspace-root.tsx`](../../packages/web/src/components/directory-chat/directory-workspace-root.tsx)

### Above-composer surfaces

| Surface | Current sizing | Height-responsive? |
| --- | --- | --- |
| Tasks list | Content-sized, capped at `min(320px, 50vh)` | Partially |
| Tasks board | `min(320px, 50vh)` | Partially |
| Game | Fixed 440 px | No |
| Sketch dock | Fixed 440 px | No |
| Sketch maximized on Bench | Fills its Bench host | Yes |
| Shared `ComposerDock` `auto` | Content-sized, max 60vh | Partially |
| Shared `ComposerDock` `sm` | Fixed 300 px | No |
| Shared `ComposerDock` `md` | Fixed 440 px | No |
| Shared `ComposerDock` `lg` | 60vh with a 500 px minimum | Can remain too tall |

Sources:

- [`packages/ui/src/components/ui/composer-dock.tsx`](../../packages/ui/src/components/ui/composer-dock.tsx)
- [`packages/web/src/components/prompt/todo-dock.tsx`](../../packages/web/src/components/prompt/todo-dock.tsx)
- [`packages/web/src/components/game/game-dock.tsx`](../../packages/web/src/components/game/game-dock.tsx)
- [`packages/web/src/components/prompt/sketch-dock.tsx`](../../packages/web/src/components/prompt/sketch-dock.tsx)

Tasks also contains `@media(max-height: 640px)` and `@media(max-height: 480px)` density adjustments.
Both those media queries and `vh` use the whole Electron viewport. They do not describe the size of a
smaller nested chat pane, especially floating Bench chat.

### Other in-flow bottom surfaces

The following surfaces correctly participate in the main-pane flex layout instead of overlaying the
transcript, but they have no shared vertical budget:

| Surface | Current height behavior |
| --- | --- |
| Permission | Intrinsic; body content and path lists can grow |
| Question | Intrinsic; question options and the review step can grow |
| Queued follow-ups | Expanded by default; each queued item adds height |
| Terminal error | Intrinsic; expanded raw details can grow substantially |
| Compaction/revert notices | Small individually, but can stack with other surfaces |

Source:

- [`packages/web/src/components/directory-chat/directory-chat-main-pane.tsx`](../../packages/web/src/components/directory-chat/directory-chat-main-pane.tsx)

## Current fit calculations

### Assumptions

The table below deliberately uses a generous best case:

- effective screen height is treated as Buddy's complete `window.innerHeight`;
- the 52 px Buddy titlebar and an empty 166 px regular composer are subtracted;
- OS menu bars, Docks, taskbars, window borders, attachments, selections, permissions, questions,
  follow-ups, errors, and notices are not subtracted;
- Tasks is shown at its 320 px maximum;
- Game and Sketch use their fixed 440 px height.

Formula:

```text
base transcript budget = effective height - 52px titlebar - 166px composer
unobscured with Tasks   = base transcript budget - 320px
unobscured with Game    = base transcript budget - 440px
```

The large composer surfaces are currently absolutely positioned. Therefore the DOM transcript
height does not actually shrink when they open; the final two columns estimate the transcript area
left unobscured by the overlay. If these surfaces moved into normal flow without a shared budget,
the same numbers would instead approximate the remaining transcript height.

| Device or scaling scenario | Effective logical height | Base transcript budget | With max Tasks | With Game/Sketch |
| --- | ---: | ---: | ---: | ---: |
| 1080p Windows at 150% | 720 px | 502 px | 182 px | **62 px** |
| 1366 × 768 Windows at 100% | 768 px | 550 px | 230 px | **110 px** |
| 1080p Windows at 125% | 864 px | 646 px | 326 px | 206 px |
| MacBook Air 13 default | about 956 px | 738 px | 418 px | 298 px |
| MacBook Pro 14 default | about 982 px | 764 px | 444 px | 324 px |
| MacBook Air 15 default | about 1107 px | 889 px | 569 px | 449 px |
| MacBook Pro 16 default | about 1117 px | 899 px | 579 px | 459 px |

Actual available transcript space will normally be lower than these estimates.

### Floating Bench chat

Buddy's floating chat policy currently prefers a total panel height of 420–520 px, depending on the
Bench profile and available viewport. Its own header consumes 40 px, and it uses the compact
composer.

Approximate budget:

```text
floating conversation content = 380–480px
after empty compact composer   = 242–342px
after 320px Tasks              = -78–22px
after 440px Game/Sketch        = -198–-98px
```

A negative value means the expanded surface cannot coexist in normal flow with the current chat
chrome. Today it instead occludes the transcript.

Source:

- [`packages/web/src/lib/bench-layout-policy.ts`](../../packages/web/src/lib/bench-layout-policy.ts)
- [`packages/web/src/components/directory-chat/directory-chat-bench-page-layout.tsx`](../../packages/web/src/components/directory-chat/directory-chat-bench-page-layout.tsx)

## Product and implementation implications

The evidence does not support per-device or per-document fixes.

The systemic direction is:

1. Make the chat pane, rather than each document, own the vertical budget.
2. Size against the actual pane/container height rather than `vh`.
3. Guarantee a minimum transcript region.
4. Give Tasks, Game, and Sketch one shared accessory host and shared maximum.
5. Allow short content to hug its content, but make large content scroll inside the shared host.
6. Minimize the accessory automatically when the host cannot provide a usable expanded height.
7. Derive regular/compact composer density from pane height, not only from Bench layout mode.
8. Account for attachments and all other in-flow bottom surfaces in the same budget.

This preserves one responsive policy across macOS, Windows scaling, resized windows, docked Bench,
and floating Bench chat.
