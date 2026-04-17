import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultEvalRoot = resolve(repoRoot, "evals", "agent-harness");

function nowStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildRulesFromSets(allRuleSets, names = []) {
  return names.flatMap((name) => {
    const rules = allRuleSets[name];
    if (!Array.isArray(rules)) {
      throw new Error(`Unknown rule set: ${name}`);
    }
    return rules;
  });
}

function evaluateTextRule(text, rule) {
  const subject = normalizeText(text);
  const label = rule.label || rule.value;
  if (rule.type === "regex") {
    const regex = new RegExp(rule.value, rule.flags || "i");
    return { passed: regex.test(subject), label, weight: rule.weight || 1 };
  }
  return {
    passed: subject.toLowerCase().includes(String(rule.value).toLowerCase()),
    label,
    weight: rule.weight || 1,
  };
}

function normalizeToolCalls(raw) {
  const payload = Array.isArray(raw) ? raw : Array.isArray(raw?.calls) ? raw.calls : [];
  return payload
    .map((entry) => entry?.toolName || entry?.tool || entry?.name || "")
    .filter(Boolean);
}

function evaluateToolRule(toolCalls, rule) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const names = Array.isArray(rule.tools) ? rule.tools : [rule.tool];
  const count = calls.filter((toolName) => names.includes(toolName)).length;
  const label = rule.label || `${rule.mode}:${names.join(",")}`;
  const value = Number(rule.value || 0);
  if (rule.mode === "min_count") {
    return { passed: count >= value, label, weight: rule.weight || 1, observed: count };
  }
  if (rule.mode === "max_count") {
    return { passed: count <= value, label, weight: rule.weight || 1, observed: count };
  }
  if (rule.mode === "max_combined_count") {
    return { passed: count <= value, label, weight: rule.weight || 1, observed: count };
  }
  if (rule.mode === "min_any_count") {
    return { passed: count >= value, label, weight: rule.weight || 1, observed: count };
  }
  throw new Error(`Unsupported tool rule mode: ${rule.mode}`);
}

export function getEvalPaths(evalRoot = defaultEvalRoot) {
  return {
    evalRoot,
    tasksDir: join(evalRoot, "tasks"),
    fixturesPath: join(evalRoot, "fixtures", "rule-sets.json"),
    runsDir: join(evalRoot, "runs"),
  };
}

export function listTaskIds(evalRoot = defaultEvalRoot) {
  const { tasksDir } = getEvalPaths(evalRoot);
  if (!existsSync(tasksDir)) {
    return [];
  }
  return readdirSync(tasksDir)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.replace(/\.json$/, ""))
    .sort();
}

export function loadTask(taskId, evalRoot = defaultEvalRoot) {
  const { tasksDir } = getEvalPaths(evalRoot);
  const filePath = join(tasksDir, `${taskId}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Unknown task: ${taskId}`);
  }
  return readJson(filePath);
}

export function loadRuleSets(evalRoot = defaultEvalRoot) {
  const { fixturesPath } = getEvalPaths(evalRoot);
  return readJson(fixturesPath);
}

export function createRun(taskId, options = {}) {
  const evalRoot = options.evalRoot || defaultEvalRoot;
  const task = loadTask(taskId, evalRoot);
  const { runsDir } = getEvalPaths(evalRoot);
  ensureDir(runsDir);
  const label = options.label ? `-${String(options.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "";
  const runId = `${nowStamp(options.date)}-${taskId}${label}`;
  const runDir = join(runsDir, runId);
  ensureDir(runDir);
  writeFileSync(join(runDir, "prompt.md"), `${task.request}\n`, "utf8");
  writeFileSync(join(runDir, "first-response.md"), "", "utf8");
  writeJson(join(runDir, "tool-calls.json"), []);
  writeFileSync(join(runDir, "notes.md"), "", "utf8");
  writeJson(join(runDir, "manifest.json"), {
    runId,
    taskId,
    title: task.title,
    createdAt: new Date(options.date || Date.now()).toISOString(),
    status: "initialized",
    requiredFiles: task.requiredFiles,
    request: task.request,
  });
  return { runDir, runId, task };
}

export function scoreRun(runDir, options = {}) {
  const evalRoot = options.evalRoot || defaultEvalRoot;
  const manifestPath = join(runDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Run manifest not found in ${runDir}`);
  }
  const manifest = readJson(manifestPath);
  const task = loadTask(manifest.taskId, evalRoot);
  const ruleSets = loadRuleSets(evalRoot);
  const responseRules = [
    ...buildRulesFromSets(ruleSets.response, task.responseRequiredRuleSets),
    ...(task.responseRequiredRules || []),
  ];
  const responseForbiddenRules = [
    ...buildRulesFromSets(ruleSets.response, task.responseForbiddenRuleSets),
    ...(task.responseForbiddenRules || []),
  ];
  const requiredFiles = Array.from(new Set([...(task.requiredFiles || []), "manifest.json"]));
  const fileChecks = requiredFiles.map((fileName) => {
    const present = existsSync(join(runDir, fileName));
    return {
      category: "artifacts",
      id: `artifact:${fileName}`,
      label: `has ${fileName}`,
      weight: 1,
      passed: present,
    };
  });
  const responseText = existsSync(join(runDir, "first-response.md")) ? readFileSync(join(runDir, "first-response.md"), "utf8") : "";
  const responseChecks = responseRules.map((rule, index) => {
    const result = evaluateTextRule(responseText, rule);
    return {
      category: "response",
      id: `response:${index}`,
      label: result.label,
      weight: result.weight,
      passed: result.passed,
    };
  });
  const responseForbiddenChecks = responseForbiddenRules.map((rule, index) => {
    const result = evaluateTextRule(responseText, rule);
    return {
      category: "response-forbidden",
      id: `response-forbidden:${index}`,
      label: result.label,
      weight: result.weight,
      passed: !result.passed,
    };
  });
  const rawToolCalls = existsSync(join(runDir, "tool-calls.json")) ? readJson(join(runDir, "tool-calls.json")) : [];
  const toolCalls = normalizeToolCalls(rawToolCalls);
  const toolChecks = (task.toolRules || []).map((rule) => {
    const result = evaluateToolRule(toolCalls, rule);
    return {
      category: "tools",
      id: `tool:${rule.id}`,
      label: result.label,
      weight: result.weight,
      passed: result.passed,
      observed: result.observed,
    };
  });
  const checks = [...fileChecks, ...responseChecks, ...responseForbiddenChecks, ...toolChecks];
  const maxScore = checks.reduce((sum, check) => sum + check.weight, 0);
  const earnedScore = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  const failedChecks = checks.filter((check) => !check.passed);
  const summary = {
    runId: manifest.runId,
    taskId: manifest.taskId,
    title: task.title,
    passed: failedChecks.length === 0,
    earnedScore,
    maxScore,
    percent: maxScore === 0 ? 100 : Math.round((earnedScore / maxScore) * 100),
    checks,
    toolCalls,
    scoredAt: new Date().toISOString(),
  };
  writeJson(join(runDir, "score.json"), summary);
  writeJson(manifestPath, {
    ...manifest,
    status: summary.passed ? "passed" : "failed",
    lastScoredAt: summary.scoredAt,
    percent: summary.percent,
    earnedScore,
    maxScore,
  });
  return summary;
}

export function summarizeRuns(evalRoot = defaultEvalRoot) {
  const { runsDir } = getEvalPaths(evalRoot);
  if (!existsSync(runsDir)) {
    return [];
  }
  return readdirSync(runsDir)
    .map((entry) => join(runsDir, entry))
    .filter((runDir) => existsSync(join(runDir, "score.json")))
    .map((runDir) => readJson(join(runDir, "score.json")))
    .sort((left, right) => left.runId.localeCompare(right.runId));
}

export function resolveRunDir(input, evalRoot = defaultEvalRoot) {
  const { runsDir } = getEvalPaths(evalRoot);
  const directPath = resolve(input);
  if (existsSync(directPath)) {
    return directPath;
  }
  const nestedPath = join(runsDir, basename(input));
  if (existsSync(nestedPath)) {
    return nestedPath;
  }
  throw new Error(`Run directory not found: ${input}`);
}
