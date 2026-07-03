# NotebookLM — Full Feature Analysis (June 2026)

NotebookLM is Google's source-grounded AI research and thinking partner. Unlike a general chatbot, it grounds every answer in the sources you add to a "notebook," with inline citations. The June 2026 "2.0" upgrade moved it onto **Gemini 3.5 + Antigravity**, added a secure cloud computer for code execution, and turned it into a more agentic research tool.

## 1. Core Model & Reasoning
- **Gemini 3.5 + Antigravity** under the hood — more accurate, more reliable, with visible "thinking" / reasoning traces.
- **1M-token context window** across all tiers (since Jan 2026).
- **Source-grounded answers**: every response is grounded in your uploaded sources with inline citations; it refuses to answer beyond them by default.
- **Source integrity emphasis**: outputs stay tied to user-approved data, important for legal/academic/financial work.

## 2. Sources (what you can feed it)
| Source type | Notes |
|---|---|
| PDF (`.pdf`) | up to ~200K–500K words / 200–500 MB |
| Google Docs / Slides / Sheets | via Drive picker or URL; Sheets capped ~100k tokens |
| Web URLs | public HTML only; paywalled/login-protected not supported |
| YouTube URLs | requires captions/transcript |
| Audio files (`.mp3`, `.m4a`, `.wav`…) | transcribed and indexed |
| Pasted text | plain text source |
| Gemini chats | chats had in the Gemini app can be added as context |
| `.docx`, `.pptx`, `.xlsx`, `.txt`, `.md` | via Enterprise API |

Per-source cap: **500,000 words or 200 MB**. Per-notebook source cap varies by tier (50 → 600).

## 3. Chat & Research
- **Grounded chat** with inline citations to specific passages.
- **Source selection**: chat with all sources or a subset you pick.
- **Discover sources** (new in 2.0): start with a loose idea and NotebookLM helps find and organize relevant web sources to build your research repository.
- **Secure cloud computer**: writes and runs code for deeper analysis (data evaluation, charts, computations).
- **Suggested topics/sources** based on notebook context.
- **Chat prompt limit**: 10,000 characters.

## 4. Studio — Generated Artifacts
The "Studio" panel produces derivative artifacts from your sources:

- **Audio Overviews** — the viral feature. AI-generated podcast-style discussions.
  - Formats: **Deep Dive** (default, 2 hosts), **Brief** (≤2 min, single speaker), **Critique** (constructive feedback), **Debate** (2 hosts, opposing views).
  - Customizable via prompt (focus, audience, expertise level, narrative arc).
  - Length presets: Short / Default / Long.
  - **80+ output languages**.
  - **Interactive mode**: join the conversation with your voice, ask hosts to elaborate or re-explain; they answer then resume.
  - Shareable via public link.
- **Video Overviews** — video summaries; **Cinematic Video Overviews** are Ultra-only.
- **Mind Maps** — visual concept maps.
- **Study aids**: Flashcards, Quizzes, FAQs, Timelines, Briefing Docs, Study Guides.
- **Reports & Dynamic Reporting** — generate structured reports.
- **Infographics** — 10+ presets with custom styles.
- **Slide Decks** — generate presentations; export to PowerPoint / Google Slides with formatting preserved.
- **Charts, spreadsheets, editable PDFs** — export to Excel/Google Sheets/Slides (new in 2.0).
- **Data Tables**.
- Some artifacts auto-generate once when sources are first added (doesn't count against limits).

## 5. Customization
- **Custom prompts** before generation for Audio, Mind Maps, summaries, etc. (cannot edit post-generation — delete & regenerate).
- **Audience/depth control**: "explain to a curious non-expert" vs. "assume research scientist."
- **Notebook-suggested prompts** based on your content.
- **Tone & response control** (Plus+).

## 6. Collaboration & Sharing
- Share notebooks with collaborators.
- Share Audio Overviews via public link.
- **Advanced sharing** (Plus+).
- Sharing a notebook does **not** change a collaborator's source limits.
- **Enterprise API** for programmatic notebook/source management.

## 7. Platforms & Access
- Web app at notebooklm.google.
- **Android & iOS apps** with most customization options.
- Embedded inside the **Gemini app** ("NotebookLM in Gemini").
- Available via **Google AI plans**, qualifying **Google Workspace** plans, **Google Cloud** (Enterprise).

## 8. Pricing & Limits (2026)
NotebookLM is **not sold standalone** — it's bundled with Google AI subscriptions.

| Plan | Price/mo | Notebooks | Sources/notebook | Daily chats | Audio/day | Video/day | Deep Research | Highlights |
|---|---|---|---|---|---|---|---|---|
| Standard (Free) | $0 | 100 | 50 | 50 | 3 | 3 | 10/month | Casual use, no card |
| Plus (Google AI Plus) | ~$7.99 | 200 | 100 | 200 | 6 | 6 | 3/day | Bigger caps, advanced sharing |
| Pro (Google AI Pro) | $19.99 | 500 | 300 | 500 | 20 | 20 | 20/day | The tier most paid users want |
| Ultra 20TB | $99.99 | 500 | 500 | 2,500 | 100 | 100 | 75/day | Watermark-free |
| Ultra 30TB | $200 | 500 | 600 | 5,000 | 200 | 200 | 200/day | Cinematic Video Overviews |
| Student | $9.99 | — | — | — | — | — | — | Plus + Gemini Advanced + 2TB |
| Workspace Business | ~$14/user | — | — | — | — | — | — | Per-seat |
| Enterprise | ~$9/license | — | — | — | — | — | — | API access |

Daily quotas reset every 24h; monthly every 30 days. Ultra-only: **watermark removal**, **Cinematic Video Overviews**, **usage analytics**.

## 9. Notable Strengths
- **Grounding** is the differentiator — answers cite your sources, reducing hallucination drift.
- **Multimodal sources** (PDFs, video, audio, web, Docs) in one notebook.
- **Audio Overviews** are genuinely best-in-class for "listen to your docs as a podcast," with format variety and interactivity.
- **Export to real file formats** (PPTX, XLSX, PDF) preserves formatting — rare for AI tools.
- **Code execution** in a secure sandbox enables real data analysis, not just text summaries.

## 10. Notable Limitations / Gaps
- **Notebooks are silos** — no cross-notebook knowledge graph or unified search across all notebooks.
- **No "capture as you read" web clipping** — you can't save snippets from the web into a notebook as you browse.
- **Paywalled/login-protected web content** not supported.
- **YouTube requires captions** — no transcript, no import.
- **Audio files from Drive not supported** (only uploads).
- **Customization is pre-generation only** — can't tweak an Audio Overview after the fact; must regenerate.
- **Best features gated to Ultra** ($100–200/mo): cinematic video, watermark removal, highest caps.
- **No standalone purchase** — must buy a Google AI subscription bundle.
- **Footnotes/comments** in Google Docs are not imported.

## Bottom line
NotebookLM's positioning is "source-grounded research partner," and the 2.0 upgrade pushes it from "summarize my PDFs" into agentic territory — code execution, source discovery, multi-format exports, and interactive audio. Its moat is **grounding + multimodal sources + Audio Overviews**. Its biggest weaknesses are **notebook silos**, **no live web capture**, and **aggressive feature gating behind expensive Ultra tiers**.

Sources: [notebooklm.google](https://notebooklm.google/), [Google blog (Jun 2026)](https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/), [NotebookLM Help](https://support.google.com/notebooklm/), [Geeky Gadgets](https://www.geeky-gadgets.com/notebooklm-2026-new-features/), [felloai pricing](https://felloai.com/notebooklm-pricing/), [9to5Google](https://9to5google.com/2025/09/02/notebooklm-audio-overview-debate/).
