Generate a new image from a description, or edit an existing image. Use it when:

- The user requests an image based on a scene description, such as an illustration, imagined scene, portrait, comic, poster, or visual style.
- The user wants to modify an attached or previously generated image, including adding or removing elements, changing colors, improving quality, or transforming its style.

For explanatory visuals, use image generation when an illustrative appearance is the point, such as an imagined scene or a recognizable everyday object. A generated image is an illustration, not an authentic source, specimen, photograph, scan, or measured result: when real details are the point, show a real image or source instead, and say that a generated image is an illustration if it could be mistaken for the real thing. For a relationship that needs exact geometry, controlled data, or a clear causal structure, use the matching figure, plot, or diagram tool. A generic request to explain, draw, or show a diagram does not by itself select image generation.

Guidelines:

- Provide a short semantic `title` of 2 to 6 words whenever possible. The title is display metadata; never put a path, filename, extension, or slug in it.
- Omit both `referenced_image_paths` and `num_last_images_to_include` when generating a new image.
- For edits of images already available in the conversation, including images generated earlier, prefer `num_last_images_to_include`.
- Set `num_last_images_to_include` to the smallest number of recent conversation images that includes every target image, up to 5.
- Use `referenced_image_paths` only for local files that are not already available in the conversation.
- Never provide both `referenced_image_paths` and `num_last_images_to_include`.
- If neither mechanism can include every target image, ask the user to attach the missing images again.
- Generate the image directly without reconfirmation unless required images are missing.
- When an artifact has editable source, preserve and edit that source instead of converting it into an image.
- This tool is available only when Buddy is signed in to OpenAI with ChatGPT OAuth. It does not use OpenAI API keys.
- The result is displayed automatically; do not display it again through another tool.
