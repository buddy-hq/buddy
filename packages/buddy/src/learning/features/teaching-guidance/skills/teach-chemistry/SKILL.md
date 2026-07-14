---
name: teach-chemistry
description: "Chemistry display: formulas, structures, stereochemical projections, reaction schemes, mechanisms, chemistry SVG files; never freeform chemical drawings."
---

# Teach Chemistry

Use for chemical formulas, structures, projections, reaction schemes, mechanisms, and chemistry SVG files. Load before emitting chemistry fences, chemfig, or `render_svg` chemistry files.

## Chemistry-native boundary

- Use a chemistry-native format when correctness depends on atom identity, connectivity, bond order, stereochemistry, formal charge, coordination geometry, resonance, or electron flow.
- Never use `render_freeform_figure`, `render_figure`, Mermaid, HTML, whiteboard, or hand-authored SVG to draw those chemical features.
- General visual tools may organize or explain the surrounding concept. Keep every chemical structure in a chemistry fence.
- If one native block cannot express the request, split it into chemistry blocks plus prose or mhchem.
- Authoring difficulty is not permission to switch to freeform SVG.

Do **not** announce this skill or its section names to the learner.

---

# 1. Buddy product rules

## Fast routing

| Requested visual | Format |
| --- | --- | --- |
| Formula, charge, isotope, balanced equation, conditions, units | mhchem: `\ce{…}` / `\pu{…}` in math |
| Ordinary molecule, ion, aromatic structure, bond order | `smiles` |
| R/S or E/Z structure when SMILES stereo is sufficient | `smiles` |
| One reactant → product transformation | `reaction-smiles` |
| Multistep synthesis | One `reaction-smiles` fence per step |
| Fischer, Newman, Haworth, chair, exact wedge-dash layout | `chemfig` |
| Coordination geometry or deliberately positioned ligands | `chemfig` |
| Resonance contributors requiring exact layout | Separate `chemfig` structures |
| Curved-arrow mechanism or electron flow | One short `chemfig` block per elementary step |
| Existing coordinate-preserving KET document supplied as source | `ket` |
| Standalone chemistry image file for MDX, PDF, or slides | `render_svg` with a native chemistry format |
| Energy-level, reaction-coordinate, orbital-splitting, titration, rate, or phase graph | `render_figure` when its schema fits; otherwise freeform |
| Apparatus, electrochemical-cell layout, orbital illustration | HTML, whiteboard, or freeform; keep molecular structures native |
| Chemical process flow without atom connectivity | Mermaid |
| Interactive simulation | HTML widget |

Prefer `smiles` over `chemfig` when connectivity alone answers the question. Preserve the requested projection or spatial layout when it carries meaning.

## Required reference read

Choose the format first. Before writing its source, read the owning reference:

| Chosen format | Read before authoring |
| --- | --- |
| mhchem: `\ce` / `\pu` | `references/mhchem.md` |
| `smiles`, `cxsmiles`, `reaction-smiles` | `references/smiles-and-reactions.md` |
| `chemfig` | `references/chemfig.md` |
| `ket` | `references/advanced-formats.md` |
| `render_svg` file output | `references/advanced-formats.md`, then the reference for its selected `format` |

- Never emit a chemistry fence or mhchem source from this summary alone.
- Read every owning reference when one response uses multiple formats.
- Do not read unrelated references. No chemistry source needed → no reference read.

**Supported fence languages (closed set):**
`smiles` · `cxsmiles` · `reaction-smiles` · `ket` · `chemfig`

**Never invent:** `inchi`, `smarts`, `sdf`, `cml`, `lewis`, `smile`, `reaction_smiles`, `smiles-reaction`.

**Engines (you never call them directly):**


| Format | Engine | Owner |
| --- | --- | --- |
| `smiles`, `cxsmiles`, `reaction-smiles`, `ket` | Indigo (`indigo-ketcher` worker) | browser |
| `chemfig` | node-tikzjax TeX→DVI→SVG | Buddy backend `POST /chemistry/chemfig/render` |
| `\ce` / `\pu` | KaTeX + `katex/contrib/mhchem` | markdown math |

## How to emit (chat / MDX)

**mhchem** — math delimiters only:

```markdown
$\ce{H2O}$
$$\ce{2H2 + O2 -> 2H2O}$$
```

**Structure fence** — language = format id; optional `alt`:

````markdown
```smiles alt="Ethanol"
CCO
```
````

- **You** write the source. Never require the learner to author SMILES/chemfig.
- One idea per fence. After render, teach in prose — do not paste SVG.
- Unsupported fence languages stay plain code.

## `render_svg` (file only)

Use **only** when a worksheet, deck, PDF, or export needs a real `.svg` file.

```json
{
  "filePath": "/absolute/path/to/ethanol.svg",
  "format": "smiles",
  "source": "CCO"
}
```

- Absolute `filePath` ending in `.svg`; exact `format`; unfenced `source`.
- Creates a normal filesystem file — not a Buddy object. Add alt text at the image usage site in MDX.
- **Size-only changes:** edit the SVG or MDX `width` / layout. Do not re-call for resize alone.
- Full MDX example: `teaching-resource-authoring` → `references/buddy-mdx-support.md`.

## Reliability notes

- chemfig is heavier (timeouts, TeX/dvi failures). Prefer SMILES when connectivity is enough.
- Indigo rejects bad valence / bad reaction shape — fix source and re-fence.
- Do not freehand KET for chat; prefer SMILES unless an existing KET document must be preserved.

## Relationship to other skills

- **`teaching-resource-authoring`** — worksheets, quizzes, tests, labs, handouts, study guides for teachers/students (Bench MDX). Use this skill’s display rules **inside** those artifacts.
- **`whiteboard-authoring`** — multi-frame drawing pedagogy; not for atom connectivity (use chemistry fences).
- **This skill** — chemistry display craft + format contracts in chat/MDX.

---

# 2. Chemistry teaching with diagrams

## Teaching heuristics

- Be proactive when language is spatial: “this carbon,” “leaving group,” “attack at…,” “the equation is…”.
- **Progressive disclosure:** one structure or equation that advances the lesson per turn when tutoring — not five fences at once.
- **Ideal turn:** emit one structure/equation → teach it in a short prose beat → one check (predict atom count, functional group, or next product).
- Lead with the visual when it reduces confusion; use chat to walk through it.
- Compare with **two fences** (e.g. reactant vs product) rather than one overloaded scheme when teaching change.
- Equation vs structure: stoichiometry / ions / balance → `\ce`; bond-line identity → fence.
- Name ↔ formula ↔ structure confusion: show **two** of the three (usually `\ce` + one `smiles`).
- Do **not** fence pure mole/stoichiometry word problems unless a structure or scheme removes confusion.
- After a diagram, ask or check understanding; don’t only dump structures.

## Guardrails

- Supported fence languages only: `smiles`, `cxsmiles`, `reaction-smiles`, `ket`, `chemfig`.
- Never invent: `inchi`, `smarts`, `sdf`, `cml`, `lewis`, `smile`, `reaction_smiles`, `smiles-reaction`.
- Never put reaction `>` in a `smiles` or `cxsmiles` fence — use `reaction-smiles`.
- Never multi-line in `smiles` / `cxsmiles` / `reaction-smiles`.
- Do not use fences as `\ce` substitutes, or `\ce` as structure diagrams.
- Never substitute `render_figure` or freeform SVG for chemistry structures.
- Do not call `render_svg` for chat-only or native fence-capable MDX display.
- On error: fix the native source and re-emit. Simplify or split essential layouts; use SMILES only when layout is not essential.

## Output

Concise teaching. mhchem for formulas/equations; fences for structures/schemes when they reduce confusion.

---

# 3. Format craft (summary)

Use this section only to choose a format. Read its owning reference before writing source.

### mhchem (`\ce` / `\pu`)

- Math delimiters: `$…$` / `\(…\)` inline; `$$…$$` / `\[…\]` display.
- Formulae, charges, isotopes, arrows (`->`, `<=>`), conditions `\ce{A ->[H2O] B}`.
- Prefer `\ce` over hand-faked subscripts for chemistry text.
- Not for bond-line structures.

### `smiles` / `cxsmiles`

- One line; no spaces; branches `()`; rings with digit pairs; aromatic rings often lower-case.
- Bonds: omit single; `=` `#`; stereo only when teaching stereo.
- Prefer plain `smiles` unless CX extensions required. This renderer only supports limited CX S-groups (`Sg:n`, `Sg:gen`); otherwise use KET or plain SMILES.
- Reaction roles with `>` → **`reaction-smiles`** only — never put multi-role reaction strings in `smiles` or `cxsmiles`.

### `reaction-smiles`

- One line. **Exactly three** sections: `reactants>agents>products`.
- **Reactants and products required** (non-empty). Agents may be empty: `CCO>>CC=O`.
- Agents non-empty example: `CCO>[O]>CC=O` (reagent/condition as agent when useful).
- Invalid: `CCO>CC=O` (two sections); `>>CC=O` or `CCO>>` (empty end).
- Multiple molecules in one role: **dot-separated** (`.`), not commas — e.g. `CCO.O>>CC=O`.
- Draws a **scheme SVG**, not a typed equation.

### `chemfig`

- Source is chemfig drawing markup, typically `\chemfig{…}` (related chemfig macros only) — not bare SMILES, not a full TeX document.
- No `\documentclass`, `\input`, packages, shell, or `\begin{document}`. Buddy wraps the document.
- Use for projections, chairs, exact angles, coordination geometry, and short mechanism steps. Prefer SMILES for ordinary molecules.
- Keep short; avoid full publication-style multi-step electron-pushing art (timeouts/TeX failures).

### `ket`

- JSON **object** with non-empty `root.nodes` and valid `$ref` targets (see `references/advanced-formats.md`).
- Source must be non-empty after trim. Prefer SMILES / reaction-smiles unless an existing KET document must be preserved.
