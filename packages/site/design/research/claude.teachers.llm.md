# Claude for K-12 Teachers — agent / LLM crawl guidance

> Audited: 2026-07-19  
> Live URL: https://claude.com/solutions/teachers  
> Companion research: `claude.teachers.md`, `claude.teachers.seo.md`  
> Parent: claude.com / Anthropic docs

**Agent guidance present:** Yes — at **domain level** (not a teachers-only llms file)

---

## Summary

The teachers **solution page itself** does not host a dedicated `/solutions/teachers/llms.txt`.  

Anthropic/Claude **do** publish rich agent-oriented documentation maps at the product/docs layer that any agent should use when reasoning about Claude (including education offerings listed in the site map):

| Resource | URL | Role |
|----------|-----|------|
| Site llms.txt | https://claude.com/llms.txt | Product/site index (products, pricing, solutions **including Education**, developer platform, programs…) |
| Claude.ai docs llms | https://claude.com/docs/llms.txt | Large docs index (includes product surfaces such as Claude Science, connectors, etc.) |
| Developer docs llms | https://docs.claude.com/llms.txt | Anthropic API / platform documentation map (multi-language notes) |
| Developer full dump | https://docs.claude.com/llms-full.txt | Massive full-content corpus for agents |
| robots (claude.com) | https://claude.com/robots.txt | Sitemaps for marketing + docs |
| robots (docs.claude.com) | points at platform sitemap | |

## Teachers page specifically

| Path on solutions/teachers | Result |
|----------------------------|--------|
| Page-local llms.txt | **None** |
| Page HTML | Rich human educator copy (good for grounding if fetched as HTML) |
| Canonical | `https://claude.com/solutions/teachers` |

Education appears as a **solutions entry** inside the root `claude.com/llms.txt` site map (industry/use-case style links), not as a separate teachers agent file.

## Parent robots / sitemaps

- `claude.com/robots.txt` → marketing sitemap + docs sitemap  
- Large SEO URL graph (thousands of URLs) — separate from llms maps  

## How an agent should learn “Claude for teachers”

1. Fetch the **HTML solution page** for K-12 program claims (verification, safety, free Pro for educators, classroom language).  
2. Use **`https://claude.com/llms.txt`** to locate education/solutions and product surfaces.  
3. Use **docs.claude.com `llms.txt` / `llms-full.txt`** for API/platform truth (not teacher-program policy).  
4. Do not expect a teachers-only Markdown corpus.

## Related hosts

- `docs.anthropic.com` → redirects into Claude developer platform docs in this audit era.  
- `www.anthropic.com` → classic sitemap; not the primary llms hub.

## Verdict

**Domain-level agent guidance: excellent. Page-level teachers llms file: none.**  
Still create this note so research is complete: educators page relies on HTML + parent `llms.txt` ecosystem.
