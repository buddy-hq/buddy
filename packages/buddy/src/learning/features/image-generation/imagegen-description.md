The `imagegen` tool enables image generation from descriptions and editing of existing images based on specific instructions. Use it when:

- The user requests an image based on a scene description, such as a diagram, portrait, comic, meme, or any other visual.
- The user wants to modify an attached or previously generated image with specific changes, including adding or removing elements, altering colors, improving quality/resolution, or transforming the style (e.g., cartoon, oil painting).

Guidelines:
- Provide a short semantic `title` of 2 to 6 words for the resulting image whenever possible. The title is display metadata; never put a path, filename, extension, or slug in it.
- Omit both `referenced_image_paths` and `num_last_images_to_include` when generating a brand new image.
- For edits of images already attached or available in recent conversation context, including images produced by earlier `imagegen` calls, prefer `num_last_images_to_include` even when a local path is visible.
- Set `num_last_images_to_include` to the smallest number of recent conversation images that includes every target image, up to 5.
- Use `referenced_image_paths` only for genuine local-file targets that are not already available in recent conversation context.
- Never provide both `referenced_image_paths` and `num_last_images_to_include`.
- If neither mechanism can include every target image, ask the user to attach the missing images again.
- Directly generate the image without reconfirmation or clarification unless required images must be attached again.
- Always use this tool for image editing unless the user explicitly requests otherwise. Do not use the `python` tool for image editing unless specifically instructed.
- This tool is available only when Buddy is signed in to OpenAI with ChatGPT OAuth. It does not use OpenAI API keys.
