---
name: react-best-practices
description: Framework-agnostic React performance and reliability guidelines. Use this skill when writing, reviewing, or refactoring React code to reduce waterfalls, unnecessary rerenders, rendering cost, and JavaScript hot-path overhead.
license: MIT
metadata:
  author: buddy
  version: "1.0.0"
---

# React Best Practices

Framework-agnostic optimization guide for React applications. This skill keeps broadly applicable patterns and excludes framework/vendor-specific guidance.

## When to Apply

Reference these guidelines when:
- Writing or refactoring React components
- Optimizing data flow and async orchestration
- Reviewing UI performance bottlenecks
- Reducing bundle/runtime overhead
- Improving rendering predictability under load

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server-Side Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

This skill currently includes 55 rules.

## Excluded Topics

These framework/vendor-specific topics were intentionally removed:
- API-route-specific async orchestration
- Framework-specific dynamic import helpers
- Framework-specific mutation endpoint auth guidance
- Framework-specific post-response hooks
- Framework-specific OG/image APIs
- Vendor-specific analytics defer patterns
- Vendor-specific data-fetching libraries
- Server/client serialization and prop-dedup guidance
- Server-component composition fetch patterns

## How to Use

Read individual rule files for concrete guidance and examples:

```text
rules/async-parallel.md
rules/rerender-memo.md
```

Each rule file contains:
- Why the pattern matters
- Incorrect example
- Correct example
- Notes and constraints

Use `AGENTS.md` for the aggregated agent-facing reference.
