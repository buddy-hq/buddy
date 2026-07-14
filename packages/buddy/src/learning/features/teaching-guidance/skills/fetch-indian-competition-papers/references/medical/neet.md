# NEET — Fetch Official NEET (UG) Papers & Answer Keys

**Exam family:** NEET (UG) — National Eligibility cum Entrance Test (Undergraduate)
**Conducted by:** National Testing Agency (NTA)
**Official domain:** `https://neet.nta.nic.in/`
**Leaf version:** 1.0
**Discovery date:** 2026-07-13 (live-verified)

---

## What this leaf can and cannot get

| Asset | Public? | Status | How |
|-------|---------|--------|-----|
| **Answer keys** (provisional + final) | YES | `fetched` | Direct PDF on neet.nta.nic.in → S3waas CDN. No login. |
| **Question papers** | NO | `auth_required` / `source_gap` | Candidate login only ("Question Paper with Recorded Responses"). The public `question-paper-2020` category is **empty**. |
| **OMR / recorded responses** | NO | `auth_required` | Candidate-specific. Out of scope. |
| **Information bulletin / syllabus** | YES | (sibling, not a paper) | Public PDFs, but not a target of this skill. |

**Bottom line:** fetch **official answer keys**. Do **not** fetch question papers without admit-card login — out of scope. Report the gap honestly.

---

## Official surface (use only these hosts)

- `neet.nta.nic.in` — NEET portal, documents, categories.
- `www.nta.ac.in` — NTA parent (cross-exam notices; links back to NEET portal).
- `cdnbbsr.s3waas.gov.in` — government S3waas CDN where the actual PDFs live.

**Never use** coaching sites (Allen, Aakash, Vedantu, Physics Wallah, Shiksha, Gradeup, AffairsCloud), any third-party mirror, any non-government host.

---

## How to find answer keys (the fetchable asset)

NEET answer keys are published as **public PDFs**. NTA releases a **provisional** key (open to challenge) then a **final** key. Both are direct downloads.

### Steps

1. **Fetch the documents hub:**
   `https://neet.nta.nic.in/documents/`
   Scan the category list for the target year. Category slugs follow patterns:
   - `neetug-YYYY-public-notices` (e.g. `neetug-2025-public-notices`)
   - `public-notice-YYYY` (e.g. `public-notice-2022`)
   - `archive` (catch-all for 2022/2023 items)

2. **Open the matching category page** for the requested year, e.g.
   `https://neet.nta.nic.in/document-category/neetug-2025-public-notices/`

3. **Grep the HTML for answer-key anchors.** PDFs are `<a>` tags pointing at
   `https://cdnbbsr.s3waas.gov.in/.../uploads/YYYY/MM/<id>.pdf`. Match link text containing
   `Answer Key` (case-insensitive). Distinguish:
   - `Provisional Answer Keys for NEET(UG)-YYYY`
   - `Final Answer Keys for NEET(UG)-YYYY`
   - `Challenge of Provisional Answer Key ...` — this is a **notice**, not the key itself.

4. **Verify the PDF** with a HEAD or GET:
   - Expect HTTP 200.
   - Expect `content-type: application/pdf`.
   - Expect non-zero `content-length`.
   If any check fails → `verification_status: unreachable` / `unexpected_type`.

5. **Return metadata** (see contract below). Let Buddy choose the local save path.

### Live-verified examples (2026-07-13)

| Year | Type | URL |
|------|------|-----|
| 2022 | final | `https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2022/09/2022090743.pdf` |
| 2025 | provisional | `https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2025/06/2025060369.pdf` |
| 2025 | final | `https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/2025/06/2025061450.pdf` |

All returned HTTP 200, `application/pdf`, non-empty. Use these as ground-truth probes.

### URL pattern (for resolution, not guessing)

`https://cdnbbsr.s3waas.gov.in/s37bc1ec1d9c3426357e69acd5bf320061/uploads/{YYYY}/{MM}/{numeric-id}.pdf`

The `{numeric-id}` is **not predictable** — do not synthesize URLs. Always resolve from a live category page. The bucket prefix `s37bc1ec1d9c3426357e69acd5bf320061` is stable for the NEET site.

---

## How to find question papers (the honest gap)

**No public, no-login NEET question-paper download exists.** Handle as follows:

1. If the user asks for a **question paper**:
   - Check `https://neet.nta.nic.in/document-category/question-paper-2020/` — it exists but is **empty** (only sidebar generic items: Information Bulletin, Syllabus). As of 2026-07-13 it hosts **zero** question-paper PDFs.
   - NTA's mechanism is "Display of Question Paper with Recorded Responses for Answer Key Challenge", served via **candidate login** (application number + DOB) on the NTA exam portal. That is `auth_required`.
   - **Return `auth_required`** (preferred, since the mechanism exists behind login) or `source_gap` if the year has no such window at all. Do **not** return a coaching-site PDF. Do **not** claim a download that does not exist.

2. If the user asks for "the paper" loosely and an **answer key** is available, offer the answer key as the closest official, freely-available artifact and note that the question paper itself is login-gated.

---

## NEET (UG) 2026 note

- NEET (UG) 2026 main exam: 03 May 2026. **Re-examination: 21 June 2026** (live notices on the documents page confirm this date).
- As of 2026-07-13, the documents page shows only **conduct/admit-card/dress-code/biometric notices** for the 2026 re-exam. **No 2026 answer key or question paper is public yet.**
- When the 2026 answer key is released, expect it under a `neetug-2026-public-notices` (or similar) category, following the 2025 pattern. Until then → `source_gap` for 2026 answer keys, `auth_required` for 2026 question papers.

---

## Honest failure modes (return these, do not fake)

- `auth_required` — question paper requested; only available via candidate login.
- `source_gap` — answer key for a year where NTA has not yet published it (e.g. 2026 as of 2026-07-13), or question paper for a year with no public category.
- `not_found` — requested year/session does not exist (e.g. NEET was not held that year, or pre-2022 archive not reachable).
- `listing_only` — a category page exists but links no direct PDF (e.g. `question-paper-2020`).
- `unreachable` / `unexpected_type` — verification failed (wrong status, non-PDF type, empty body).

**Never** substitute a coaching-site or mirror URL. If the official surface has nothing, report the gap and stop.

---

## Metadata contract (per OBJECTIVE)

Every result returns at minimum:

| Field | Required | For NEET |
|-------|----------|----------|
| `title` | yes | e.g. "Final Answer Keys for NEET(UG)-2025" (use the official anchor text) |
| `exam` | yes | `NEET (UG)` |
| `year` | yes | e.g. `2025` |
| `session` | | `main` / `re-exam` (2026 re-exam = 21 June 2026) |
| `paper` | | N/A for NEET UG (single paper) — leave blank |
| `subject` | | N/A — NEET UG is a single combined paper |
| `medium` | | English / Hindi / bilingual — only if the PDF title states it; default leave blank |
| `source_url` | yes | Direct `cdnbbsr.s3waas.gov.in` PDF URL when fetched |
| `landing_url` | yes | The `neet.nta.nic.in/document-category/...` page where the link was found |
| `local_path` | | Set by Buddy after download |
| `format` | yes | `PDF` |
| `fetch_status` | yes | `fetched` / `source_gap` / `listing_only` / `auth_required` / `not_found` |
| `verification_status` | yes | `verified` (HTTP 200 + `application/pdf` + non-empty) / `unreachable` / `unexpected_type` |
| `extraction_date` | yes | ISO date of this run |
| `notes` | | e.g. "Answer key only; question paper is login-gated", "Provisional key, final pending" |

---

## Verification step (run before returning `fetched`)

For each candidate `source_url`:

```bash
curl -sL -A "Mozilla/5.0" -I "<source_url>" --max-time 20
```

Pass requires **all** of:
- HTTP status `200`
- `content-type: application/pdf`
- `content-length` > 0 (or a successful byte-range GET returns non-empty body)

If any fail, set `verification_status` accordingly and do **not** claim `fetched`.

For a listing/category resolution, also confirm the category page itself returns HTTP 200 before scraping anchors.

---

## Quick reference — resolution flow

```bash
# user asks for NEET (UG) <year> [question paper | answer key]
#
#   → fetch https://neet.nta.nic.in/documents/   (HTTP 200?)
#   → pick category: neetug-<year>-public-notices / public-notice-<year> / archive
#   → fetch category page
#   → grep anchors for "Answer Key" → cdnbbsr...pdf
#
#   ANSWER KEY found?
#     YES → verify PDF (HEAD: 200 + application/pdf + non-empty) → return fetched
#     NO  → is the year released yet?
#             NO  → source_gap
#             YES → not_found
#
#   QUESTION PAPER requested?
#     → question-paper-2020 category is EMPTY; no public QP exists
#     → return auth_required (candidate login) or source_gap
#     → never substitute a coaching site
```
