import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import morphdom from "morphdom";
import "katex/dist/katex.min.css";
import { getServerConnection } from "../context/server";
import { resolveApiUrl } from "../lib/api-client";
import { parseMarkdownToHtml } from "../lib/markdown-parser";
import "./markdown.css";

if (typeof window !== "undefined" && DOMPurify.isSupported) {
  DOMPurify.addHook("afterSanitizeAttributes", (node: Element) => {
    if (node instanceof HTMLAnchorElement) {
      if (node.target !== "_blank") return;

      const rel = node.getAttribute("rel") ?? "";
      const set = new Set(rel.split(/\s+/).filter(Boolean));
      set.add("noopener");
      set.add("noreferrer");
      node.setAttribute("rel", Array.from(set).join(" "));
      return;
    }

    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute("src");
      if (!src || !src.startsWith("/api/")) return;
      node.setAttribute("src", resolveApiUrl(src));
    }
  });
}

const sanitizeConfig = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
};

type MarkdownCacheEntry = {
  source: string;
  html: string;
};

const MARKDOWN_CACHE_MAX = 200;
const markdownCache = new Map<string, MarkdownCacheEntry>();

function sanitize(html: string) {
  if (!DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, sanitizeConfig);
}

function markdownSanitizeContextKey() {
  const server = getServerConnection();
  return [server.url ?? "", server.username ?? "", server.password ?? ""].join("|");
}

function touchMarkdownCache(key: string, value: MarkdownCacheEntry) {
  markdownCache.delete(key);
  markdownCache.set(key, value);

  if (markdownCache.size <= MARKDOWN_CACHE_MAX) return;

  const first = markdownCache.keys().next().value;
  if (!first) return;
  markdownCache.delete(first);
}

export function Markdown({
  text,
  className,
  cacheKey,
}: {
  text: string;
  className?: string;
  cacheKey?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sanitizeContextKey = markdownSanitizeContextKey();

  useEffect(() => {
    let disposed = false;

    const applyHtml = (html: string) => {
      const root = rootRef.current;
      if (!root) return;

      if (!html) {
        if (root.innerHTML) root.innerHTML = "";
        return;
      }

      const temp = document.createElement("div");
      temp.innerHTML = html;

      morphdom(root, temp, {
        childrenOnly: true,
        onBeforeElUpdated(fromEl, toEl) {
          if (fromEl.isEqualNode(toEl)) return false;
          return true;
        },
      });
    };

    const key = `${cacheKey ?? text}::${sanitizeContextKey}`;
    const cached = markdownCache.get(key);
    if (cached && cached.source === text) {
      touchMarkdownCache(key, cached);
      applyHtml(cached.html);
      return () => {
        disposed = true;
      };
    }

    (async () => {
      try {
        const rendered = await parseMarkdownToHtml(text);
        const safe = sanitize(rendered);
        if (disposed) return;
        touchMarkdownCache(key, {
          source: text,
          html: safe,
        });
        applyHtml(safe);
      } catch {
        const safe = sanitize(text);
        if (disposed) return;
        touchMarkdownCache(key, {
          source: text,
          html: safe,
        });
        applyHtml(safe);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [cacheKey, sanitizeContextKey, text]);

  return <div data-component="markdown" className={className} ref={rootRef} />;
}
