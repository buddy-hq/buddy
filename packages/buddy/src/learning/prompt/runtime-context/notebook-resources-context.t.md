<notebook_resources>
Resources are Buddy-managed parsed documents.
Use exact `pack` and `full_text` paths from the inventory. They are already resolved for the current workspace; do not rewrite them to `~/.buddy`, `/Users/<name>/.buddy`, `resources/<alias>/`, or `resources/<alias>/processed/`.
When resource evidence is relevant, start from the resource's `pack` root: `{{ entrypoint_file_name }}`, then `{{ toc_file_name }}` if present, then `{{ chunks_dir_name }}/`, `{{ pages_dir_name }}/` (PDF), and `{{ full_text_file_prefix }}-*.md`.
Use normal file tools (`read`, `grep`, `glob`, `bash`) and subagents as needed. Do not read every resource by default.

Available resources:
{{ inventory_list }}{{ additional_resources_line }}{{ truncation_notice }}
</notebook_resources>
