"use client";

import { useState } from "react";
import { X, ArrowLeft, Copy, Check, Terminal, FileCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type Tool = {
  id: string;
  name: string;
  icon: string;
  category: string;
  instructions: string[];
  config?: string;
  deepLink?: string;
};

const tools: Tool[] = [
  {
    id: "cursor",
    name: "Cursor",
    icon: "🔧",
    category: "ides",
    instructions: [
      "1. Open Cursor",
      "2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)",
      "3. Type 'MCP' and select 'MCP: Add MCP Server'",
      "4. Paste this URL:",
      "https://railway.app/project/6f10eab1-3c75-4106-a6d5-0f032a3ae91f/service/5474e1ad-c01f-4f78-806f-d2ce863a793b",
      "5. Click 'Add Server'"
    ],
    deepLink: "cursor://extensions?search=mcp"
  },
  {
    id: "vscode",
    name: "VS Code",
    icon: "💻",
    category: "ides",
    instructions: [
      "1. Open VS Code",
      "2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)",
      "3. Type 'MCP' and select 'MCP: Add MCP Server'",
      "4. Paste this URL:",
      "https://railway.app/project/6f10eab1-3c75-4106-a6d5-0f032a3ae91f/service/5474e1ad-c01f-4f78-806f-d2ce863a793b",
      "5. Click 'Add Server'"
    ],
    deepLink: "vscode://extensions?search=mcp"
  },
  {
    id: "windsurf",
    name: "Windsurf",
    icon: "🌊",
    category: "ides",
    instructions: [
      "1. Open Windsurf",
      "2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)",
      "3. Type 'MCP' and select 'MCP: Add MCP Server'",
      "4. Paste this URL:",
      "https://railway.app/project/6f10eab1-3c75-4106-a6d5-0f032a3ae91f/service/5474e1ad-c01f-4f78-806f-d2ce863a793b",
      "5. Click 'Add Server'"
    ]
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    icon: "🤖",
    category: "claude",
    instructions: [
      "1. Open Claude Desktop",
      "2. Click Settings (⚙️)",
      "3. Go to 'Developer'",
      "4. Click 'Edit Config'",
      "5. Add this to your config:",
      "",
      '{',
      '  "mcpServers": {',
      '    "screenshotmcp": {',
      '      "command": "npx",',
      '      "args": [',
      '        "-y",',
      '        "@screenshotsmcp/cli"',
      '        "--api-key",',
      '        "YOUR_API_KEY"',
      '      ]',
      '    }',
      '  }',
      '}',
      "",
      "6. Save and restart Claude Desktop"
    ],
    config: `{
  "mcpServers": {
    "screenshotmcp": {
      "command": "npx",
      "args": [
        "-y",
        "@screenshotsmcp/cli",
        "--api-key",
        "YOUR_API_KEY"
      ]
    }
  }
}`
  },
  {
    id: "claude-code",
    name: "Claude Code",
    icon: "🎯",
    category: "claude",
    instructions: [
      "1. Install the CLI:",
      "npm install -g @screenshotsmcp/cli",
      "",
      "2. Run this command:",
      "npx @screenshotsmcp/cli setup --api-key YOUR_API_KEY",
      "",
      "3. Or add to ~/.config/claude/claude_desktop_config.json:",
      "",
      '{',
      '  "mcpServers": {',
      '    "screenshotmcp": {',
      '      "command": "npx",',
      '      "args": [',
      '        "-y",',
      '        "@screenshotsmcp/cli",',
      '        "--api-key",',
      '        "YOUR_API_KEY"',
      '      ]',
      '    }',
      '  }',
      '}',
      "",
      "4. Restart Claude Code"
    ],
    config: `{
  "mcpServers": {
    "screenshotmcp": {
      "command": "npx",
      "args": [
        "-y",
        "@screenshotsmcp/cli",
        "--api-key",
        "YOUR_API_KEY"
      ]
    }
  }
}`
  },
  {
    id: "n8n",
    name: "n8n",
    icon: "⚡",
    category: "mcp",
    instructions: [
      "1. In n8n, create a new HTTP Request node",
      "2. Set URL to:",
      "https://screenshotsmcp-api-production.up.railway.app/mcp/YOUR_API_KEY",
      "3. Method: POST",
      "4. Body (JSON):",
      '{',
      '  "jsonrpc": "2.0",',
      '  "id": 1,',
      '  "method": "tools/call",',
      '  "params": {',
      '    "name": "take_screenshot",',
      '    "arguments": {',
      '      "url": "https://example.com"',
      '      "width": 1280,',
      '      "height": 800,',
      '      "format": "png"',
      '    }',
      '  }',
      '}',
      "",
      "5. Send the request to take a screenshot"
    ],
    config: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "take_screenshot",
    "arguments": {
      "url": "https://example.com",
      "width": 1280,
      "height": 800,
      "format": "png"
    }
  }
}`
  }
];

const categories = [
  { id: "ides", name: "IDEs", icon: "💻", count: 3 },
  { id: "claude", name: "Claude", icon: "🤖", count: 2 },
  { id: "mcp", name: "MCP", icon: "⚡", count: 1 },
  { id: "others", name: "Others", icon: "🔧", count: 0 }
];

export function InstallDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  const filteredTools = selectedCategory 
    ? tools.filter(t => t.category === selectedCategory)
    : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedTool ? selectedTool.name : selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : "Install ScreenshotMCP"}
          </h2>
          <button
            onClick={() => {
              if (selectedTool) {
                setSelectedTool(null);
              } else if (selectedCategory) {
                setSelectedCategory(null);
              } else {
                onClose();
              }
            }}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex h-[550px]">
          {/* Sidebar */}
          <div className="w-72 border-r bg-gray-50/50 p-4 flex flex-col">
            {!selectedCategory ? (
              <div className="space-y-2">
                {/* API Key Section */}
                <div className="bg-white rounded-xl p-4 border shadow-sm mb-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Get API Key</h3>
                  <div className="space-y-3">
                    <Input
                      placeholder="Enter API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-10"
                    />
                    <Button 
                      className="w-full bg-black text-white hover:bg-gray-800 h-10"
                      onClick={() => {
                        if (!apiKey) {
                          window.open("/dashboard", "_blank");
                        }
                      }}
                    >
                      {apiKey ? "API Key Set" : "Create API Key"}
                    </Button>
                  </div>
                </div>

                {/* Categories */}
                <div className="space-y-1">
                  {categories.filter(c => c.count > 0).map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white hover:shadow-sm transition-all text-left border border-transparent hover:border-gray-200"
                    >
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium text-gray-900">{category.name}</span>
                      <span className="ml-auto text-sm text-gray-400">{category.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : !selectedTool ? (
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="space-y-1">
                  {filteredTools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedTool(tool)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white hover:shadow-sm transition-all text-left border border-transparent hover:border-gray-200"
                    >
                      <span className="text-xl">{tool.icon}</span>
                      <span className="font-medium text-gray-900">{tool.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedTool(null)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <div className="space-y-1">
                  {filteredTools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedTool(tool)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left border ${
                        selectedTool.id === tool.id 
                          ? "bg-white shadow-sm border-gray-300" 
                          : "hover:bg-white hover:shadow-sm border-transparent hover:border-gray-200"
                      }`}
                    >
                      <span className="text-xl">{tool.icon}</span>
                      <span className="font-medium text-gray-900">{tool.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {selectedTool ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedTool.icon}</span>
                  <h3 className="text-xl font-bold text-gray-900">{selectedTool.name}</h3>
                </div>

                <div className="space-y-4">
                  {selectedTool.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-3">
                      {instruction.startsWith("{") || instruction.startsWith('"') || instruction.startsWith('  "') ? (
                        <div className="flex-1">
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-sm font-mono">
                            {instruction}
                          </pre>
                          <button
                            onClick={() => handleCopy(instruction, `config-${index}`)}
                            className="mt-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
                          >
                            {copied === `config-${index}` ? (
                              <>
                                <Check className="w-4 h-4" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      ) : instruction ? (
                        <p className="flex-1 text-gray-700 leading-relaxed">{instruction}</p>
                      ) : (
                        <div className="flex-1 h-4" />
                      )}
                    </div>
                  ))}
                </div>

                {selectedTool.config && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <FileCode className="w-4 h-4" />
                        Complete Config
                      </h4>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto text-sm font-mono">
                        {selectedTool.config}
                      </pre>
                      <button
                        onClick={() => handleCopy(selectedTool.config!, "full-config")}
                        className="mt-3 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
                      >
                        {copied === "full-config" ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy full config
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {selectedTool.deepLink && (
                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={() => window.open(selectedTool.deepLink, "_blank")}
                      className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open in {selectedTool.name}
                    </Button>
                  </div>
                )}
              </div>
            ) : selectedCategory ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-5xl mb-4">{categories.find(c => c.id === selectedCategory)?.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </h3>
                <p className="text-gray-500 text-sm">
                  Select a tool from the sidebar to see installation instructions
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-5xl mb-4">📸</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Choose a tool to get started
                </h3>
                <p className="text-gray-500 text-sm max-w-xs">
                  Select a category from the sidebar to see available integrations
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
