# Chemfig craft (backend node-tikzjax)

Use when layout carries chemical meaning: projections, chairs, exact bond angles, coordination geometry, resonance, or short mechanism steps.

Do not use for ethanol-level connectivity. Use `smiles` instead.

## Route by diagram

| Diagram | Chemfig pattern |
| --- | --- |
| Fischer projection | One vertical chain direction; horizontal substituent branches at `0` and `180` degrees |
| Newman projection | Front and rear tripods 120° apart; rear tripod offset 60°; one C–C axis per fence |
| Haworth projection | Hook-closed ring plus shortened Cram bonds for perspective |
| Chair conformation | Hook-closed explicit-angle chain; add axial/equatorial branches |
| Exact wedge/dash structure | Plain Cram bond `<` or `>`; dashed Cram bond `<:` or `>:` |
| Coordination geometry | Central atom with one explicit angled branch per ligand |
| Resonance contributors | One short `\chemfig` per contributor inside `\schemestart` / `\schemestop` |
| Electron flow | Named Chemfig nodes plus `\chemmove`; one elementary step per block |

Never switch to freeform SVG because Chemfig is difficult. Simplify the native source or split the explanation into multiple chemistry blocks.

## Product constraints

- Fence language: `chemfig`.
- Source: chemfig drawing markup only.
- **Forbidden:** `\documentclass`, `\usepackage`, `\input`, `\write`, shell, full TeX documents (Buddy denylists unsafe control sequences).
- Heavier than Indigo: timeouts / TeX / dvi failures possible → **fallback to SMILES** if layout is not essential.

## Syntax habits

- Keep sources **short** — one structure or one simple arrow step.
- Source must be **chemfig markup** (typically `\chemfig{…}`). Bare atom strings without `\chemfig` will not render as structures.
- In Markdown fences use a single TeX backslash: `\chemfig{…}` (not `\\chemfig`).
- Buddy wraps the document; do not emit `\begin{document}` yourself.
- Do not emit TeX document/package/def/io controls (`\documentclass`, `\usepackage`, `\begin`, `\input`, `\write`, …) — denylisted as `unsafe_source`.
- Put a bond operator before every angled connection: `-[:90]Cl`, not `[:90]Cl`.
- Write branches as `(-[:<angle>]<atom>)`.
- Use absolute angles for projections and coordination geometry. Do not alternate the main-chain direction accidentally.
- Cram bonds: `>` / `<` plain wedge, `>:` / `<:` dashed wedge, `>|` / `<|` hollow wedge.
- Use one structure, contributor, or elementary step per fence.
- Prefer SMILES for ethanol-level teaching molecules.
- Avoid full publication multi-step electron-pushing diagrams (timeouts/TeX failures).
- On failure: simplify or split essential layouts. Switch to SMILES only when layout is not essential.

## Backend-tested patterns

These sources render through Buddy's Chemfig backend.

### Coordination ligands

````markdown
```chemfig alt="Octahedral cobalt complex"
\chemfig{Co(-[:90]Cl)(-[:210]NH_3)(-[:330]NH_3)(-[:30]NH_3)(-[:150]NH_3)(-[:-90]Cl)}
```
````

### Fischer projection

Keep every vertical step at `-90`; place each horizontal pair at `0` and `180`.

````markdown
```chemfig alt="D-glucose Fischer projection"
\chemfig{CHO-[:-90](-[:0]OH)(-[:180]H)-[:-90](-[:0]H)(-[:180]OH)-[:-90](-[:0]OH)(-[:180]H)-[:-90](-[:0]OH)(-[:180]H)-[:-90]CH_2OH}
```
````

### Chair conformation

Use `?` hooks to close the explicit-angle chain.

````markdown
```chemfig alt="Alpha-D-glucose chair conformation"
\chemfig{?(-[:190]OH)-[:-50](-[:170]OH)-[:10](-[:-55,0.7]OH)-[:-10](-[6,0.7]OH)-[:130]O-[:190]?(-[:150,0.7]-[2,0.7]OH)}
```
````

### Haworth projection

````markdown
```chemfig alt="D-glucopyranose Haworth projection"
\chemfig[cram width=2pt]{HO-[2,0.5,2]?<[7,0.7](-[2,0.5]OH)-[,,,,line width=2pt](-[6,0.5]OH)>[1,0.7](-[6,0.5]OH)-[3,0.7]O-[4]?(-[2,0.3]-[3,0.5]OH)}
```
````

### Wedge and dash

````markdown
```chemfig alt="Wedge and dash stereochemistry"
\chemfig{CH_3-C(<[:120]OH)(<:[:60]H)-CH_2-CH_3}
```
````

### Resonance contributors

````markdown
```chemfig alt="Carboxylate resonance contributors"
\schemestart\chemfig{O=C-O^{-}}\arrow{<->}\chemfig{^{-}O-C=O}\schemestop
```
````

## Newman and electron-flow limits

- Newman: use explicit 120° front/rear tripods; offset rear substituents by 60°. Keep all atom labels and bonds in Chemfig.
- Electron flow: use Chemfig named nodes and `\chemmove` only for a short elementary step.
- Treat `\chemmove` overlays as fragile. If placement fails, show separate native structures plus prose; never redraw the chemistry as freeform SVG.

## When not to use

- Ordinary connectivity → `smiles`
- Typed equation → `\ce`
- Multi-frame lesson drawing without atom layout need → whiteboard
