/**
 * Legacy hand-rolled markdown className — kept for easy rollback.
 * To revert: import this and assign it to `markdownClassName` in markdown-html-segment.tsx.
 *
 * Last active: 2026-05-20 (replaced by prose-based markdownClassName)
 */
export const legacyMarkdownClassName = [
  "min-w-0 max-w-full break-words text-sm leading-[1.6] text-text-base",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-0 [&_h1]:mb-6 [&_h1]:text-sm [&_h1]:font-medium [&_h1]:leading-[1.667] [&_h1]:text-text-strong",
  "[&_h2]:mt-0 [&_h2]:mb-6 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:leading-[1.667] [&_h2]:text-text-strong",
  "[&_h3]:mt-0 [&_h3]:mb-6 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:leading-[1.667] [&_h3]:text-text-strong",
  "[&_h4]:mt-0 [&_h4]:mb-6 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:leading-[1.667] [&_h4]:text-text-strong",
  "[&_h5]:mt-0 [&_h5]:mb-6 [&_h5]:text-sm [&_h5]:font-medium [&_h5]:leading-[1.667] [&_h5]:text-text-strong",
  "[&_h6]:mt-0 [&_h6]:mb-6 [&_h6]:text-sm [&_h6]:font-medium [&_h6]:leading-[1.667] [&_h6]:text-text-strong",
  "[&_strong]:font-medium [&_strong]:text-text-strong [&_b]:font-medium [&_b]:text-text-strong",
  "[&_p]:mb-3",
  "[&_a]:text-text-interactive-base [&_a]:no-underline [&_a:hover]:underline [&_a:hover]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:mb-3 [&_ul]:ml-0 [&_ul]:list-outside [&_ul]:list-disc [&_ul]:pl-8",
  "[&_ol]:my-2 [&_ol]:mb-3 [&_ol]:ml-0 [&_ol]:list-outside [&_ol]:list-decimal [&_ol]:pl-9",
  "[&_li]:mb-2 [&_li::marker]:text-text-weak",
  "[&_li>p:first-child]:m-0 [&_li>p:first-child]:inline",
  "[&_li>p+p]:mt-2 [&_li>p+p]:block",
  "[&_li>ul]:my-1 [&_li>ul]:pl-4 [&_li>ol]:my-1 [&_li>ol]:pl-7",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-border-weak-base [&_blockquote]:pl-2 [&_blockquote]:not-italic [&_blockquote]:text-text-weak",
  "[&_hr]:my-10 [&_hr]:border-t [&_hr]:border-border-weak-base",
  "[&_pre]:mt-3 [&_pre]:mb-8 [&_pre]:overflow-auto [&_pre]:[scrollbar-width:none] [&_pre::-webkit-scrollbar]:hidden",
  "[&_.shiki]:rounded [&_.shiki]:border [&_.shiki]:border-border-weak-base [&_.shiki]:p-3 [&_.shiki]:text-[13px]",
  "[&_code]:font-mono [&_code]:[font-feature-settings:var(--font-family-mono--font-feature-settings)] [&_code]:text-syntax-string [&_code]:font-medium",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_table]:my-6 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-border-weak-base [&_th]:p-3 [&_th]:text-left [&_th]:align-top [&_th]:font-medium [&_th]:text-text-strong",
  "[&_td]:border-b [&_td]:border-border-weaker-base [&_td]:p-3 [&_td]:text-left [&_td]:align-top",
  "[&_img]:my-6 [&_img]:block [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded",
  "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:[scrollbar-width:none] [&_.katex-display::-webkit-scrollbar]:hidden",
  "[&_a.external-link:hover>code]:underline [&_a.external-link:hover>code]:underline-offset-2",
].join(" ")
