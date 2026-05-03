import * as vscode from "vscode";
import { homedir } from "os";
import { dirname, join } from "path";
import { DeepsyteServerProvider } from "./serverProvider";
import { getApiUrl } from "../settings";
import { WORKSPACE_MCP_PATH } from "../constants";

const AUTO_CONFIG_STATE_KEY = "deepsyte.autoConfiguredTarget";

type EditorKind = "vscode" | "cursor" | "windsurf" | "unknown";
type ResultStatus = "updated" | "unchanged" | "removed" | "native" | "skipped";

interface ManagedTargetState {
  editor: Exclude<EditorKind, "unknown">;
  path: string;
}

interface ConfigTarget {
  editor: Exclude<EditorKind, "unknown">;
  label: string;
  fileUri: vscode.Uri;
}

export interface AutoInstallResult {
  status: ResultStatus;
  editor: EditorKind;
  message: string;
  path?: string;
}

export class EditorMcpAutoInstaller {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly provider: DeepsyteServerProvider,
  ) {}

  async ensureConfigured(apiKey: string): Promise<AutoInstallResult> {
    const editor = detectEditorKind();

    if (editor === "vscode" && this.provider.supportsNativeDefinitions()) {
      await this.context.globalState.update(AUTO_CONFIG_STATE_KEY, undefined);
      return {
        status: "native",
        editor,
        message: "DeepSyte is available through VS Code's native MCP registration.",
      };
    }

    const target = getConfigTarget(editor);
    if (!target) {
      return {
        status: "skipped",
        editor,
        message: "Automatic MCP configuration is not available for this editor yet.",
      };
    }

    const existing = await readJsonFile(target.fileUri);
    const next = buildConfigForEditor(target.editor, existing, getApiUrl(), apiKey);
    const changed = JSON.stringify(existing) !== JSON.stringify(next);

    if (!changed) {
      return {
        status: "unchanged",
        editor,
        message: `${target.label} is already configured for DeepSyte.`,
        path: target.fileUri.fsPath,
      };
    }

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(target.fileUri.fsPath)));
    await vscode.workspace.fs.writeFile(target.fileUri, Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8"));
    await this.context.globalState.update(AUTO_CONFIG_STATE_KEY, {
      editor: target.editor,
      path: target.fileUri.fsPath,
    } satisfies ManagedTargetState);

    return {
      status: "updated",
      editor,
      message: `Configured DeepSyte automatically for ${target.label}.`,
      path: target.fileUri.fsPath,
    };
  }

  async clearConfigured(): Promise<AutoInstallResult> {
    const state = this.context.globalState.get<ManagedTargetState>(AUTO_CONFIG_STATE_KEY);
    if (!state) {
      return {
        status: "skipped",
        editor: detectEditorKind(),
        message: "No extension-managed MCP configuration was installed.",
      };
    }

    const fileUri = vscode.Uri.file(state.path);
    const existing = await readJsonFile(fileUri);
    const next = removeConfigForEditor(state.editor, existing);
    const changed = JSON.stringify(existing) !== JSON.stringify(next);

    if (!changed) {
      await this.context.globalState.update(AUTO_CONFIG_STATE_KEY, undefined);
      return {
        status: "unchanged",
        editor: state.editor,
        message: "The extension-managed MCP configuration was already removed.",
        path: state.path,
      };
    }

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8"));
    await this.context.globalState.update(AUTO_CONFIG_STATE_KEY, undefined);

    return {
      status: "removed",
      editor: state.editor,
      message: `Removed the extension-managed DeepSyte config from ${state.path}.`,
      path: state.path,
    };
  }
}

function detectEditorKind(): EditorKind {
  const uriScheme = vscode.env.uriScheme.toLowerCase();
  const appName = vscode.env.appName.toLowerCase();

  if (uriScheme.includes("windsurf") || appName.includes("windsurf")) {
    return "windsurf";
  }

  if (uriScheme.includes("cursor") || appName.includes("cursor")) {
    return "cursor";
  }

  if (uriScheme.includes("vscode") || appName.includes("visual studio code") || appName === "code") {
    return "vscode";
  }

  return "unknown";
}

function getConfigTarget(editor: EditorKind): ConfigTarget | undefined {
  if (editor === "cursor") {
    return {
      editor,
      label: "Cursor",
      fileUri: vscode.Uri.file(join(homedir(), ".cursor", "mcp.json")),
    };
  }

  if (editor === "windsurf") {
    return {
      editor,
      label: "Windsurf",
      fileUri: vscode.Uri.file(join(homedir(), ".codeium", "windsurf", "mcp_config.json")),
    };
  }

  if (editor === "vscode") {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }

    return {
      editor,
      label: "this VS Code workspace",
      fileUri: vscode.Uri.joinPath(folder.uri, WORKSPACE_MCP_PATH),
    };
  }

  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildConfigForEditor(
  editor: Exclude<EditorKind, "unknown">,
  existing: Record<string, unknown>,
  apiUrl: string,
  apiKey: string,
): Record<string, unknown> {
  if (editor === "vscode") {
    const existingMcp = isObject(existing.mcp) ? existing.mcp : {};
    const existingServers = isObject(existingMcp.servers) ? existingMcp.servers : {};
    return {
      ...existing,
      mcp: {
        ...existingMcp,
        servers: {
          ...existingServers,
          deepsyte: {
            type: "http",
            url: `${apiUrl}/mcp`,
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        },
      },
    };
  }

  const existingServers = isObject(existing.mcpServers) ? existing.mcpServers : {};

  if (editor === "cursor") {
    return {
      ...existing,
      mcpServers: {
        ...existingServers,
        deepsyte: {
          url: `${apiUrl}/mcp`,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      },
    };
  }

  return {
    ...existing,
    mcpServers: {
      ...existingServers,
        deepsyte: {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          serverUrl: `${apiUrl}/mcp`,
        },
    },
  };
}

function removeConfigForEditor(
  editor: Exclude<EditorKind, "unknown">,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (editor === "vscode") {
    const existingMcp = isObject(existing.mcp) ? existing.mcp : undefined;
    const existingServers = existingMcp && isObject(existingMcp.servers) ? { ...existingMcp.servers } : undefined;

    if (!existingMcp || !existingServers || !("deepsyte" in existingServers)) {
      return existing;
    }

    delete existingServers.deepsyte;
    const next = { ...existing };

    if (Object.keys(existingServers).length === 0) {
      const nextMcp = { ...existingMcp };
      delete nextMcp.servers;
      if (Object.keys(nextMcp).length === 0) {
        delete next.mcp;
      } else {
        next.mcp = nextMcp;
      }
      return next;
    }

    next.mcp = {
      ...existingMcp,
      servers: existingServers,
    };
    return next;
  }

  const existingServers = isObject(existing.mcpServers) ? { ...existing.mcpServers } : undefined;
  if (!existingServers || !("deepsyte" in existingServers)) {
    return existing;
  }

  delete existingServers.deepsyte;
  if (Object.keys(existingServers).length === 0) {
    const next = { ...existing };
    delete next.mcpServers;
    return next;
  }

  return {
    ...existing,
    mcpServers: existingServers,
  };
}

async function readJsonFile(uri: vscode.Uri): Promise<Record<string, unknown>> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");
    if (!text.trim()) {
      return {};
    }

    const parsed = JSON.parse(text) as unknown;
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
