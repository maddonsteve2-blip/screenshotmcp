"use client";

import { useState } from "react";
import { X, ArrowLeft, Copy, Check, ArrowRight, ExternalLink } from "lucide-react";

type Tool = {
  id: string;
  name: string;
  subtitle?: string;
  icon: string;
  category: string;
  config?: string;
  deepLink?: string;
  instructions: React.ReactNode;
};

const API_BASE = "https://deepsyte-api-production.up.railway.app";

const tools: Tool[] = [
  {
    id: "cursor",
    name: "Cursor",
    icon: "🔧",
    category: "IDEs",
    deepLink: "cursor://anysphere.cursor-mcp/install",
    instructions: (
      <div className="space-y-4">
        <p className="text-gray-700">Click the button below to install directly, or add manually:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open Cursor Settings → Features → MCP</li>
          <li>Click &quot;+ Add New MCP Server&quot;</li>
          <li>Set type to &quot;sse&quot; and paste your MCP URL</li>
        </ol>
      </div>
    ),
  },
  {
    id: "vscode",
    name: "VS Code",
    icon: "💻",
    category: "IDEs",
    deepLink: "vscode:mcp/install",
    instructions: (
      <div className="space-y-4">
        <p className="text-gray-700">Click the button below to install directly, or add manually:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open Command Palette (Ctrl+Shift+P)</li>
          <li>Type &quot;MCP: Add Server&quot;</li>
          <li>Paste your MCP URL</li>
        </ol>
      </div>
    ),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    icon: "🌊",
    category: "IDEs",
    instructions: (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open Windsurf Settings → MCP</li>
          <li>Click &quot;Add Server&quot;</li>
          <li>Paste your MCP URL</li>
        </ol>
      </div>
    ),
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    subtitle: "Custom Connector",
    icon: "🤖",
    category: "Claude",
    config: `{
  "mcpServers": {
    "deepsyte": {
      "url": "${API_BASE}/mcp"
    }
  }
}`,
    instructions: (
      <div className="space-y-4">
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open Claude Desktop → Settings (⚙️) → Developer</li>
          <li>Click &quot;Edit Config&quot;</li>
          <li>Add the config below and sign in when prompted</li>
          <li>Save and restart Claude Desktop</li>
        </ol>
      </div>
    ),
  },
  {
    id: "claude-code",
    name: "Claude Code",
    subtitle: "CLI",
    icon: "🎯",
    category: "Claude",
    config: `claude mcp add --transport http deepsyte -s user ${API_BASE}/mcp`,
    instructions: (
      <div className="space-y-4">
        <p className="text-gray-700">Run this command in your terminal:</p>
      </div>
    ),
  },
  {
    id: "mcp-url",
    name: "MCP URL",
    subtitle: "For Custom Clients",
    icon: "🔗",
    category: "MCP",
    config: `${API_BASE}/mcp`,
    instructions: (
      <div className="space-y-4">
        <p className="text-gray-700">Use this URL with any MCP-compatible client:</p>
      </div>
    ),
  },
  {
    id: "n8n",
    name: "N8N & Others",
    subtitle: "OAuth",
    icon: "⚡",
    category: "MCP",
    config: `URL: ${API_BASE}/mcp`,
    instructions: (
      <div className="space-y-4">
        <p className="text-gray-700">Use an OAuth-capable MCP client:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Set the MCP server URL</li>
          <li>Complete the browser sign-in prompt</li>
        </ol>
      </div>
    ),
  },
];

const categoryOrder = ["Claude", "IDEs", "MCP"];

export function InstallDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [copied, setCopied] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  const handleClose = () => {
    setSelectedTool(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="w-full max-w-[600px] mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {!selectedTool ? (
          <>
            {/* Main view - category grid */}
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 className="text-xl font-semibold text-gray-900">Use DeepSyte Anywhere</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open("/dashboard", "_blank")}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Get API Key
                </button>
                <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2">
              {categoryOrder.map((category) => {
                const categoryTools = tools.filter((t) => t.category === category);
                if (categoryTools.length === 0) return null;
                return (
                  <div key={category} className="mt-6 first:mt-2">
                    <p className="text-sm text-gray-400 mb-3">{category}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {categoryTools.map((tool) => (
                        <button
                          key={tool.id}
                          onClick={() => setSelectedTool(tool)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left bg-white"
                        >
                          <span className="text-xl shrink-0">{tool.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm">{tool.name}</div>
                            {tool.subtitle && (
                              <div className="text-xs text-gray-400">{tool.subtitle}</div>
                            )}
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Tool detail view */}
            <div className="flex items-center gap-3 px-6 pt-6 pb-4">
              <button
                onClick={() => setSelectedTool(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors -ml-2"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <span className="text-2xl">{selectedTool.icon}</span>
              <h2 className="text-xl font-semibold text-gray-900">{selectedTool.name}</h2>
              <div className="ml-auto">
                <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-5">
              {selectedTool.instructions}

              {selectedTool.config && (
                <div>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                    {selectedTool.config}
                  </pre>
                  <button
                    onClick={() => handleCopy(selectedTool.config!, "config")}
                    className="mt-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    {copied === "config" ? (
                      <><Check className="w-4 h-4" /> Copied!</>
                    ) : (
                      <><Copy className="w-4 h-4" /> Copy</>
                    )}
                  </button>
                </div>
              )}

              {selectedTool.deepLink && (
                <button
                  onClick={() => window.open(selectedTool.deepLink, "_blank")}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Install in {selectedTool.name}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
