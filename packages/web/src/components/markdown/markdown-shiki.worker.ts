/// <reference lib="webworker" />

import { ShikiStreamTokenizer } from "@shikijs/stream"
import {
  bundledLanguages,
  createHighlighter,
  getTokenStyleObject,
  stringifyTokenStyle,
  type ThemedToken,
} from "shiki"
import { resolveBundledShikiLanguage } from "./markdown-shiki-language"
import { createLatestWorkerQueue } from "./markdown-worker-queue"
import type {
  MarkdownToken,
  MarkdownWorkerRequest,
  MarkdownWorkerResponse,
} from "./markdown-worker-protocol"

type HighlightRequest = Extract<MarkdownWorkerRequest, { type: "highlight" }>
type CodeStream = {
  language: string
  source: string
  tokenizer: ShikiStreamTokenizer
}

const streams = new Map<string, CodeStream>()
let highlighter: ReturnType<typeof createHighlighter> | undefined

function post(response: MarkdownWorkerResponse) {
  self.postMessage(response, [])
}

const queue = createLatestWorkerQueue<HighlightRequest>({
  run: highlight,
  supersede(request) {
    post({ type: "superseded", id: request.id, key: request.key })
  },
  dispose(key) {
    streams.delete(key)
  },
})

self.addEventListener("message", (event: MessageEvent<MarkdownWorkerRequest>) => {
  if (event.data.type === "init") {
    highlighter ??= createHighlighter({ themes: [event.data.theme], langs: [] })
    return
  }
  if (event.data.type === "dispose") {
    queue.dispose(event.data.key)
    return
  }
  queue.highlight(event.data)
})

async function highlight(request: HighlightRequest) {
  try {
    const instance = await highlighter
    if (!instance) throw new Error("Shiki worker is not initialized")
    const bundledLanguage = resolveBundledShikiLanguage(request.language)
    const language = bundledLanguage ?? "text"
    if (bundledLanguage && !instance.getLoadedLanguages().includes(bundledLanguage)) {
      await instance.loadLanguage(bundledLanguages[bundledLanguage])
    }

    if (request.complete) {
      const result = instance.codeToTokens(request.text, {
        lang: bundledLanguage,
        theme: "OpenCode",
      })
      streams.delete(request.key)
      post({
        type: "highlight",
        id: request.id,
        key: request.key,
        reset: true,
        stable: result.tokens
          .flatMap((line, index) =>
            index === result.tokens.length - 1 ? line : line.concat({ content: "\n", offset: 0 }),
          )
          .map(token),
        unstable: [],
      })
      return
    }

    const previous = streams.get(request.key)
    const reset =
      !previous || previous.language !== language || !request.text.startsWith(previous.source)
    const stream = reset
      ? {
          language,
          source: "",
          tokenizer: new ShikiStreamTokenizer({
            highlighter: instance,
            lang: language,
            theme: "OpenCode",
          }),
        }
      : previous

    const result = await stream.tokenizer.enqueue(request.text.slice(stream.source.length))
    stream.source = request.text
    streams.set(request.key, stream)
    post({
      type: "highlight",
      id: request.id,
      key: request.key,
      reset,
      stable: result.stable.filter((value) => value.content.length > 0).map(token),
      unstable: result.unstable.filter((value) => value.content.length > 0).map(token),
    })
  } catch (error) {
    post({
      type: "error",
      id: request.id,
      key: request.key,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function token(token: ThemedToken): MarkdownToken {
  const style = stringifyTokenStyle(token.htmlStyle ?? getTokenStyleObject(token))
  return [token.content, style]
}
