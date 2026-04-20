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
  .description("Scaffold .screenshotsmcp/ (urls.json + budget.json) and an agents.json manifest in the current directory")
  .option("--force", "Overwrite existing files instead of skipping")
  .option("--no-agents", "Skip writing agents.json at the project root")
  .option("--no-github-action", "Skip writing .github/workflows/screenshotsmcp.yml")
  .action(async (opts: Record<string, boolean>) => {
    const force = Boolean(opts.force);
    const writeAgents = opts.agents !== false;
    const writeWorkflow = opts.githubAction !== false;

    const cwd = process.cwd();
    const created: string[] = [];
    const skipped: string[] = [];

    await ensureFile(
      join(cwd, ".screenshotsmcp/urls.json"),
      JSON.stringify(URLS_TEMPLATE, null, 2) + "\n",
      force,
      created,
      skipped,
    );
    await ensureFile(
      join(cwd, ".screenshotsmcp/budget.json"),
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
          join(cwd, ".github/workflows/screenshotsmcp.yml"),
          wfTpl,
          force,
          created,
          skipped,
        );
      }
    }

    console.log("");
    if (created.length > 0) {
      console.log(chalk.green.bold(`Created ${created.length} file${created.length === 1 ? "" : "s"}:`));
      for (const f of created) console.log(`  ${chalk.green("+")} ${chalk.cyan(relative(cwd, f))}`);
    }
    if (skipped.length > 0) {
      console.log(chalk.yellow.bold(`\nSkipped ${skipped.length} existing file${skipped.length === 1 ? "" : "s"} (use --force to overwrite):`));
      for (const f of skipped) console.log(`  ${chalk.yellow("\u2207")} ${chalk.dim(relative(cwd, f))}`);
    }
    console.log("");
    console.log(chalk.bold("Next steps:"));
    console.log(`  1. Edit ${chalk.cyan(".screenshotsmcp/urls.json")} with your real URLs`);
    console.log(`  2. Tweak ${chalk.cyan(".screenshotsmcp/budget.json")} thresholds if needed`);
    console.log(`  3. Run ${chalk.cyan("screenshotsmcp check")} locally to confirm`);
    if (writeWorkflow) {
      console.log(`  4. Add ${chalk.cyan("SCREENSHOTSMCP_API_KEY")} to your GitHub repo secrets`);
      console.log(`  5. Push the workflow \u2014 PRs will get audited automatically`);
    }
  });

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
