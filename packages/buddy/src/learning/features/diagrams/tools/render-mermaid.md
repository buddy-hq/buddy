Renders Mermaid diagrams for inline chat display, including flowcharts, sequence diagrams, class diagrams, state diagrams, ER diagrams, gantt, pie, journey, mindmap, timeline, and related Mermaid-supported UML and architecture families. The UI renders the returned diagram automatically after the tool call, so continue the explanation in normal text.

Render a Mermaid diagram when visual structure would teach better than prose.

Omit `repairOfObjectID` when creating a new diagram. Only include `repairOfObjectID` when the prompt or UI explicitly asks you to repair an existing Mermaid object and gives you the exact object ID to copy. Never invent a repair ID, use zeros, use repeated sample characters, or guess from the current call; if you are not repairing a prior Mermaid object, leave the field out.

Use for learner problems involving:
- abstraction: invisible or untouchable ideas need a concrete visual model/metaphor
- connection: isolated facts need part-whole, network, or system mapping
- surface confusion: similar-looking cases need side-by-side contrast with deep structure labeled
- sequence: steps, timelines, feedback loops, decisions, or causality need arrows/flow
- blank slate: no prior mental model; show an advance organizer before explaining
- transfer: concept known in one context but not recognized in another; ask learner to redraw it for the new context
- overload: too many relations to hold in working memory; offload them into the diagram
- vague relations: spatial/logical links are fuzzy in words; layout makes them specific
- discovery: pieces need arranging so patterns can emerge
- lock-in: learner sees only one interpretation; redraw the idea in multiple formats
- expert gap: tutor sees structure automatically; give a skeletal template to complete
- rehearsal: learner can study a reference diagram, close eyes, and mentally walk through the process
- assessment: learner drawing can expose misconceptions hidden by prose

Prefer learner-generated visuals over finished visuals. Use partial/scaffolded diagrams for discovery, transfer, rehearsal, or assessment. Use finished diagrams for orientation, explanation, or overload reduction.

Do not use for decoration, motivation, rote prescribed diagrams, visual polish, or cases where text/table is clearer.

Avoid forcing one diagram format too early. Let learners invent a visualization first, then compare with a standard form. Require multiple redraws when first-sketch lock-in is likely.

Normalize rough sketches. The goal is structural discovery, not art; “I am not visual” is not a reason to avoid diagramming.

Core test: use only if the diagram reveals relationships, structure, sequence, contrast, or causality that prose would hide. If it does not change how the learner sees the problem, do not use it.
