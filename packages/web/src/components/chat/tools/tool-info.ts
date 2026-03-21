import { basename, dirname } from "../shared/utils";
import type { ToolInfo } from "./registry";

export function getToolInfo(
  tool: string,
  input: Record<string, unknown>,
): ToolInfo {
  const filePath =
    typeof input.filePath === "string" ? input.filePath : undefined;
  const path = typeof input.path === "string" ? input.path : undefined;
  const pattern = typeof input.pattern === "string" ? input.pattern : undefined;
  const include = typeof input.include === "string" ? input.include : undefined;
  const url = typeof input.url === "string" ? input.url : undefined;
  const query = typeof input.query === "string" ? input.query : undefined;
  const description =
    typeof input.description === "string" ? input.description : undefined;
  const subagent =
    typeof input.subagent_type === "string" ? input.subagent_type : undefined;
  const alt = typeof input.alt === "string" ? input.alt : undefined;

  switch (tool) {
    case "read": {
      const args: string[] = [];
      if (typeof input.offset === "number") args.push(`offset=${input.offset}`);
      if (typeof input.limit === "number") args.push(`limit=${input.limit}`);
      return {
        title: "Read",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
        args,
      };
    }
    case "list":
      return {
        title: "List",
        subtitle: path ? dirname(path) : "/",
      };
    case "glob":
      return {
        title: "Glob",
        subtitle: path ? dirname(path) : "/",
        args: pattern ? [`pattern=${pattern}`] : [],
      };
    case "grep": {
      const args: string[] = [];
      if (pattern) args.push(`pattern=${pattern}`);
      if (include) args.push(`include=${include}`);
      return {
        title: "Grep",
        subtitle: path ? dirname(path) : "/",
        args,
      };
    }
    case "webfetch":
      return {
        title: "Webfetch",
        subtitle: url,
      };
    case "websearch":
      return {
        title: "Websearch",
        subtitle: query,
      };
    case "codesearch":
      return {
        title: "Codesearch",
        subtitle: query,
      };
    case "task":
      return {
        title: subagent ? `Agent (${subagent})` : "Agent task",
        subtitle: description,
      };
    case "write":
      return {
        title: "Write",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      };
    case "edit":
      return {
        title: "Edit",
        subtitle: filePath ? basename(filePath) : undefined,
        detail: filePath ? dirname(filePath) : undefined,
      };
    case "apply_patch":
      return {
        title: "Patch",
        subtitle: description,
      };
    case "bash":
      return {
        title: "Shell",
        subtitle: description,
      };
    case "question":
      return {
        title: "Questions",
        subtitle: description,
      };
    case "python_calculator":
      return {
        title: "Python calculator",
        subtitle: description,
      };
    case "render_figure":
    case "render_freeform_figure":
      return {
        title: "Figure",
        subtitle: alt,
      };
    default:
      return {
        title: tool,
        subtitle: description,
      };
  }
}
