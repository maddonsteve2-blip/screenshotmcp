import * as vscode from "vscode";
import { AuthStore } from "../auth/store";
import { EXTENSION_DISPLAY_NAME, MCP_PROVIDER_ID } from "../constants";
import { logLine } from "../output";
import { getApiUrl } from "../settings";

export class DeepsyteServerProvider {
  private readonly didChangeEmitter = new vscode.EventEmitter<void>();

  constructor(private readonly authStore: AuthStore) {}

  supportsNativeDefinitions(): boolean {
    return Boolean(this.getLanguageModelNamespace()?.registerMcpServerDefinitionProvider);
  }

  register(): vscode.Disposable | undefined {
    const languageModelNamespace = this.getLanguageModelNamespace();
    if (!languageModelNamespace?.registerMcpServerDefinitionProvider) {
      logLine("VS Code MCP provider API is not available in this editor build.");
      return undefined;
    }

    return languageModelNamespace.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
      onDidChangeMcpServerDefinitions: this.didChangeEmitter.event,
      provideMcpServerDefinitions: async () => {
        const apiKey = await this.authStore.getApiKey();
        if (!apiKey) {
          return [];
        }
        return [this.createDefinition(apiKey)];
      },
      resolveMcpServerDefinition: async () => {
        const apiKey = await this.authStore.getApiKey();
        if (!apiKey) {
          return undefined;
        }
        return this.createDefinition(apiKey);
      },
    } as unknown);
  }

  private getLanguageModelNamespace(): { registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable } | undefined {
    return (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: (id: string, provider: unknown) => vscode.Disposable } }).lm;
  }

  refresh(): void {
    this.didChangeEmitter.fire();
  }

  private createDefinition(apiKey: string): unknown {
    const apiUrl = getApiUrl();
    const uri = vscode.Uri.parse(`${apiUrl}/mcp`);
    const VscodeApi = vscode as unknown as {
      McpHttpServerDefinition?: new (label: string, uri: vscode.Uri, headers?: Record<string, string>, version?: string) => unknown;
    };

    if (VscodeApi.McpHttpServerDefinition) {
      return new VscodeApi.McpHttpServerDefinition(EXTENSION_DISPLAY_NAME, uri, {
        Authorization: `Bearer ${apiKey}`,
      }, "0.0.1");
    }

    return {
      label: EXTENSION_DISPLAY_NAME,
      uri,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      version: "0.0.1",
    };
  }
}
