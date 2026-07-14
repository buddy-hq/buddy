# SMILES and reaction-smiles craft (Indigo)

## SMILES (`smiles`)

One line, no spaces. Connectivity only — layout is Indigo’s job.

### Core craft

| Rule | Example |
| --- | --- |
| Chain | `CCC` propane |
| Branch | `CC(C)C` isobutane |
| Double/triple | `C=C`, `C#C` |
| Ring digits | `C1CCCCC1` cyclohexane |
| Aromatic | `c1ccccc1` benzene |
| Hetero | `CCO` ethanol; `CC(=O)O` acetic acid |
| Charge | `[NH4+]`, `[OH-]` |

### Habits

- Prefer short, readable SMILES (stable backbone; avoid needless complexity).
- Aromatic lower-case for ordinary aromatic teaching (`c1ccccc1` benzene) unless Kekulé form is the lesson.
- Stereo (`@`, `/`, `\`) only when stereochemistry is the point.
- Prefer `smiles` for ordinary teaching molecules.
- Ionic salts as formulas → `\ce{NaCl}` / `\ce{NaCl(aq)}`, not a forced bond-line SMILES, unless the solid-state network is the point.

### Bad → good

| Bad | Why | Better |
| --- | --- | --- |
| Multi-line SMILES | Rejected | One line |
| `A>B` in smiles fence | Reaction | `reaction-smiles` with three sections |
| Fence language `smile` / `reaction_smiles` | Not supported | `smiles` / `reaction-smiles` |
| Invented garbage atoms | Indigo fail | Real Daylight-style SMILES |

## CXSMILES (`cxsmiles`)

Same line rules + ChemAxon-style extensions. **Default to `smiles`** unless an extension is required for the lesson.

This renderer only accepts limited S-group types in CX (`Sg:n`, `Sg:gen`). Other S-groups fail — use KET or plain SMILES instead.

Do not put reaction roles (`>` sections) in `cxsmiles`; use `reaction-smiles`.

## Reaction SMILES (`reaction-smiles`)

Daylight-style roles. Buddy requires **exactly three** `>`-separated sections:

```text
reactants>agents>products
```

**Reactants and products must be non-empty.** Agents may be empty:

```text
CCO>>CC=O
```

Invalid:

```text
CCO>CC=O
>>CC=O
CCO>>
```

### Habits

- One transform per fence for teaching.
- One line; **no spaces** anywhere (including around `>`).
- Multi-molecule in one role: **dot-separated** disconnected components (`.`), not commas.
  - Good: `CCO.O>>CC=O` or `C=CCBr.[Na+].[OH-]>>C=CCO`
  - Bad: `CCO,O>>CC=O`
- Agents = catalyst/solvent/info — not a full mechanism.
- Pair with `\ce` when stoichiometry text helps; fence is the **diagram**.

### Fence examples

Empty agents:

````markdown
```reaction-smiles alt="Ethanol to acetaldehyde sketch"
CCO>>CC=O
```
````

With agent section:

````markdown
```reaction-smiles alt="Oxidation with agent noted"
CCO>[O]>CC=O
```
````

### Fail recovery

- Wrong `>` count → rewrite to three sections with non-empty reactants and products.
- Comma multi-species → rewrite with `.` component separators.
- Empty reactants or products → fill both ends.
- Indigo parse error → simplify molecules; check aromatic/valence.
