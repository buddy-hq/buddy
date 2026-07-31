# Skill Icon Design System

The canonical icon plan is [`skill-icon-design-system.yaml`](./skill-icon-design-system.yaml). Exact generation provenance is in [`skill-icon-generation-prompts.yaml`](./skill-icon-generation-prompts.yaml).

## Non-Negotiables

Every source image has three visible layers:

1. A flat `#00FF00` chroma-key canvas, visible only outside the icon.
2. A complete, opaque, regular rounded-square app-icon base.
3. One centered symbol for the skill.

Remove only the chroma canvas. The base must remain a centered, unbroken rounded square with four even corners: never fold, clip, bend, cut, hollow, or warp it. Keep the symbol simple, centered, and readable at `36 px`.

Use finished 3D solid materials, soft studio lighting, and short contact shadows. Do not use glass, frost, chrome, holographic effects, bloom, lens flare, glowing rims, or third-party logos.

Do not default subjects to paper, cards, plaques, or folded-corner documents. Use a document form only when the skill directly handles documents, and keep it rigid, flat, and unbent with no dog-eared corner.

Give the model exactly one short, broad base-color cue so neighboring skills do not collapse to the same default. Do not provide a full palette, multiple shade instructions, or literal color values. The sole exact color is the exterior chroma-key canvas: `#00FF00`.

Generate a square chroma-key master, remove its background at full resolution, then normalize the complete visible icon to a centered `400x400` maximum footprint on the `512x512` transparent canvas. Package it according to the YAML filename contract. The visual principles follow [Apple's App Icon guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons/): one core idea, centered focal content, restrained detail, and depth built from layers.

Built-in icon assets live in `bundled/` and ship with Electron. Catalog icon sources live in `catalog/` and are published as content-addressed assets by the signed skill-artifact workflow.
