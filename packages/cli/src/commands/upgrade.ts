import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface NpmPackumentDist {
  latest?: string;
}

interface NpmPackument {
  "dist-tags"?: NpmPackumentDist;
  versions?: Record<string, unknown>;
}

async function readLocalVersion(): Promise<string> {
  const candidates = [
    resolve(__dirname, "..", "package.json"),
    resolve(__dirname, "..", "..", "package.json"),
  ];
  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, "utf8");
      const parsed = JSON.parse(text) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      continue;
    }
  }
  return "unknown";
}

async function fetchLatestVersion(): Promise<string | undefined> {
  const res = await fetch("https://registry.npmjs.org/screenshotsmcp", {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as NpmPackument;
  return json["dist-tags"]?.latest;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const upgradeCommand = new Command("upgrade")
  .description("Self-update the CLI to the latest published version on npm")
  .option("--check", "Only check; don't install")
  .option("--force", "Re-install even if already on the latest version")
  .action(async (opts: Record<string, boolean>) => {
    const local = await readLocalVersion();
    console.log(chalk.dim(`Current: screenshotsmcp@${local}`));
    let latest: string | undefined;
    try {
      latest = await fetchLatestVersion();
    } catch (err) {
      console.error(chalk.red(`Could not reach npm registry: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
      return;
    }
    if (!latest) {
      console.error(chalk.red("npm registry returned no version info."));
      process.exit(1);
      return;
    }
    console.log(chalk.dim(`Latest:  screenshotsmcp@${latest}`));

    const cmp = local === "unknown" ? -1 : compareSemver(local, latest);
    if (cmp >= 0 && !opts.force) {
      console.log("");
      console.log(chalk.green("\u2713 Already up to date."));
      return;
    }

    if (opts.check) {
      console.log("");
      console.log(chalk.yellow(`\u2191 Update available: ${local} \u2192 ${latest}`));
      console.log(`  Run: ${chalk.cyan("screenshotsmcp upgrade")}`);
      process.exit(1);
      return;
    }

    console.log("");
    console.log(chalk.bold(`Installing screenshotsmcp@${latest}\u2026`));
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(cmd, ["install", "-g", `screenshotsmcp@${latest}`], {
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        console.log("");
        console.log(chalk.green(`\u2713 Upgraded to screenshotsmcp@${latest}`));
        process.exit(0);
      } else {
        console.error(chalk.red(`\u2717 npm install exited with code ${code}`));
        console.error(chalk.dim("If installation failed due to permissions, try with sudo or use a Node version manager (nvm, fnm, volta)."));
        process.exit(code ?? 1);
      }
    });
  });
