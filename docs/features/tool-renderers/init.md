## Situation 
- right now tool rendering system and components are very complicated. 
- we have a summary area that has a title and a body.
- then some tools are not in summary and are rendered inline.
- some tools are in summary but no summary is generated for them.
- then since every time a text part is generated or a tool that presents like render mermaid, render figure etc are used, they break the summary block and are shown inline. 
- when a user opens the summary block while the genertion is happening thy can see the summary and collapsed stuf.


## Complication
- this is very complicated and a lot to manage and we need to simplify the ui. 


## Suggestions 
- we will go for a simpler system where everyting happens in one linear timeline. 
- thinking blocks will be collapsed by default; will shimmer, and the user can open them on click. ie by default not thinking is visible to the user.
- we will still combine tool calls like we are doing right now
  - Thought, Ran 3x, Read 4 files,.... so on.
- the inline renderers still render inline.
  


## Relevant files

### Core resolver & types
- `packages/web/src/components/chat/tools/tool-renderer-resolver.ts` — resolves inline card renderer + summary definition per tool
- `packages/web/src/components/chat/tools/tool-summary-resolver.ts` — resolves `ToolSummary` into `ResolvedToolSummary` (label, preview, details, error)
- `packages/web/src/components/chat/tools/tool-registry-types.ts` — `ToolRenderer`, `ToolSummary`, `ResolvedToolSummary`, `ToolPartProps` type definitions
- `packages/web/src/components/chat/tools/types.ts` — `ToolState`, `ToolInfo`, `ToolAttachment` base types
- `packages/web/src/components/chat/tools/built-in-tool-renderers.ts` — registry mapping every tool name to its renderer config (icon, card, summary, aggregate)

### Hidden steps (collapsible summary block)
- `packages/web/src/components/chat/tools/hidden-steps/index.tsx` — `HiddenSteps` collapsible component with toggle, live preview, and expanded content
- `packages/web/src/components/chat/tools/hidden-steps/entries.ts` — `createHiddenStepsEntry`, `buildHiddenStepsSummary`, `buildHiddenStepsPreview`, bucket aggregation logic
- `packages/web/src/components/chat/tools/hidden-steps/summary-row.tsx` — `HiddenStepsSummaryRow` renders individual summary entries with `display: "row"`
- `packages/web/src/components/chat/tools/hidden-steps/styles.ts` — shared CSS class names for hidden steps
- `packages/web/src/components/chat/tools/hidden-steps/thinking-placeholder.tsx` — thinking/reasoning placeholder UI

### Tool card renderers (`packages/web/src/components/chat/tools/render/`)
- `buddy-custom.tsx` — generic Buddy custom tool card
- `generic.tsx` — fallback generic tool card
- `bash.tsx` — shell/terminal tool
- `read.tsx` — file read tool
- `edit.tsx` — file edit tool
- `apply-patch.tsx` / `apply-patch-item.tsx` — patch application
- `search.tsx` — file search (list, glob, grep)
- `exa-search.tsx` — web/code search
- `webfetch.tsx` — URL fetch tool
- `mermaid/` — mermaid diagram rendering (index, diagram, inline view, fullscreen, action bar, lib/)
- `render-figure.tsx` — figure/image rendering
- `present-media/index.tsx` — media presentation
- `task.tsx` — subagent/task delegation
- `skill.tsx` — skill loading
- `question.tsx` — question tool
- `question-set/` — question set UI (inline view, tool card, side panel)
- `knowledge-graph.tsx` — knowledge graph queries
- `python-calculator.tsx` — Python calculator tool
- `diagnostic-list.tsx` — diagnostic output listsuggestion




## Current Status: Done
