---
name: fetch-indian-competition-papers
description: "Indian competitive exam papers: JEE, NEET, UPSC, SSC, banking, state PSC — past papers, previous year papers, answer keys, provisional keys."
---

# Fetch Indian Competition Papers

Router for official, freely downloadable Indian competitive exam question papers and answer keys. Routes to per-exam leaves; owns no fetch logic.

## Use when / scope

Use when the user wants official question papers, answer keys, or paper archives for Indian competitive exams: JEE, NEET, UPSC, SSC, banking, state PSCs.

This skill is a router. It selects the right leaf and enforces universal guardrails. Per-exam domains, archive patterns, and failure modes live in the leaves.

Not for: coaching sites, third-party mirrors, paid portals, login-gated resources, admit cards, response sheets, syllabus notes, unofficial answer keys, CDS, NDA, BITSAT (out of scope for v1). Do not bypass paywalls, auth, or CAPTCHA.

## Routing table

| Exam family | Leaf | One-line |
| --- | --- | --- |
| JEE Main (NTA) | `references/engineering/jee-main.md` | NTA JEE Main papers, shifts, sessions. |
| JEE Advanced (IIT) | `references/engineering/jee-advanced.md` | IIT JEE Advanced paper 1/2 archives. |
| NEET UG (NTA) | `references/medical/neet.md` | NTA NEET UG papers and answer keys. |
| UPSC CSE | `references/civil-services/upsc-cse.md` | UPSC CSE prelims/mains papers only. |
| SSC (CGL/CHSL/CPO) | `references/govt/ssc.md` | SSC CGL, CHSL, CPO question papers. |
| Banking (IBPS/SBI/RBI) | `references/banking/banking.md` | IBPS, SBI, RBI notifications/calendars; full papers usually not public (CBT) → expect `source_gap`. |
| State PSCs | `references/state-psc/state-psc.md` | State public service commissions, 19 states. |

Read the matched leaf before fetching. Leaves own per-exam domains, URL patterns, and honest failure modes.

## Guardrails

- Official sources only. Government / exam-board domains; no coaching aggregators, no mirrors.
- Never fabricate URLs, papers, or answer keys. Report honest status when unavailable.
- Never bypass login, paywall, CAPTCHA, or admit-card auth. Report and stop.
- No bulk archive harvesting. Targeted per-year, per-session, per-subject requests only.
- Verify every result: HTTP 200, expected `Content-Type`, non-empty body.
- **Body inspection mandatory for papers and answer keys.** URL HEAD is not enough. Run `pdftotext` on every downloaded PDF; confirm it contains exam content (questions, answer mappings, booklet headers). A scanned-image notice PDF with no text layer is NOT a paper or answer key. Never label a notice `fetched` or `verified`.
- **Image-scan PDF verification.** When `pdftotext` returns empty (image scan, no text layer), verify content via one of: (a) `pdftoppm` to split PDF into page images, then read the images directly if you are an image-capable model; (b) `tesseract` OCR on page 1; (c) filename + link-text + HTTP metadata match. Do not treat an empty text layer as a failure for question papers — many official PSCs publish scanned booklets.
- Fail closed on unresolved sources. Prefer honest status over guessed links.

## Metadata contract

Every result returns these fields. Identity fields come from the user request; status fields from the fetch.

- `title`, `exam`, `year` — required identity.
- `session`, `paper`, `subject`, `stage`, `medium` — identity when relevant.
- `source_url` — direct download URL when available.
- `landing_url` — official page where the link was discovered.
- `local_path` — path if Buddy saved the file.
- `format` — PDF, ZIP, etc.
- `fetch_status` — one of: `fetched`, `source_gap`, `listing_only`, `auth_required`, `paywall`, `not_found`.
- `verification_status` — one of: `verified`, `unreachable`, `unexpected_type`.
- `extraction_date` — ISO date of discovery.
- `notes` — caveats (e.g., "English only", "Answer key in same PDF").

## Runtime pipeline

1. **Identify** — match exam family to leaf; confirm year, session, stage, subject, medium.
2. **Route** — read the matched leaf for domain and archive pattern.
3. **Discover** — find the official page for the requested paper.
4. **Resolve** — find the most specific official download link.
5. **Verify** — GET the URL; check HTTP 200, `Content-Type`, non-empty body. Run `pdftotext` on PDFs; confirm exam content present. Notices and press releases are not papers or keys.
6. **Return** — metadata + download instruction; Buddy chooses the local path.

## Progressive disclosure

This body is routing + guardrails + metadata contract only. Per-exam details, domain lists, URL patterns, and failure modes live in the leaves. Do not duplicate leaf content here.
