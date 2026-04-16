<notebook_resources>
Resources are notebook-local user-provided reference files.
They are staged under `resources/<alias>/` and prepared text is under `resources/<alias>/processed/`.
When resource evidence is relevant, start from `{{ entrypoint_file_name }}`, then `{{ toc_file_name }}` if present, then `{{ chunks_dir_name }}/`, `{{ pages_dir_name }}/` (PDF), and `{{ full_text_file_prefix }}-*.md`.
Use normal file tools (`read`, `grep`, `glob`, `bash`) and subagents as needed. Do not read every resource by default.

Available resources:
{{ inventory_list }}{{ additional_resources_line }}{{ truncation_notice }}
</notebook_resources>
