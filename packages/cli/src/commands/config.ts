import { Command } from "commander";
import chalk from "chalk";
import {
  getApiKey,
  setApiKey,
  getApiUrl,
  setApiUrl,
  clearConfig,
  getConfigPath,
} from "../config.js";

const ALLOWED_KEYS = ["apiKey", "apiUrl"] as const;
type ConfigKey = (typeof ALLOWED_KEYS)[number];

const READERS: Record<ConfigKey, () => string> = {
  apiKey: getApiKey,
  apiUrl: getApiUrl,
};

const WRITERS: Record<ConfigKey, (value: string) => void> = {
  apiKey: setApiKey,
  apiUrl: setApiUrl,
};

function maskKey(key: ConfigKey, value: string): string {
  if (key === "apiKey" && value.length > 12) {
    return `${value.slice(0, 8)}\u2026${value.slice(-4)}`;
  }
  return value || chalk.dim("(unset)");
}

function isAllowedKey(value: string): value is ConfigKey {
  return (ALLOWED_KEYS as readonly string[]).includes(value);
}

export const configCommand = new Command("config")
  .description("Manage CLI config (API key, API URL) without editing JSON.");

configCommand
  .command("list")
  .alias("ls")
  .description("Print every config key and its current value")
  .option("--reveal", "Show the API key in full instead of masking")
  .action((opts: Record<string, boolean>) => {
    console.log(chalk.dim(`Config file: ${getConfigPath()}`));
    console.log("");
    for (const key of ALLOWED_KEYS) {
      const value = READERS[key]();
      const display = opts.reveal && key === "apiKey" ? value || chalk.dim("(unset)") : maskKey(key, value);
      console.log(`  ${chalk.cyan(key.padEnd(8))}  ${display}`);
    }
  });

configCommand
  .command("get <key>")
  .description(`Print the current value of a config key (${ALLOWED_KEYS.join(", ")})`)
  .action((key: string) => {
    if (!isAllowedKey(key)) {
      console.error(chalk.red(`Unknown key '${key}'. Allowed: ${ALLOWED_KEYS.join(", ")}`));
      process.exit(2);
      return;
    }
    const value = READERS[key]();
    if (!value) {
      console.error(chalk.dim("(unset)"));
      process.exit(1);
      return;
    }
    process.stdout.write(value + "\n");
  });

configCommand
  .command("set <key> <value>")
  .description(`Set a config key (${ALLOWED_KEYS.join(", ")})`)
  .action((key: string, value: string) => {
    if (!isAllowedKey(key)) {
      console.error(chalk.red(`Unknown key '${key}'. Allowed: ${ALLOWED_KEYS.join(", ")}`));
      process.exit(2);
      return;
    }
    if (!value) {
      console.error(chalk.red("Value required."));
      process.exit(2);
      return;
    }
    if (key === "apiUrl" && !/^https?:\/\//i.test(value)) {
      console.error(chalk.red("apiUrl must start with http:// or https://"));
      process.exit(2);
      return;
    }
    WRITERS[key](value);
    console.log(`${chalk.green("\u2713")} ${chalk.cyan(key)} = ${maskKey(key, value)}`);
  });

configCommand
  .command("unset <key>")
  .description("Clear a single config key (sets it to empty string)")
  .action((key: string) => {
    if (!isAllowedKey(key)) {
      console.error(chalk.red(`Unknown key '${key}'. Allowed: ${ALLOWED_KEYS.join(", ")}`));
      process.exit(2);
      return;
    }
    WRITERS[key]("");
    console.log(`${chalk.green("\u2713")} cleared ${chalk.cyan(key)}`);
  });

configCommand
  .command("clear")
  .description("Reset every CLI config value to its default")
  .action(() => {
    clearConfig();
    console.log(chalk.green("\u2713 cleared all config"));
  });

configCommand
  .command("path")
  .description("Print the absolute path of the CLI config file")
  .action(() => {
    process.stdout.write(getConfigPath() + "\n");
  });
