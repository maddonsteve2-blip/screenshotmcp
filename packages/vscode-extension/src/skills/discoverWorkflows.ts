import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join, relative } from "path";

export interface DiscoveredWorkflow {
  /** Absolute path to the WORKFLOW.md file. */
  path: string;
  /** Skill the workflow belongs to (`~/.agents/skills/<skill>`). */
  skill: string;
  /** Workflow identifier, e.g. `sitewide-performance-audit`. */
  id: string;
  /** Relative path inside the skill, e.g. `workflows/sitewide-performance-audit/WORKFLOW.md`. */
  relativePath: string;
  /** First markdown H1 if present, otherwise derived from the directory name. */
  title: string;
}

/**
 * Scans `~/.agents/skills/<skill>/workflows/<id>/WORKFLOW.md` for every
 * installed skill and returns the discovered workflows. Pure-ish: reads
 * filesystem but no VS Code APIs, so easy to test if needed later.
 */
export function discoverWorkflows(skillsRoot: string = join(homedir(), ".agents", "skills")): DiscoveredWorkflow[] {
  if (!existsSync(skillsRoot)) {
    return [];
  }
  const out: DiscoveredWorkflow[] = [];
  for (const skill of safeReadDir(skillsRoot)) {
    const workflowsDir = join(skillsRoot, skill, "workflows");
    if (!existsSync(workflowsDir)) {
      continue;
    }
    for (const id of safeReadDir(workflowsDir)) {
      const filePath = join(workflowsDir, id, "WORKFLOW.md");
      if (!existsSync(filePath)) {
        continue;
      }
      const relativePath = relative(join(skillsRoot, skill), filePath);
      let title = humanize(id);
      try {
        const content = readFileSync(filePath, "utf8");
        const h1 = content.match(/^#\s+(.+)$/m);
        if (h1) {
          title = h1[1].trim();
        }
      } catch {
        // ignore, fall back to directory-derived title
      }
      out.push({ path: filePath, skill, id, relativePath, title });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function humanize(id: string): string {
  return id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
