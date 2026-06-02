
# Andhra Pradesh — SCERT textbooks

**Authority:** Andhra Pradesh State Council of Educational Research and Training (SCERT)  
**Official domain:** `scert.ap.gov.in` only  
**Fetch family:** `api-platform` / browser recon (stub)  
**Promotion:** `stub` — no verified anonymous textbook PDF path

Use this reference when the user wants Andhra Pradesh/AP SCERT textbook material, but treat it as an official-source boundary reference rather than a known direct-PDF source. It helps the agent try the official AP SCERT portal, document timeouts or unreachable official pages, and return `inconclusive` instead of guessing textbook URLs on other hosts.

## Official domains

| Surface | URL |
|---------|-----|
| SCERT portal (primary) | `https://scert.ap.gov.in/SCERT/` |
| SCERT root | `https://scert.ap.gov.in/` |

## Discovery workflow

1. Attempt `curl` or browser load of official SCERT URLs above (25s+ timeout acceptable to document).
2. If connection times out or TLS fails, set `fetch_status: inconclusive` — **do not** guess textbook paths on other hosts.
3. If portal loads, inspect menus/network for textbook sections; only fetch PDFs linked from official HTML.
4. Government pages may cite SCERT — still require on-domain verification.

## Fetch

- **No stable curl path** when `scert.ap.gov.in` is unreachable (connection timeout).
- When unreachable: `local_path` empty; `verification_status: inconclusive`; note timeout in `notes`.
- When reachable in future: follow official menus only; verify `%PDF` before `fetched`.

### Connectivity signals

| Signal | Observed |
|--------|----------|
| DNS | `scert.ap.gov.in` resolves (e.g. `103.129.73.80`) |
| TCP | `:443` connect times out (~25–30s); curl exit **28**; `time_connect: 0` — not a DNS miss |
| Browser | `/SCERT/` and root may fail with `chrome-error://chromewebdata/` or navigation errors (`GUEST_VIEW_MANAGER_CALL`) when host never loads |

Probe both `https://scert.ap.gov.in/SCERT/` and root; if DNS resolves but TCP never completes, stay on-domain and report `inconclusive` — do not switch hosts or infer outage from gov citations alone.

## Verify

| Outcome | When |
|---------|------|
| `inconclusive` | Official domain unreachable or textbook section not found |
| `fetched` | Only if on-domain PDF verified as requested material |
| `not_found` | Domain reachable but no matching class/subject path |

## Disambiguation

| User says | Action |
|-----------|--------|
| AP SCERT textbooks | Start `scert.ap.gov.in/SCERT/` |
| Class 8 maths AP | Same portal; no URL guessing |

## Known gaps

- Portal timeout from some networks — retry with browser from the user’s network before claiming permanent outage; browser may fail the same way when TCP never completes.
- Cannot confirm whether SCERT publishes textbooks online, or fetch a class/subject PDF (e.g. class 8 maths), without on-domain portal HTML — answer `inconclusive`, not “unavailable.”
- Third-party mirrors out of scope per `SKILL.md`.

## Negative tests

- Do not invent `https://scert.ap.gov.in/uploads/Class8_Math.pdf` or similar.
- Do not substitute NCERT or other state boards for AP SCERT.
