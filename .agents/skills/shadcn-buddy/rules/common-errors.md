# Common Errors with solutions

## Radix ScrollArea and max-height Don't Mix

- Radix ScrollArea renders a viewport div with height: 100%. For that percentage to resolve, the viewport's parent needs a definite height per the CSS spec. max-height is not a definite height — it is a constraint. The percentage chain breaks, the viewport grows to content size, and scrolling never activates.
- This is easy to miss because max-height + overflow: hidden on an ancestor visually clips the content, making it look correctly sized — but the scroll mechanism inside never kicks in.
- **Rule**: ScrollArea requires a parent with a definite height (h-[400px], flex-1 in a flex parent with explicit h-full, a fixed grid row, etc.). If you only have a max-height constraint, use a plain div with overflow-y-auto instead.
