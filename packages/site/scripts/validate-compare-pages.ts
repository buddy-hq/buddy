import { readdir, readFile, stat } from "node:fs/promises"
import { dirname, extname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parse, type HTMLElement } from "node-html-parser"
import { content } from "../src/content/site"
import { COMPARE_PATH } from "../src/lib/constants"
import {
  isJsonObject,
  parseTJsonText,
  parseTString,
  parseTStringArray,
  type TJsonObject,
} from "../src/lib/parse-values"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DIST_ROOT = join(PACKAGE_ROOT, "dist")
const COMPARE_OUTPUT_ROOT = join(DIST_ROOT, "compare")
const MINIMUM_STATIC_SECTION_TEXT_LENGTH = 1_000
const MINIMUM_SECTION_COUNT = 3
const MAXIMUM_SECTION_COUNT = 6
const REQUIRED_DECISION_SECTION_TYPE = "decision"
const HTML_EXTENSION = ".html"
const INDEX_FILE_NAME = `index${HTML_EXTENSION}`
const SITEMAP_FILE_PREFIX = "sitemap-"
const SITEMAP_FILE_SUFFIX = ".xml"
const SITEMAP_INDEX_FILE_NAME = "sitemap-index.xml"
const LLMS_FILE_NAME = "llms.txt"
const COMPARED_PRODUCT_SCHEMA_TYPE = "Thing"
const FAQ_SCHEMA_TYPE = "FAQPage"
const RUNTIME_ROUTE_PATHS = new Set([
  "/install",
  "/install-buddy-macos.sh",
  "/install-buddy-windows.ps1",
])

type CompareOutput = {
  readonly slug: string
  readonly outputPath: string
}

type VisibleFaq = {
  readonly question: string
  readonly answer: string
}

function getString(value: TJsonObject, key: string): string | undefined {
  return parseTString(value[key])
}

function hasSchemaType(value: TJsonObject, schemaType: string): boolean {
  const type = value["@type"]
  const typeText = parseTString(type)
  if (typeText === schemaType) return true
  const typeList = parseTStringArray(type)
  return typeList !== undefined && typeList.includes(schemaType)
}

function normalizeText(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim().toLocaleLowerCase("en")
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.closest("[hidden], [aria-hidden='true']")) return false

  const hiddenStyle = element
    .closest("[style]")
    ?.getAttribute("style")
    ?.replaceAll(/\s+/g, "")
    .toLocaleLowerCase("en")
  return !hiddenStyle?.includes("display:none") && !hiddenStyle?.includes("visibility:hidden")
}

function assertCondition(condition: boolean, message: string, failures: string[]): void {
  if (!condition) failures.push(message)
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function loadCompareOutputs(): Promise<readonly CompareOutput[]> {
  const outputEntries = await readdir(COMPARE_OUTPUT_ROOT, { withFileTypes: true })
  const outputs: CompareOutput[] = []

  for (const outputEntry of outputEntries) {
    if (!outputEntry.isDirectory()) continue

    const outputPath = join(COMPARE_OUTPUT_ROOT, outputEntry.name, INDEX_FILE_NAME)
    if (await pathExists(outputPath)) {
      outputs.push({ slug: outputEntry.name, outputPath })
    }
  }

  return outputs
}

async function loadIndexedRoutes(): Promise<ReadonlySet<string>> {
  const outputEntries = await readdir(DIST_ROOT)
  const sitemapFiles = outputEntries.filter(
    (name) =>
      name.startsWith(SITEMAP_FILE_PREFIX) &&
      name.endsWith(SITEMAP_FILE_SUFFIX) &&
      name !== SITEMAP_INDEX_FILE_NAME,
  )
  const sitemapBodies = await Promise.all(
    sitemapFiles.map((name) => readFile(join(DIST_ROOT, name), "utf8")),
  )
  const indexedRoutes = new Set<string>()

  for (const sitemapBody of sitemapBodies) {
    const sitemap = parse(sitemapBody)
    for (const location of sitemap.querySelectorAll("loc")) {
      indexedRoutes.add(new URL(location.text).pathname)
    }
  }

  return indexedRoutes
}

function getJsonLdGraph(document: HTMLElement, failures: string[]): readonly TJsonObject[] {
  const graph: TJsonObject[] = []

  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      const parsedValue = parseTJsonText(script.text)
      if (!isJsonObject(parsedValue)) continue

      const parsedGraph = parsedValue["@graph"]
      if (!Array.isArray(parsedGraph)) continue
      graph.push(...parsedGraph.filter(isJsonObject))
    } catch {
      failures.push("contains invalid JSON-LD")
    }
  }

  return graph
}

function getVisibleFaqs(faqNode: TJsonObject | undefined): readonly VisibleFaq[] {
  if (!faqNode) return []

  const mainEntity = faqNode.mainEntity
  if (!Array.isArray(mainEntity)) return []

  const faqs: VisibleFaq[] = []
  for (const entity of mainEntity) {
    if (!isJsonObject(entity)) continue

    const question = getString(entity, "name")
    const acceptedAnswer = entity.acceptedAnswer
    if (!question || !isJsonObject(acceptedAnswer)) continue

    const answer = getString(acceptedAnswer, "text")
    if (answer) faqs.push({ question, answer })
  }

  return faqs
}

function getStaticOutputCandidates(pathname: string): readonly string[] {
  const relativePath = pathname.replace(/^\/+/, "")
  const directPath = resolve(DIST_ROOT, relativePath)
  if (directPath !== DIST_ROOT && !directPath.startsWith(`${DIST_ROOT}${sep}`)) return []

  if (pathname.endsWith("/")) return [join(directPath, INDEX_FILE_NAME)]
  if (extname(pathname)) return [directPath]
  return [join(directPath, INDEX_FILE_NAME), `${directPath}${HTML_EXTENSION}`]
}

async function validateInternalTarget(
  rawTarget: string,
  page: HTMLElement,
  currentPath: string,
  indexedRoutes: ReadonlySet<string>,
): Promise<string | undefined> {
  if (
    !rawTarget ||
    rawTarget.startsWith("mailto:") ||
    rawTarget.startsWith("tel:") ||
    rawTarget.startsWith("data:")
  ) {
    return undefined
  }

  if (rawTarget.startsWith("#")) {
    const fragmentId = decodeURIComponent(rawTarget.slice(1))
    return fragmentId && !page.getElementById(fragmentId)
      ? `links to missing fragment "${rawTarget}"`
      : undefined
  }

  const targetUrl = new URL(rawTarget, content.meta.siteUrl)
  if (targetUrl.origin !== new URL(content.meta.siteUrl).origin) return undefined

  if (targetUrl.hash && targetUrl.pathname === currentPath) {
    const fragmentId = decodeURIComponent(targetUrl.hash.slice(1))
    if (fragmentId && !page.getElementById(fragmentId)) {
      return `links to missing fragment "${targetUrl.hash}"`
    }
  }

  if (RUNTIME_ROUTE_PATHS.has(targetUrl.pathname) || indexedRoutes.has(targetUrl.pathname)) {
    return undefined
  }

  const outputCandidates = getStaticOutputCandidates(decodeURIComponent(targetUrl.pathname))
  for (const candidate of outputCandidates) {
    if (await pathExists(candidate)) return undefined
  }

  return `links to missing internal target "${rawTarget}"`
}

async function validatePage(
  output: CompareOutput,
  indexedRoutes: ReadonlySet<string>,
  llmsText: string,
): Promise<readonly string[]> {
  const failures: string[] = []
  const html = await readFile(output.outputPath, "utf8")
  const document = parse(html)
  const visibleMainElements = document.querySelectorAll("main").filter(isElementVisible)
  assertCondition(
    visibleMainElements.length === 1,
    `must render exactly one visible <main>; found ${visibleMainElements.length}`,
    failures,
  )
  const main = visibleMainElements[0]
  if (!main) return failures

  const visibleHeadings = main.querySelectorAll("h1").filter(isElementVisible)
  assertCondition(
    visibleHeadings.length === 1,
    `must render exactly one visible <h1>; found ${visibleHeadings.length}`,
    failures,
  )
  assertCondition(
    main.querySelectorAll("script, style").length === 0,
    "content must not inject page-specific scripts or styles",
    failures,
  )

  const sectionContainer = main.querySelector(".compare-sections")
  const sectionText = normalizeText(sectionContainer?.structuredText ?? "")
  const sections =
    sectionContainer?.querySelectorAll("section[data-compare-section]").filter(isElementVisible) ??
    []
  const sectionTypes = sections
    .map((section) => section.getAttribute("data-compare-section"))
    .filter((sectionType): sectionType is string => Boolean(sectionType))
  assertCondition(Boolean(sectionContainer), "is missing the shared comparison sections", failures)
  assertCondition(
    sectionText.length >= MINIMUM_STATIC_SECTION_TEXT_LENGTH,
    `must render at least ${MINIMUM_STATIC_SECTION_TEXT_LENGTH} characters of static section text`,
    failures,
  )
  assertCondition(
    sections.length >= MINIMUM_SECTION_COUNT && sections.length <= MAXIMUM_SECTION_COUNT,
    `must render between ${MINIMUM_SECTION_COUNT} and ${MAXIMUM_SECTION_COUNT} comparison sections; found ${sections.length}`,
    failures,
  )
  assertCondition(
    new Set(sectionTypes).size === sectionTypes.length,
    "must not render the same comparison section type more than once",
    failures,
  )
  assertCondition(
    sectionTypes.filter((sectionType) => sectionType === REQUIRED_DECISION_SECTION_TYPE).length ===
      1,
    `must render exactly one ${REQUIRED_DECISION_SECTION_TYPE} section`,
    failures,
  )
  for (const section of sections) {
    const sectionType = section.getAttribute("data-compare-section") ?? "unknown"
    // Prose is lead body under the page H1; it does not use its own H2.
    if (sectionType === "prose") continue
    assertCondition(
      Boolean(section.querySelector("h2")),
      `section "${sectionType}" must contain an H2`,
      failures,
    )
  }

  const graph = getJsonLdGraph(document, failures)
  const comparedProduct = graph.find((node) => hasSchemaType(node, COMPARED_PRODUCT_SCHEMA_TYPE))
  const competitor = comparedProduct ? getString(comparedProduct, "name") : undefined
  const mainText = normalizeText(main.structuredText)
  assertCondition(Boolean(competitor), "is missing compared-product structured data", failures)
  assertCondition(
    competitor ? mainText.includes(normalizeText(competitor)) : false,
    "must visibly name the competitor",
    failures,
  )

  const faqNode = graph.find((node) => hasSchemaType(node, FAQ_SCHEMA_TYPE))
  const faqs = getVisibleFaqs(faqNode)
  assertCondition(faqs.length >= 3, "must emit at least three valid FAQ entities", failures)
  for (const faq of faqs) {
    assertCondition(
      mainText.includes(normalizeText(faq.question)),
      `must visibly render FAQ question "${faq.question}"`,
      failures,
    )
    assertCondition(
      mainText.includes(normalizeText(faq.answer)),
      `must visibly render the answer to FAQ "${faq.question}"`,
      failures,
    )
  }

  const visibleLinks = main.querySelectorAll("a[href]").filter(isElementVisible)
  assertCondition(
    visibleLinks.some((link) => {
      const href = link.getAttribute("href")
      return href ? new URL(href, content.meta.siteUrl).pathname === COMPARE_PATH : false
    }),
    `must include a crawlable link back to ${COMPARE_PATH}`,
    failures,
  )

  const pagePath = `${COMPARE_PATH}${output.slug}/`
  const canonicalUrl = new URL(pagePath, content.meta.siteUrl).href
  const canonicalLinks = document.querySelectorAll("link[rel='canonical']")
  assertCondition(
    canonicalLinks.length === 1 && canonicalLinks[0]?.getAttribute("href") === canonicalUrl,
    `must emit exactly one self-referencing canonical (${canonicalUrl})`,
    failures,
  )

  const robotsDirectives = document.querySelectorAll("meta[name='robots']")
  assertCondition(
    robotsDirectives.length === 1 &&
      robotsDirectives[0]?.getAttribute("content") === "index, follow",
    "must emit exactly one index, follow robots directive",
    failures,
  )

  for (const image of main.querySelectorAll("img")) {
    assertCondition(image.hasAttribute("alt"), "contains an image without alt text", failures)
    assertCondition(
      image.hasAttribute("width") && image.hasAttribute("height"),
      "contains an image without explicit width and height",
      failures,
    )
  }

  const linkAndAssetTargets = [
    ...visibleLinks.map((link) => link.getAttribute("href")),
    ...main
      .querySelectorAll("img[src], source[src], video[poster]")
      .map((element) => element.getAttribute("src") ?? element.getAttribute("poster")),
  ].filter((target): target is string => Boolean(target))

  for (const target of linkAndAssetTargets) {
    const targetFailure = await validateInternalTarget(target, document, pagePath, indexedRoutes)
    if (targetFailure) failures.push(targetFailure)
  }

  assertCondition(indexedRoutes.has(pagePath), "is missing from the generated sitemap", failures)
  assertCondition(llmsText.includes(canonicalUrl), `is missing from ${LLMS_FILE_NAME}`, failures)

  return failures
}

async function main(): Promise<void> {
  const [outputs, indexedRoutes, llmsText] = await Promise.all([
    loadCompareOutputs(),
    loadIndexedRoutes(),
    readFile(join(DIST_ROOT, LLMS_FILE_NAME), "utf8"),
  ])
  const validationResults = await Promise.all(
    outputs.map(async (output) => ({
      slug: output.slug,
      failures: await validatePage(output, indexedRoutes, llmsText),
    })),
  )
  const failures = validationResults.flatMap((result) =>
    result.failures.map((failure) => `- ${result.slug}: ${failure}`),
  )

  if (failures.length > 0) {
    throw new Error(`Comparison page validation failed:\n${failures.join("\n")}`)
  }

  console.log(`Validated ${outputs.length} templated comparison page(s).`)
}

await main()
