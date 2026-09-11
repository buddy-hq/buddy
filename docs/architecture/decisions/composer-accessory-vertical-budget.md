# Composer and accessory vertical budget

## Status and scope

This is the durable design record for vertical space shared by the chat transcript, prompt
composer, and above-composer surfaces. It preserves the screen-size research from 2026-07-24;
the runtime policy is implemented by
[`COMPOSER_ACCESSORY_LAYOUT`](../../../packages/web/src/components/prompt/composer-accessory-layout.ts).

## Decision

The responsive input is the actual chat-pane/container height, not the advertised panel resolution,
physical display resolution, or the whole Electron window's `vh`. The chat pane owns one vertical
budget for the transcript, composer, and accessory surfaces.

- Keep a minimum usable transcript region.
- Give Tasks, Game, and Sketch one shared accessory host and shared maximum.
- Let short content hug its content, but scroll large content inside the shared host.
- Minimize an accessory when the host cannot provide a usable expanded height.
- Derive regular/compact composer density from pane height, not only from Bench mode.
- Include attachments, permissions, questions, queued follow-ups, errors, and notices in the same
  budget.

## Why physical resolution is insufficient

Buddy lays out in CSS/logical pixels. Windows display scaling commonly uses 100%, 125%, or 150%,
so a 1920 × 1080 panel yields approximately 1080, 864, or 720 logical vertical pixels. macOS
Retina displays likewise expose a user-adjustable logical “Looks like” resolution. Users can also
resize the window, reserve OS chrome, or move chat into a smaller floating Bench container; device
model detection is therefore the wrong strategy.

| Scenario | Effective logical height | Base transcript budget* | With max Tasks | With Game/Sketch |
|---|---:|---:|---:|---:|
| 1920 × 1080 Windows at 150% | 720 px | 502 px | 182 px | **62 px** |
| 1366 × 768 Windows at 100% | 768 px | 550 px | 230 px | **110 px** |
| 1920 × 1080 Windows at 125% | 864 px | 646 px | 326 px | 206 px |
| MacBook Air 13 default | about 956 px | 738 px | 418 px | 298 px |
| MacBook Pro 14 default | about 982 px | 764 px | 444 px | 324 px |
| MacBook Air 15 default | about 1107 px | 889 px | 569 px | 449 px |
| MacBook Pro 16 default | about 1117 px | 899 px | 579 px | 459 px |

\* Best-case estimate: effective height minus a 52 px titlebar and an empty 166 px regular
composer; OS chrome, attachments, and other in-flow surfaces are not subtracted. The large
accessories are currently overlays, so the last columns estimate the transcript left unobscured;
without a shared flow budget they can occlude the transcript.

India desktop traffic makes the 768 px case material: Statcounter reported 1366 × 768 at 7.55%
of Indian desktop screen-resolution traffic in June 2026. This is traffic evidence, not a laptop
installed-base claim.

## Current bounds that drive the policy

| Surface | Current bound |
|---|---:|
| Titlebar | 52 px in the regular Directory chat shell |
| Regular composer region | about 166–322 px, before attachments and wrapping |
| Compact composer region | about 138–202 px |
| Tasks | up to 320 px |
| Game / Sketch | fixed 440 px today; shared host should cap large accessories at 440 px |
| Floating Bench chat | preferred total panel height 420–520 px, with a 40 px header and compact composer |

At 420–520 px floating height, the conversation content is about 380–480 px; after an empty
compact composer it is only about 242–342 px, before Tasks or Game/Sketch. A 320 px Tasks surface
or 440 px Game/Sketch surface can therefore leave no usable transcript space and must scroll,
minimize, or otherwise yield to the host budget.

## Compatibility set and sources

At minimum, validate 1366 × 768 at 100%; 1920 × 1080 at 125% and 150%; MacBook logical heights
around 956–1117 px; manually resized windows; docked Bench; and floating Bench chat.

- [Microsoft display guidance](https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/display)
- [Microsoft DPI-related APIs and registry settings](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/dpi-related-apis-and-registry-settings?view=windows-11)
- [MacBook Air 13-inch technical specifications](https://support.apple.com/en-euro/122209)
- [MacBook Air 15-inch technical specifications](https://support.apple.com/en-la/122210)
- [MacBook Pro 14-inch technical specifications](https://support.apple.com/en-ca/125405)
- [MacBook Pro 16-inch technical specifications](https://support.apple.com/en-ca/111901)
- [Statcounter desktop screen-resolution statistics for India](https://gs.statcounter.com/screen-resolution-stats/desktop/india)
