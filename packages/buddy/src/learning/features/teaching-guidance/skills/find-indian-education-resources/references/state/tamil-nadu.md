
# Tamil Nadu — SCERT / ADT textbooks

**Authorities:** Tamil Nadu SCERT; ADT (TN Schools)  
**Official domains:** `scert.tnschools.gov.in`, `adt.tnschools.gov.in` (legacy `textbooksonline.tn.nic.in` if reachable)  
**Fetch family:** `listing-crawler` + **JS-required** surfaces  
**Supported formats:** PDF when exposed; often `listing_only` only

Use this reference when the user wants Tamil Nadu/TN SCERT textbooks by class, subject, or medium. It helps the agent understand that the official route is often a browser/JS picker: ADT can expose official CDN PDF/EPUB links after selecting class/subject/medium, while SCERT static HTML and captcha-gated downloads may not produce a clean curl-only URL.

## Official domains

| Surface | URL |
|---------|-----|
| SCERT | `https://scert.tnschools.gov.in/` |
| SCERT textbook browser | `https://scert.tnschools.gov.in/textbook` |
| ADT textbooks app | `https://adt.tnschools.gov.in/` |

## Discovery

1. Fetch SCERT home with curl — Angular shell (`<app-root>`); **no direct** `.pdf` hrefs in static HTML (same for ADT React shell).
2. Open ADT in browser — static curl is only `<div id="root">`; use **Class → Subject → Medium** (classes **1–12**), then edition **Download** links.
3. If user names class/subject/medium (e.g. Class 5 maths, Class 9 English, middle school **6–8**), walk the ADT picker until PDF/EPUB URLs appear; do not invent deep links.
4. SCERT `/textbook` lists books in-browser but **Download** opens an arithmetic **captcha** — prefer **ADT** for stable PDF URL discovery when both are official.
5. Legacy `textbooksonline.tn.nic.in`: probe once (`curl` / `dig`); if DNS fails or unreachable, `not_found` — do not mirror third-party sites.

## Fetch

- When an official PDF URL is obtained (from browser network tab or SCERT anchor): `curl -fL` with verify headers.
- **ADT browser discovery:** After picker selections, **Download** exposes PDF and sometimes **EPUB** on `d1wpyxz35bzzz4.cloudfront.net/tnschools/…` (CDN linked from official ADT/SCERT UI — not a third-party mirror). Binaries are **not** on `*.tnschools.gov.in` hostnames; treat CloudFront as official once URL is obtained from the portal UI.
- When only menus/loaders are reachable: set `fetch_status: listing_only` and `verification_status: js_required`.

## Verify

- PDF: `%PDF` magic, `application/pdf`.
- Listing-only: `landing_url` is the official portal page used; `local_path` empty; explain JS limitation in report.

## Disambiguation

| User says | Action |
|-----------|--------|
| SCERT textbooks | Start `scert.tnschools.gov.in`; browser if needed |
| TN Schools / ADT | `adt.tnschools.gov.in` |
| English medium / middle school | ADT picker — e.g. Class **9 → English → English** (classes **6–8** same flow); no static English-medium PDF URL in curl HTML |
| Old textbooksonline | Legacy host only if live |

## Known source gaps / wrapper_only

- **JS app:** ADT/SCERT do not expose textbook PDFs in curl-only HTML.
- **SCERT captcha:** `/textbook` Download is captcha-gated — bulk unattended fetch from SCERT UI alone is blocked.
- **emis-prod API** (`24iv009qs1.execute-api.ap-south-1.amazonaws.com/emis-prod`, `/e-learn/textbook`) — returns **403** without session/auth from bare curl; do not substitute unofficial APIs.
- Legacy `textbooksonline.tn.nic.in` — DNS may fail; use honest `not_found`, not unofficial PDF hosts.

## fetch_status vocabulary

| Status | When |
|--------|------|
| `fetched` | Official PDF downloaded |
| `listing_only` | Official portal reached; no stable PDF without JS |
| `js_required` | SPA shell only in static fetch |
| `not_found` | No official path located |
