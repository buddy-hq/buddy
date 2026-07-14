# JEE Advanced Papers

Use for fetching official JEE Advanced (and AAT) question paper PDFs from `jeeadv.ac.in`. One paper per request. Verify each download. Report honest status when the paper does not exist or the requested language was never published.

## Source surface

- Official archive: `https://jeeadv.ac.in/archive.html` (static HTML, lists every published paper).
- PDF base: `https://jeeadv.ac.in/past_qps/` (anonymous public GET, no auth, no captcha, no JS).
- JEE Advanced Paper 1 and Paper 2: 2007–2025 (extends as new years publish).
- AAT (Architecture Aptitude Test): 2016–2025, single paper per year.
- Languages: English (all years), Hindi (2019 onwards only).
- No answer keys on this surface. Do not fabricate answer-key URLs.

## URL patterns

Three patterns. Pick by year and exam type. Year is a 4-digit integer; paper is `1` or `2`; language is `English` or `Hindi`.

### JEE Advanced, 2007–2018 (English only, no language suffix)

```text
https://jeeadv.ac.in/past_qps/{year}_{1|2}.pdf
```

- Examples: `https://jeeadv.ac.in/past_qps/2018_1.pdf`, `https://jeeadv.ac.in/past_qps/2007_2.pdf`.
- No Hindi variant exists for this range. Do not append `_English` or `_Hindi` — both 404.

### JEE Advanced, 2019 onwards (English + Hindi)

```text
https://jeeadv.ac.in/past_qps/{year}_{1|2}_{English|Hindi}.pdf
```

- Examples: `https://jeeadv.ac.in/past_qps/2024_1_English.pdf`, `https://jeeadv.ac.in/past_qps/2019_2_Hindi.pdf`.
- Language suffix is required. Bare `{year}_1.pdf` 404s for 2019+.

### AAT, 2016–2025

```text
https://jeeadv.ac.in/past_qps/AAT-{year}.pdf
```

- Example: `https://jeeadv.ac.in/past_qps/AAT-2025.pdf`.
- Single paper per year. No Paper 1/2 split. No language suffix. English only.

## Workflow

1. **Resolve inputs.** From the user prompt, determine:
   - `exam`: `jee-advanced` (default) or `aat` when the user says "AAT" / "Architecture Aptitude Test" / "B.Arch".
   - `year`: 4-digit integer. If the user gives a two-digit year, expand to the 2000s (e.g., `24` → `2024`).
   - `paper`: `1` or `2`. Default `1` if the user says "the paper" without specifying. AAT has no paper number.
   - `medium`: `English` (default) or `Hindi` if the user asks for Hindi.
2. **Select pattern by year.**
   - AAT → AAT pattern. AAT only exists 2016+.
   - JEE Advanced, year ≤ 2018 → no-suffix pattern. Ignore `medium` (English only).
   - JEE Advanced, year ≥ 2019 → suffixed pattern. Append `_{medium}`.
3. **Construct URL** from the pattern above. Do not invent other paths.
4. **GET the URL.** Save to a local path chosen by Buddy (this skill returns the URL + metadata; it does not pick the save location).
5. **Verify** before reporting `fetched` (see Verify).

Never use coaching sites, mirrors, or aggregators (Vedantu, Allen, Shiksha, Physics Wallah, Gradeup, etc.). Official `jeeadv.ac.in` only.

## Verify

After every download, confirm all three before reporting `fetched`:

1. **HTTP 200.** Non-200 = not `fetched`. 404 → `not_found`. 5xx / timeout → `unreachable`.
2. **`content-type: application/pdf`.** Anything else (e.g., `text/html` 404 page) → `unexpected_type`; do not treat as a paper.
3. **Non-empty body.** `content-length > 0` (HEAD) or saved file size > 0 (GET). Empty body → `unreachable`.

```bash
curl -sI {url}
```

Inspect `HTTP/2`, `content-type`, `content-length`. Only when all three pass, set `verification_status: verified` and `fetch_status: fetched`.

## Access barriers

- None for published papers. Anonymous public GET.
- Cloudflare fronts the host; standard `curl` works. No interstitial, no JS, no redirect chain.

## Rights / license

Official, free, publicly downloadable from `jeeadv.ac.in`. No paywall, no login.

## fetch_status

| Status | When |
| --- | --- |
| `fetched` | HTTP 200 + `application/pdf` + non-empty body. |
| `not_found` | Year < 2007 (JEE Advanced) or < 2016 (AAT); year > latest published (currently 2025 — re-probe the ceiling, do not hard-code); paper number other than 1 or 2; URL-construction error (wrong suffix for the year). |
| `source_gap` | Hindi requested for year 2007–2018. English paper exists; Hindi was never published for that year. |
| `unreachable` | Network failure, 5xx, timeout. Retry once; then report. |

## Gotchas

- **404 on a year that should exist (2007–2018): wrong suffix.** 2007–2018 takes no language suffix; 2019+ requires `_{English|Hindi}`. Fix the pattern and retry before reporting `not_found`.
- **Hindi requested for 2007–2018 → `source_gap`, not `not_found`.** English paper exists; Hindi was never published for those years. Report `source_gap` with a note pointing to the English URL.
- **AAT is a separate exam.** Do not route "AAT" requests through the Paper 1/2 pattern. AAT has no paper number and no language suffix. AAT archive starts 2016.
- **Paper number other than 1 or 2 → `not_found`.** JEE Advanced has exactly Paper 1 and Paper 2 per year.
- **Future year 404s.** Re-probe the latest year via the archive page before declaring a future year `not_found`; do not hard-code 2025 as the eternal ceiling.

  ```bash
  curl -s https://jeeadv.ac.in/archive.html | grep -oE 'past_qps/[0-9]{4}_1_English\.pdf'
  ```

- **Two-digit years.** Expand `18` → `2018`, `24` → `2024` before constructing the URL.
- **"JEE Advanced" vs "JEE Main".** This leaf is JEE Advanced only (`jeeadv.ac.in`). JEE Main is a separate exam on NTA domains — route elsewhere.

## Metadata to return

Every result returns these fields (per OBJECTIVE contract):

| Field | Required | Value for this leaf |
| --- | --- | --- |
| `title` | yes | e.g. `JEE Advanced 2024 Paper 1`, `AAT 2023`. Include language when Hindi: `JEE Advanced 2024 Paper 1 (Hindi)`. |
| `exam` | yes | `JEE Advanced` or `AAT`. |
| `year` | yes | 4-digit year. |
| `session` | | Not used for JEE Advanced (single session per year). Omit. |
| `paper` | yes | `Paper 1` or `Paper 2` for JEE Advanced; omit for AAT. |
| `subject` | | Not applicable (JEE Advanced papers are combined PCM). Omit. |
| `medium` | yes | `English` or `Hindi`. For 2007–2018, always `English`. |
| `source_url` | yes | The constructed `past_qps/...pdf` URL. |
| `landing_url` | yes | `https://jeeadv.ac.in/archive.html`. |
| `local_path` | | Path where Buddy saved the file, if downloaded. |
| `format` | yes | `PDF`. |
| `fetch_status` | yes | `fetched` / `not_found` / `source_gap` / `unreachable`. |
| `verification_status` | yes | `verified` / `unreachable` / `unexpected_type`. |
| `extraction_date` | yes | ISO date of this fetch (e.g. `2026-07-13`). |
| `notes` | | Caveats: `Hindi not published for 2007–2018`, `AAT single paper`, `Answer keys not on this surface`, etc. |

## Defaults

- `exam`: `JEE Advanced` (not AAT) unless the prompt says AAT / Architecture / B.Arch.
- `paper`: `1` when the user does not specify.
- `medium`: `English` unless the user asks for Hindi.
- For 2007–2018, ignore a Hindi request's language and fetch English, but report `source_gap` with the English URL in `source_url` and a note. Do not silently serve English as if it were Hindi.

## Guardrails

- Never use coaching sites, mirrors, or third-party aggregators. Official `jeeadv.ac.in` only.
- Never bulk-harvest all years in one call. One paper per request.
- Never fabricate answer-key, response-sheet, admit-card, or result URLs. They are not on `archive.html`.
- Never hard-code the latest published year as a constant ceiling. Re-probe the archive for the current ceiling before declaring a future year `not_found`.
- Never report `fetched` without the verification triple (HTTP 200 + `application/pdf` + non-empty body).
