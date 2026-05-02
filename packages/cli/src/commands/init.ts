import { Command } from "commander";
import chalk from "chalk";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const URLS_TEMPLATE = {
  urls: [
    { url: "https://example.com", label: "Homepage" },
    { url: "https://example.com/pricing", label: "Pricing", tags: ["marketing"] },
  ],
};

const BUDGET_TEMPLATE = {
  maxFindingsPerUrl: 10,
  maxTotalFindings: 50,
  warnThreshold: 20,
};

export const initCommand = new Command("init")
  .description("Scaffold .deepsyte/ (urls.json + budget.json) and an agents.json manifest in the current directory")
  .option("--force", "Overwrite existing files instead of skipping")
  .option("--no-agents", "Skip writing agents.json at the project root")
  .option("--no-github-action", "Skip writing .github/workflows/deepsyte.yml")
  .option("--next-steps-only", "Only print the post-setup checklist; don't scaffold any files")
  .action(async (opts: Record<string, boolean>) => {
    const force = Boolean(opts.force);
    const writeAgents = opts.agents !== false;
    const writeWorkflow = opts.githubAction !== false;
    const stepsOnly = Boolean(opts.nextStepsOnly);

    if (stepsOnly) {
      printNextSteps(writeWorkflow);
      return;
    }

    const cwd = process.cwd();
    const created: string[] = [];
    const skipped: string[] = [];

    await ensureFile(
      join(cwd, ".deepsyte/urls.json"),
      JSON.stringify(URLS_TEMPLATE, null, 2) + "\n",
      force,
      created,
      skipped,
    );
    await ensureFile(
      join(cwd, ".deepsyte/budget.json"),
      JSON.stringify(BUDGET_TEMPLATE, null, 2) + "\n",
      force,
      created,
      skipped,
    );

    if (writeAgents) {
      const agentsTpl = await readTemplate("agents.json");
      if (agentsTpl) {
        await ensureFile(join(cwd, "agents.json"), agentsTpl, force, created, skipped);
      }
    }

    if (writeWorkflow) {
      const wfTpl = await readTemplate("github-action-check.yml");
      if (wfTpl) {
        await ensureFile(
          join(cwd, ".github/workflows/deepsyte.yml"),
          wfTpl,
          force,
          created,
          skipped,
        );
      }
      const baselinesTpl = await readTemplate("github-action-baselines.yml");
      if (baselinesTpl) {
        await ensureFile(
          join(cwd, ".github/workflows/deepsyte-baselines.yml"),
          baselinesTpl,
          force,
          created,
          skipped,
        );
      }
    }

    await patchGitignore(cwd, created, skipped);

    console.log("");
    if (created.length > 0) {
      console.log(chalk.green.bold(`Created ${created.length} file${created.length === 1 ? "" : "s"}:`));
      for (const f of created) console.log(`  ${chalk.green("+")} ${chalk.cyan(relative(cwd, f))}`);
    }
    if (skipped.length > 0) {
      console.log(chalk.yellow.bold(`\nSkipped ${skipped.length} existing file${skipped.length === 1 ? "" : "s"} (use --force to overwrite):`));
      for (const f of skipped) console.log(`  ${chalk.yellow("\u2207")} ${chalk.dim(relative(cwd, f))}`);
    }
    printNextSteps(writeWorkflow);
  });

function printNextSteps(includeWorkflow: boolean): void {
  console.log("");
  console.log(chalk.bold("Next steps:"));
  console.log(`  1. Edit ${chalk.cyan(".deepsyte/urls.json")} with your real URLs`);
  console.log(`  2. Tweak ${chalk.cyan(".deepsyte/budget.json")} thresholds if needed`);
  console.log(`  3. Run ${chalk.cyan("deepsyte check")} locally to confirm`);
  if (includeWorkflow) {
    console.log(`  4. Add ${chalk.cyan("deepsyte_API_KEY")} to your GitHub repo secrets`);
    console.log(`  5. Push the workflow \u2014 PRs will get audited automatically`);
  }
}

const GITIGNORE_MARKER = "# deepsyte";
const GITIGNORE_BLOCK = `${GITIGNORE_MARKER}
deepsyte-report.html
        deepsyte-report.md
shots/
*.diff.png
`;

/**
 * Appends a small ignore block to `.gitignore` for transient artifacts
 * (`check --report html` output, batch `save` folder, diff overlays).
 * No-op when the marker is already present so re-running `init` is safe.
 */
async function patchGitignore(cwd: string, created: string[], skipped: string[]): Promise<void> {
  const path = join(cwd, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(path, "utf8");
  } catch {
    // file absent — create it with just our block
    await writeFile(path, GITIGNORE_BLOCK, "utf8");
    created.push(path);
    return;
  }
  if (existing.includes(GITIGNORE_MARKER)) {
    skipped.push(path);
    return;
  }
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(path, existing + separator + GITIGNORE_BLOCK, "utf8");
  created.push(path);
}

function relative(cwd: string, file: string): string {
  return file.startsWith(cwd) ? file.slice(cwd.length).replace(/^[\\/]+/, "") : file;
}

async function ensureFile(
  path: string,
  contents: string,
  force: boolean,
  created: string[],
  skipped: string[],
): Promise<void> {
  const absolute = resolve(path);
  if (!force) {
    try {
      await stat(absolute);
      skipped.push(absolute);
      return;
    } catch {
      // fall through and create
    }
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, "utf8");
  created.push(absolute);
}

async function readTemplate(name: string): Promise<string | undefined> {
  // After bundling, the templates folder sits next to dist/, so resolve from there.
  const candidates = [
    resolve(__dirname, "..", "templates", name),
    resolve(__dirname, "..", "..", "templates", name),
  ];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      continue;
    }
  }
  return undefined;
}
