import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./constants";

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  }
  return outputChannel;
}

export function logLine(message: string): void {
  getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function showOutputChannel(preserveFocus = false): void {
  getOutputChannel().show(preserveFocus);
}
