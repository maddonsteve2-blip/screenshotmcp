import { Command } from "commander";
import chalk from "chalk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DEFAULT_BUDGET, parseBudgetJson, type AuditBudget } from "../budget.js";

const BUDGET_PATH = ".deepsyte/budget.json";

const ALLOWED_KEYS = ["maxFindingsPerUrl", "maxTotalFindings", "warnThreshold", "categories"] as const;
type BudgetKey = (typeof ALLOWED_KEYS)[number];

function isAllowed(value: string): value is BudgetKey {
  return (ALLOWED_KEYS as readonly string[]).includes(value);
}

async function loadOrDefault(): Promise<AuditBudget> {
  const path = resolve(process.cwd(), BUDGET_PATH);
  try {
    const text = await readFile(path, "utf8");
    return parseBudgetJson(text).budget;
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

async function persist(budget: AuditBudget): Promise<string> {
  const path = resolve(process.cwd(), BUDGET_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(budget, null, 2) + "\n", "utf8");
  return path;
}

export const budgetCommand = new Command("budget").description("Inspect and edit .deepsyte/budget.json without hand-editing JSON.");

budgetCommand
  .command("show")
  .alias("get")
  .description("Print the active budget (defaults if no budget.json exists)")
  .action(async () => {
    const budget = await loadOrDefault();
    console.log(chalk.bold("Active audit budget:"));
    console.log(`  ${chalk.cyan("maxFindingsPerUrl")}  ${budget.maxFindingsPerUrl}`);
    console.log(`  ${chalk.cyan("maxTotalFindings")}   ${budget.maxTotalFindings}`);
    console.log(`  ${chalk.cyan("warnThreshold")}      ${budget.warnThreshold}`);
    console.log(`  ${chalk.cyan("categories")}         ${budget.categories?.join(", ") ?? chalk.dim("(all)")}`);
  });

budgetCommand
  .command("set <key> <value>")
  .description(`Set a budget key (${ALLOWED_KEYS.join(", ")}). Lists use comma-separated values.`)
  .action(async (key: string, value: string) => {
    if (!isAllowed(key)) {
      console.error(chalk.red(`Unknown key '${key}'. Allowed: ${ALLOWED_KEYS.join(", ")}`));
      process.exit(2);
      return;
    }
    const budget = await loadOrDefault();
    if (key === "categories") {
      const categories = value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      budget.categories = categories.length > 0 ? categories : undefined;
    } else {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n < 1) {
        console.error(chalk.red(`Value must be a positive integer for '${key}'.`));
        process.exit(2);
        return;
      }
      budget[key] = n;
    }
    const path = await persist(budget);
    console.log(`${chalk.green("\u2713")} ${chalk.cyan(key)} = ${value}`);
    console.log(chalk.dim(`  written to ${path}`));
  });

budgetCommand
  .command("reset")
  .description("Reset every budget key to its default value")
  .action(async () => {
    const path = await persist({ ...DEFAULT_BUDGET });
    console.log(`${chalk.green("\u2713")} reset budget to defaults`);
    console.log(chalk.dim(`  written to ${path}`));
  });
