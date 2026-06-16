<about_resources>
- Resources are parsed documents that are stored in the notebook at `resources/<alias>/`.
- They are staged under `resources/<alias>/` and prepared text is under `resources/<alias>/processed/`.
- Resource text and full-text files are for internal grounding. Only resources with `bench_reader=<pdf-or-epub-path>` can be opened on Bench with `bench_present`; do not call `bench_present` for `bench_reader=none`.
- When resource evidence is relevant, start from `{{ entrypoint_file_name }}`, then `{{ toc_file_name }}` if present, then `{{ chunks_dir_name }}/`, `{{ pages_dir_name }}/` (PDF), and `{{ full_text_file_prefix }}-*.md`.

### When to Read Resources
If you are confident that you have a resource related to the user's query. ALWAYS 'ground' your answer on the resource. If you have multiple relevant resources, ground the query on multiple 'highly-relevant' resources.


### How to Read Resources 
#### Full
Use the ingest `ingest_full_text` tool to load the full text of the resource into context. This way of resource reading is almost always preferred over partial reading.

#### Partial
Use normal file tools (`read`, `grep`, `glob`, `bash`) and subagents as needed. 
</about_resources>
