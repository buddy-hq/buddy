import { runKnowledgeGraphUpdate } from "./knowledge-graph/build"

await runKnowledgeGraphUpdate(process.argv.slice(2))
