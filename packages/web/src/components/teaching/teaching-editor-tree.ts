import type { TeachingWorkspaceFile } from "@/state/teaching-runtime"

export type TeachingFileTreeNode =
  | {
      type: "directory"
      key: string
      name: string
      children: TeachingFileTreeNode[]
    }
  | {
      type: "file"
      key: string
      name: string
      file: TeachingWorkspaceFile
    }

type TeachingFileTreeBucket = {
  directories: Map<string, TeachingFileTreeBucket>
  files: TeachingWorkspaceFile[]
}

export type TeachingFileTreeRow = {
  depth: number
  node: TeachingFileTreeNode
}

function fileTreeNodesFromBucket(
  bucket: TeachingFileTreeBucket,
  prefix = "",
): TeachingFileTreeNode[] {
  const directoryNodes = Array.from(bucket.directories.entries())
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([segment, child]) => {
      const key = prefix ? `${prefix}/${segment}` : segment
      return {
        type: "directory" as const,
        key,
        name: segment,
        children: fileTreeNodesFromBucket(child, key),
      }
    })

  const fileNodes = [...bucket.files]
    .toSorted((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((file) => {
      const segments = file.relativePath.split("/")
      return {
        type: "file" as const,
        key: file.relativePath,
        name: segments[segments.length - 1] ?? file.relativePath,
        file,
      }
    })

  return [...directoryNodes, ...fileNodes]
}

export function buildFileTree(files: TeachingWorkspaceFile[]): TeachingFileTreeNode[] {
  const root: TeachingFileTreeBucket = {
    directories: new Map(),
    files: [],
  }

  function ensureDirectory(bucket: TeachingFileTreeBucket, segment: string) {
    const existing = bucket.directories.get(segment)
    if (existing) return existing

    const created: TeachingFileTreeBucket = {
      directories: new Map(),
      files: [],
    }
    bucket.directories.set(segment, created)
    return created
  }

  for (const file of files) {
    const segments = file.relativePath.split("/").filter(Boolean)
    if (segments.length === 0) continue

    let bucket = root

    for (let index = 0; index < segments.length - 1; index += 1) {
      bucket = ensureDirectory(bucket, segments[index]!)
    }

    bucket.files.push(file)
  }

  return fileTreeNodesFromBucket(root)
}

export function flattenFileTree(nodes: TeachingFileTreeNode[]): TeachingFileTreeRow[] {
  const rows: TeachingFileTreeRow[] = []

  function walk(treeNodes: TeachingFileTreeNode[], depth: number) {
    for (const node of treeNodes) {
      rows.push({ node, depth })
      if (node.type === "directory") {
        walk(node.children, depth + 1)
      }
    }
  }

  walk(nodes, 0)
  return rows
}
