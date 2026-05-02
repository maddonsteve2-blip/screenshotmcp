import { Command } from "commander";
import chalk from "chalk";
import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { callTool, extractText, getApiUrl } from "../api.js";
import { getApiKey } from "../config.js";

interface CheckResult {
  name: string;
  status: "ok" | "warn" | "fail" | "skip";
  detail?: string;
  hint?: string;
}

/**
 * Diagnoses the most common DeepSyte setup problems in one shot.
 * Designed to be safe to run anywhere — every check fails closed and never
 * mutates state.
 */
export const doctorCommand = new Command("doctor")
  .description("Diagnose common DeepSyte setup problems (API key, network, project files, GH workflow)")
  .option("--json", "Emit machine-readable results on stdout")
  .option("--fix", "Auto-scaffold missing project files by running `init` before diagnosing")
  .action(async (opts: Record<string, boolean>) => {
    const jsonOnly = Boolean(opts.json);
    if (opts.fix && !jsonOnly) {
      // Run `init` in-process by invoking the same module so we scaffold the
      // same files the user would get from `deepsyte init`.
      console.log(chalk.bold("\u{1F527} Running init to scaffold missing files\u2026\n"));
      const { initCommand } = await import("./init.js");
      await initCommand.parseAsync(["node", "init"]);
      console.log("");
    }
    const cwd = process.cwd();
    const results: CheckResult[] = [];

    if (!jsonOnly) console.log(chalk.bold("\n\u{1F50D} DeepSyte doctor\n"));

    // 1. API key configured?
    const apiKey = getApiKey();
    if (!apiKey) {
      results.push({
        name: "API key",
        status: "fail",
        detail: "No API key found in config or env (SCREENSHOTSMCP_API_KEY).",
        hint: "Run `deepsyte login` or set SCREENSHOTSMCP_API_KEY.",
      });
    } else {
      results.push({
        name: "API key",
        status: "ok",
        detail: `Found (${apiKey.slice(0, 8)}\u2026${apiKey.slice(-4)}).`,
      });
    }

    // 2. API base URL reachable?
    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/health`, { method: "GET" });
      if (res.ok) {
        results.push({ name: "API reachable", status: "ok", detail: `${apiUrl}/health \u2192 ${res.status}` });
      } else {
        results.push({
          name: "API reachable",
          status: "warn",
          detail: `${apiUrl}/health responded ${res.status}`,
          hint: "Service may be degraded; check https://www.deepsyte.com.",
        });
      }
    } catch (err) {
      results.push({
        name: "API reachable",
        status: "fail",
        detail: `${apiUrl} \u2014 ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check your network connection or proxy settings.",
      });
    }

    // 3. API key validates?
    if (apiKey) {
      try {
        const res = await callTool("list_recent_screenshots", { limit: 1 });
        const text = extractText(res);
        if (/invalid|revoked/i.test(text)) {
          results.push({
            name: "API key valid",
            status: "fail",
            detail: text.slice(0, 200),
            hint: "Run `deepsyte login` again with a fresh key.",
          });
        } else {
          results.push({ name: "API key valid", status: "ok", detail: "Authenticated successfully." });
        }
      } catch (err) {
        results.push({
          name: "API key valid",
          status: "warn",
          detail: err instanceof Error ? err.message : String(err),
          hint: "Network error or transient API issue \u2014 retry shortly.",
        });
      }
    } else {
      results.push({ name: "API key valid", status: "skip", detail: "Skipped (no API key)." });
    }

    // 4. .deepsyte/urls.json
    results.push(await checkJsonFile(join(cwd, ".deepsyte/urls.json"), "Project URLs file"));

    // 5. .deepsyte/budget.json
    results.push(await checkJsonFile(join(cwd, ".deepsyte/budget.json"), "Audit budget file"));

    // 6. agents.json (optional)
    results.push(await checkJsonFile(join(cwd, "agents.json"), "agents.json manifest", true));

    // 7. GH workflow file
    const wfPath = join(cwd, ".github/workflows/deepsyte.yml");
    try {
      await stat(wfPath);
      results.push({ name: "GitHub Action workflow", status: "ok", detail: ".github/workflows/deepsyte.yml present." });
    } catch {
      results.push({
        name: "GitHub Action workflow",
        status: "skip",
        detail: "Not present (optional).",
        hint: "Run `deepsyte init` to scaffold the PR audit workflow.",
      });
    }

    // 8. Version available + latest on npm
    let localVersion: string | undefined;
    try {
      const pkgPath = resolve(new URL(import.meta.url).pathname, "..", "..", "package.json").replace(/^\\/, "");
      const text = await readFile(pkgPath, "utf8");
      const pkg = JSON.parse(text) as { version?: string };
      localVersion = pkg.version;
    } catch {
      // not fatal
    }
    if (localVersion) {
      try {
        const res = await fetch("https://registry.npmjs.org/deepsyte", {
          headers: { Accept: "application/vnd.npm.install-v1+json" },
        });
        if (res.ok) {
          const json = (await res.json()) as { "dist-tags"?: { latest?: string } };
          const latest = json["dist-tags"]?.latest;
          if (latest && compareSemver(localVersion, latest) < 0) {
            results.push({
              name: "CLI version",
              status: "warn",
              detail: `deepsyte@${localVersion} (latest: ${latest})`,
              hint: "Run `deepsyte upgrade` to update.",
            });
          } else {
            results.push({ name: "CLI version", status: "ok", detail: `deepsyte@${localVersion} (up to date)` });
          }
        } else {
          results.push({ name: "CLI version", status: "ok", detail: `deepsyte@${localVersion}` });
        }
      } catch {
        results.push({ name: "CLI version", status: "ok", detail: `deepsyte@${localVersion}` });
      }
    }

    if (jsonOnly) {
      const exitCode = results.some((r) => r.status === "fail") ? 1 : 0;
      console.log(JSON.stringify({ ok: exitCode === 0, results }, null, 2));
      process.exit(exitCode);
      return;
    }

    for (const r of results) {
      const icon = r.status === "ok"
        ? chalk.green("\u2713")
        : r.status === "warn"
          ? chalk.yellow("\u26A0")
          : r.status === "fail"
            ? chalk.red("\u2717")
            : chalk.dim("\u2192");
      const name = r.status === "fail" ? chalk.red(r.name) : r.status === "warn" ? chalk.yellow(r.name) : r.name;
      console.log(`  ${icon} ${name}`);
      if (r.detail) console.log(`      ${chalk.dim(r.detail)}`);
      if (r.hint) console.log(`      ${chalk.cyan("\u2192")} ${r.hint}`);
    }

    const failed = results.filter((r) => r.status === "fail").length;
    const warned = results.filter((r) => r.status === "warn").length;
    console.log("");
    if (failed === 0 && warned === 0) {
      console.log(chalk.green.bold("All checks passed."));
      process.exit(0);
    } else if (failed === 0) {
      console.log(chalk.yellow.bold(`${warned} warning${warned === 1 ? "" : "s"} \u2014 setup likely usable.`));
      process.exit(0);
    } else {
      console.log(chalk.red.bold(`${failed} failure${failed === 1 ? "" : "s"} \u2014 fix the items above and re-run.`));
      process.exit(1);
    }
  });

async function checkJsonFile(path: string, label: string, optional = false): Promise<CheckResult> {
  try {
    const text = await readFile(path, "utf8");
    JSON.parse(text);
    return { name: label, status: "ok", detail: relativise(path) };
  } catch (err) {
    if (err instanceof Error && err.message.includes("ENOENT")) {
      return optional
        ? { name: label, status: "skip", detail: `${relativise(path)} (optional)` }
        : {
            name: label,
            status: "warn",
            detail: `${relativise(path)} not found.`,
            hint: "Run `deepsyte init` to scaffold defaults.",
          };
    }
    return {
      name: label,
      status: "fail",
      detail: `${relativise(path)} could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Open the file and fix the JSON syntax.",
    };
  }
}

function relativise(path: string): string {
  return path.startsWith(process.cwd()) ? path.slice(process.cwd().length).replace(/^[\\/]+/, "") : path;
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
