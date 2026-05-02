import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { watch as fsWatch } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

const WATCH_TARGETS = [".deepsyte/urls.json", ".deepsyte/budget.json"];

/**
 * Re-runs `deepsyte check` whenever `.deepsyte/urls.json` or
 * `.deepsyte/budget.json` changes. Designed for "leave this in a
 * terminal while editing" workflows.
 */
export const watchCommand = new Command("watch")
  .description("Watch .deepsyte/{urls,budget}.json and re-run `check` on every change")
  .option("--debounce <ms>", "Wait N ms after the last change before re-running", "500")
  .option("--report <format>", "Forward --report to `check` (e.g. github-comment, html)")
  .option("--report-out <path>", "Forward --report-out to `check`")
  .action(async (opts: Record<string, string>) => {
    const debounceMs = Math.max(0, Number.parseInt(String(opts.debounce ?? "500"), 10) || 500);
    const cwd = process.cwd();

    const watchPaths: string[] = [];
    for (const rel of WATCH_TARGETS) {
      const abs = resolve(cwd, rel);
      try {
        await stat(abs);
        watchPaths.push(abs);
      } catch {
        // missing — `init` would create it; we still continue watching the others
      }
    }
    if (watchPaths.length === 0) {
      console.error(chalk.red("No watchable files found. Run `deepsyte init` first."));
      process.exit(1);
      return;
    }

    console.log(chalk.bold("\u{1F441}  Watching for changes:"));
    for (const p of watchPaths) console.log(`  ${chalk.dim(p)}`);
    console.log(chalk.dim("Press Ctrl+C to stop.\n"));

    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let pending = false;

    const runCheck = () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      const args = ["check"];
      if (opts.report) args.push("--report", opts.report);
      if (opts.reportOut) args.push("--report-out", opts.reportOut);
      console.log(chalk.cyan(`\u25B6 deepsyte ${args.join(" ")}`));
      const exe = process.execPath;
      const cliEntry = process.argv[1] ?? "";
      const child = spawn(exe, [cliEntry, ...args], { stdio: "inherit" });
      child.on("exit", (code) => {
        running = false;
        const tag = code === 0 ? chalk.green(`\u2713 done (${code})`) : chalk.red(`\u2717 exit ${code}`);
        console.log(`${tag}  ${chalk.dim(new Date().toLocaleTimeString())}`);
        if (pending) {
          pending = false;
          runCheck();
        }
      });
    };

    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(runCheck, debounceMs);
    };

    for (const p of watchPaths) {
      try {
        const watcher = fsWatch(p, { persistent: true }, () => trigger());
        watcher.on("error", (err) => console.error(chalk.yellow(`watch error on ${p}: ${err.message}`)));
      } catch (err) {
        console.error(chalk.yellow(`could not watch ${p}: ${err instanceof Error ? err.message : String(err)}`));
      }
    }

    // Run once on startup so the user sees the current state.
    runCheck();

    // Keep the process alive until SIGINT.
    process.stdin.resume();
  });
