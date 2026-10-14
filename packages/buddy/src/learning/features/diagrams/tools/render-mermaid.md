Renders Mermaid source as an inline chat diagram. The UI displays the returned diagram automatically; continue with a brief explanation in normal text.

Use when the user explicitly requests a rendered Mermaid diagram, or when both conditions hold:

- Relationships, branching sequences, state transitions, hierarchies, or dependencies are the subject being explained.
- Seeing the connections makes the explanation materially easier to follow than prose, a list, or a table.

A topic having steps or structure is not sufficient. Do not call this tool for a simple definition, a short linear procedure, a comparison better shown in a table, or a decorative summary. A request for a visual does not by itself select Mermaid: use the medium suited to the idea.

Keep the diagram focused on the relevant connections. Use scaffolds or incomplete diagrams only when the learning activity calls for the learner to complete them.

Omit `repairOfObjectID` for new diagrams. Include it only when the prompt or UI explicitly requests repair of an existing Mermaid object and supplies its exact object ID. Copy that ID exactly; never invent, guess, or substitute a sample ID.
