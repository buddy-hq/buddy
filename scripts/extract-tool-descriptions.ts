import { readFile, writeFile } from "fs/promises"
import path from "path"

const MODIFIED_TOOL_FILES = [
  "packages/buddy/src/learning/capabilities/figures/freeform/tools/render-freeform-figure.ts",
  "packages/buddy/src/learning/capabilities/figures/geometry/tools/render-figure.ts",
  "packages/buddy/src/learning/capabilities/figures/mermaid/tools/render-mermaid.ts",
  "packages/buddy/src/learning/capabilities/flashcard/tools/save-flashcard-deck.ts",
  "packages/buddy/src/learning/capabilities/lesson-workspace/tools/add-file.ts",
  "packages/buddy/src/learning/capabilities/lesson-workspace/tools/checkpoint.ts",
  "packages/buddy/src/learning/capabilities/lesson-workspace/tools/restore-checkpoint.ts",
  "packages/buddy/src/learning/capabilities/lesson-workspace/tools/set-lesson.ts",
  "packages/buddy/src/learning/capabilities/lesson-workspace/tools/start-lesson.ts",
  "packages/buddy/src/learning/capabilities/math/tools/python-calculator.ts",
  "packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/debug-attempt.ts",
  "packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/prepare-resource.ts",
  "packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/reflection.ts",
  "packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/resource-ingest-full-text.ts",
  "packages/buddy/src/learning/capabilities/pedagogy/tools/definitions/stepwise-solve.ts",
  "packages/buddy/src/learning/capabilities/question-set/tools/save-question-set.ts",
  "packages/buddy/src/learning/curriculum/goals/tools/commit.ts",
  "packages/buddy/src/learning/curriculum/goals/tools/decide-scope.ts",
  "packages/buddy/src/learning/curriculum/goals/tools/lint.ts",
  "packages/buddy/src/learning/curriculum/goals/tools/state.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/get-crosswalk.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/get-learning-components.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/get-next-standards.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/get-prerequisites.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/get-standard.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/query-standards-sql.ts",
  "packages/buddy/src/learning/knowledge-graph/tools/search-standards.ts",
  "packages/buddy/src/learning/learner-model/tools/assessment-record.ts",
  "packages/buddy/src/learning/learner-model/tools/practice-record.ts",
  "packages/buddy/src/learning/learner-model/tools/query.ts",
]

function toConstantName(fileName: string): string {
  const base = path.basename(fileName, ".ts")
  return base.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase() + "_DESCRIPTION"
}

function extractDescription(
  content: string,
): { description: string; fullMatch: string; startIndex: number; endIndex: number } | null {
  // Try dedent template literal first
  const dedentRegex =
    /description:\s*dedent`([\s\S]*?)`\s*,?\s*(?=\n\s*(?:parameters|async execute|execute|surfaces|workspaceStates|runtimeDependency|$))/m
  const dedentMatch = content.match(dedentRegex)
  if (dedentMatch) {
    return {
      description: dedentMatch[1].trim(),
      fullMatch: dedentMatch[0],
      startIndex: dedentMatch.index!,
      endIndex: dedentMatch.index! + dedentMatch[0].length,
    }
  }

  // Try regular string literal (double or single quotes), possibly multiline
  const stringRegex =
    /description:\s*("(?:[^"\\]|\\.|\\\n)*"|'(?:[^'\\]|\\.|\\\n)*')\s*,?\s*(?=\n\s*(?:parameters|async execute|execute|surfaces|workspaceStates|runtimeDependency|$))/m
  const stringMatch = content.match(stringRegex)
  if (stringMatch) {
    const raw = stringMatch[1]
    const quote = raw[0]
    let inner = raw.slice(1, -1)
    // Unescape escaped quotes and newlines
    inner = inner.replace(new RegExp(`\\\\${quote}`, "g"), quote)
    inner = inner.replace(/\\n/g, "\n")
    return {
      description: inner,
      fullMatch: stringMatch[0],
      startIndex: stringMatch.index!,
      endIndex: stringMatch.index! + stringMatch[0].length,
    }
  }

  return null
}

async function processFile(filePath: string) {
  const fullPath = path.resolve(filePath)
  const content = await readFile(fullPath, "utf-8")
  const extracted = extractDescription(content)

  if (!extracted) {
    console.log(`No description found in ${filePath}, skipping`)
    return
  }

  const dir = path.dirname(fullPath)
  const baseName = path.basename(filePath, ".ts")
  const mdFileName = `${baseName}.md`
  const mdFilePath = path.join(dir, mdFileName)
  const constantName = toConstantName(filePath)
  const importPath = `./${mdFileName}`

  // Check if import already exists
  if (content.includes(importPath)) {
    console.log(`Import already exists in ${filePath}, skipping`)
    return
  }

  // Write markdown file
  await writeFile(mdFilePath, extracted.description + "\n")
  console.log(`Created ${mdFilePath}`)

  // Check if dedent was used and is no longer needed
  const usesDedent = extracted.fullMatch.includes("dedent`")
  let newContent = content

  if (usesDedent) {
    // Remove dedent import if present
    newContent = newContent.replace(/import\s+dedent\s+from\s+["'][^"']+["']\s*\n?/, "")
    // Also remove any import { dedent } form
    newContent = newContent.replace(/import\s+{\s*dedent\s*}\s+from\s+["'][^"']+["']\s*\n?/, "")
  }

  // Replace the description with imported constant
  const replacement = `description: ${constantName},`
  newContent =
    newContent.slice(0, extracted.startIndex) + replacement + newContent.slice(extracted.endIndex)

  // Add import at the top
  const importStatement = `import ${constantName} from "${importPath}"\n`
  newContent = importStatement + newContent

  await writeFile(fullPath, newContent)
  console.log(`Updated ${filePath}`)
}

async function main() {
  for (const file of MODIFIED_TOOL_FILES) {
    try {
      await processFile(file)
    } catch (error) {
      console.error(`Error processing ${file}:`, error)
    }
  }
}

main()
