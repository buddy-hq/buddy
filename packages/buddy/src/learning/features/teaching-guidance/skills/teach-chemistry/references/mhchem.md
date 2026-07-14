# mhchem craft (KaTeX)

Buddy loads `katex/contrib/mhchem` with chat/Bench math. Use inside normal math delimiters.

## Patterns

| Job | Example |
| --- | --- |
| Formula | `$\ce{H2O}$` |
| Charge | `$\ce{CrO4^2-}$` |
| Complex ion | `$\ce{[AgCl2]-}$` |
| Isotope | `$\ce{^{227}_{90}Th+}$` |
| Equation | `$$\ce{2H2 + O2 -> 2H2O}$$` |
| Conditions | `$\ce{A ->[H2O] B}$` / `$\ce{A ->[{text}][{below}] B}$` |
| Equilibrium | `$\ce{A <=> B}$` |
| State | `$\ce{H2(aq)}$` |
| Units | `$\pu{75.3 J//mol K}$` |

## Good habits

- Prefer `\ce{…}` for chemical text over raw `H_2O` hacks.
- Keep equations readable: spaces around `+` and arrows as mhchem accepts.
- Upright labels: `{text}` inside `\ce` when needed.
- Math escape: `$…$` inside `\ce` for italics/variables when required.

## Avoid

- Using `\ce` as a bond-line structure diagram → fence.
- Organic mechanism **steps as typed equations** can stay in `\ce`; bond-line **identity** still needs a fence.
- Overlong multi-step mechanisms in one equation → split steps or use structures.
- Inventing unsupported mhchem macros.

## Fail recovery

Simplify the expression; fix unmatched braces; retry. Do not “fix” by inventing a SMILES fence for a stoichiometry problem.
