<about_resources>
Resources are parsed documents that are stored in the notebook at `resources/<alias>/`.

They are staged under `resources/<alias>/` and prepared text is under `resources/<alias>/processed/`.

### How to use resources

#### Full
Use the ingest `ingest_full_text` tool to load the full text of the resource into context. This way of resource reading is almost always preferred over partial reading.

#### Partial
Use normal file tools (`read`, `grep`, `glob`, `bash`) and subagents as needed. 

When resource evidence is relevant, start from `{{ entrypoint_file_name }}`, then `{{ toc_file_name }}` if present, then `{{ chunks_dir_name }}/`, `{{ pages_dir_name }}/` (PDF), and `{{ full_text_file_prefix }}-*.md`.
</about_resources>
