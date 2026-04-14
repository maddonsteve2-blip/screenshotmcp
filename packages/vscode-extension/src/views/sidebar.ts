import * as fs from "fs";
import { homedir } from "os";
import { join } from "path";
import * as vscode from "vscode";
import { AuthStore } from "../auth/store";
import { EXTENSION_DISPLAY_NAME } from "../constants";
import { getInstalledSkillsForSidebar, getAvailableSkillsForSidebar } from "../skills";
import { TimelineStore, type TimelineEvent, type TimelineEventStatus } from "../timeline/store";
import { getApiUrl } from "../settings";

type SidebarNode = StatusNode | ActionNode | SectionNode | EventNode | InstalledSkillNode | CatalogSkillNode;

interface BaseNode {
  id: string;
  kind: "status" | "action" | "section" | "event" | "installed-skill" | "catalog-skill";
}

interface StatusNode extends BaseNode {
  kind: "status";
}

interface ActionNode extends BaseNode {
  kind: "action";
  label: string;
  description?: string;
  commandId: string;
  icon: string;
}

interface SectionNode extends BaseNode {
  kind: "section";
  label: string;
  description?: string;
}

interface EventNode extends BaseNode {
  kind: "event";
  event: TimelineEvent;
}

interface InstalledSkillNode extends BaseNode {
  kind: "installed-skill";
  skillName: string;
  version?: string;
  managed: boolean;
}

interface CatalogSkillNode extends BaseNode {
  kind: "catalog-skill";
  skillName: string;
  displayName: string;
  description: string;
}

export class SidebarProvider implements vscode.TreeDataProvider<SidebarNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SidebarNode | undefined | null | void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private unsubscribe: (() => void) | undefined;
  private skillsWatcher: fs.FSWatcher | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly authStore: AuthStore, private readonly timelineStore: TimelineStore) {
    this.unsubscribe = this.timelineStore.subscribe(() => {
      this.refresh();
    });
    this.watchSkillsDir();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.skillsWatcher?.close();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private watchSkillsDir(): void {
    const skillsDir = join(homedir(), ".agents", "skills");
    try {
      fs.mkdirSync(skillsDir, { recursive: true });
      this.skillsWatcher = fs.watch(skillsDir, { persistent: false }, () => {
        // Debounce: many FS events can fire in quick succession
        if (this.refreshTimer) {
          clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => this.refresh(), 500);
      });
    } catch {
      // Non-fatal: sidebar still works, just won't auto-refresh
    }
  }

  async getChildren(element?: SidebarNode): Promise<SidebarNode[]> {
    if (!element) {
      return this.getRootNodes();
    }

    if (element.kind === "section" && element.id === "section-installed-skills") {
      return this.getInstalledSkillNodes();
    }

    if (element.kind === "section" && element.id === "section-available-skills") {
      return this.getAvailableSkillNodes();
    }

    if (element.kind === "section" && element.id === "recent-activity") {
      return this.getEventNodes();
    }

    return [];
  }

  async getTreeItem(element: SidebarNode): Promise<vscode.TreeItem> {
    if (element.kind === "status") {
      const signedIn = await this.authStore.hasApiKey();
      const item = new vscode.TreeItem("Connection", vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = signedIn ? "Connected" : "Not signed in";
      item.tooltip = `${EXTENSION_DISPLAY_NAME} ${signedIn ? "is connected" : "is not signed in"} (${getApiUrl()})`;
      item.iconPath = new vscode.ThemeIcon(signedIn ? "pass-filled" : "warning");
      return item;
    }

    if (element.kind === "action") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = element.description;
      item.tooltip = element.description ?? element.label;
      item.iconPath = new vscode.ThemeIcon(element.icon);
      item.command = {
        command: element.commandId,
        title: element.label,
      };
      return item;
    }

    if (element.kind === "section") {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = element.id;
      item.description = element.description;
      item.tooltip = element.description ?? element.label;
      const sectionIcon = element.id === "section-installed-skills"
        ? "library"
        : element.id === "section-available-skills"
          ? "extensions"
          : "history";
      item.iconPath = new vscode.ThemeIcon(sectionIcon);
      return item;
    }

    if (element.kind === "installed-skill") {
      const item = new vscode.TreeItem(element.skillName, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = element.version ? `v${element.version}` : (element.managed ? "managed" : "external");
      item.tooltip = `${element.skillName} — installed at ~/.agents/skills/${element.skillName}`;
      item.iconPath = new vscode.ThemeIcon("check");
      return item;
    }

    if (element.kind === "catalog-skill") {
      const item = new vscode.TreeItem(element.displayName, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = element.description;
      item.tooltip = `Click to install "${element.skillName}"`;
      item.iconPath = new vscode.ThemeIcon("cloud-download");
      item.command = {
        command: "screenshotsmcp.installSkill",
        title: `Install ${element.displayName}`,
        arguments: [element.skillName],
      };
      return item;
    }

    const item = new vscode.TreeItem(element.event.title, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = formatTimestamp(element.event.occurredAt);
    item.tooltip = [element.event.title, element.event.detail, formatTimestamp(element.event.occurredAt)].filter(Boolean).join("\n");
    item.iconPath = new vscode.ThemeIcon(getEventIcon(element.event.status));
    return item;
  }

  private async getRootNodes(): Promise<SidebarNode[]> {
    const signedIn = await this.authStore.hasApiKey();

    return [
      {
        id: "status",
        kind: "status",
      },
      {
        id: signedIn ? "action-sign-out" : "action-sign-in",
        kind: "action",
        label: signedIn ? "Sign Out" : "Sign In",
        description: signedIn ? "Clear the stored API key" : "Store your ScreenshotsMCP API key",
        commandId: signedIn ? "screenshotsmcp.signOut" : "screenshotsmcp.signIn",
        icon: signedIn ? "sign-out" : "sign-in",
      },
      {
        id: "action-status",
        kind: "action",
        label: "Check Status",
        description: "Validate the current ScreenshotsMCP connection",
        commandId: "screenshotsmcp.checkStatus",
        icon: "pulse",
      },
      {
        id: "action-screenshot",
        kind: "action",
        label: "Take Screenshot",
        description: "Capture a page with ScreenshotsMCP",
        commandId: "screenshotsmcp.takeScreenshot",
        icon: "device-camera",
      },
      {
        id: "action-install",
        kind: "action",
        label: "Configure Editor Integration",
        description: "Install or repair the ScreenshotsMCP MCP connection for this editor",
        commandId: "screenshotsmcp.installMcpServer",
        icon: "cloud-upload",
      },
      {
        id: "action-sync-skill",
        kind: "action",
        label: "Sync Core Skill",
        description: "Install, update, or repair the managed ScreenshotsMCP skill in ~/.agents/skills",
        commandId: "screenshotsmcp.syncCoreSkill",
        icon: "sync",
      },
      {
        id: "section-installed-skills",
        kind: "section",
        label: "Installed Skills",
      },
      {
        id: "section-available-skills",
        kind: "section",
        label: "Available Skills",
      },
      {
        id: "action-browse-skills",
        kind: "action",
        label: "Browse Community Skills",
        description: "Discover addon skills from skills.sh",
        commandId: "screenshotsmcp.browseSkills",
        icon: "link-external",
      },
      {
        id: "action-timeline",
        kind: "action",
        label: "Open Timeline Panel",
        description: "Open the detailed timeline view",
        commandId: "screenshotsmcp.openTimeline",
        icon: "history",
      },
      {
        id: "action-dashboard",
        kind: "action",
        label: "Open Dashboard",
        description: "Open the ScreenshotsMCP dashboard",
        commandId: "screenshotsmcp.openDashboard",
        icon: "link-external",
      },
      {
        id: "action-output",
        kind: "action",
        label: "Show Output",
        description: "Open the ScreenshotsMCP output channel",
        commandId: "screenshotsmcp.showOutput",
        icon: "output",
      },
      {
        id: "recent-activity",
        kind: "section",
        label: "Recent Activity",
        description: `${Math.min(this.timelineStore.getEvents().length, 5)} latest events`,
      },
    ];
  }

  private getInstalledSkillNodes(): SidebarNode[] {
    const skills = getInstalledSkillsForSidebar();
    if (skills.length === 0) {
      return [
        {
          id: "installed-skill-empty",
          kind: "event",
          event: {
            id: "installed-skill-empty",
            title: "No skills installed",
            detail: 'Use "Sync Core Skill" or install from the catalog below.',
            status: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }
    return skills.map((s) => ({
      id: `installed-skill-${s.name}`,
      kind: "installed-skill" as const,
      skillName: s.name,
      version: s.version,
      managed: s.managed,
    }));
  }

  private getAvailableSkillNodes(): SidebarNode[] {
    const available = getAvailableSkillsForSidebar();
    if (available.length === 0) {
      return [
        {
          id: "catalog-skill-empty",
          kind: "event",
          event: {
            id: "catalog-skill-empty",
            title: "All catalog skills installed",
            detail: "You have all the curated ScreenshotsMCP skills.",
            status: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }
    return available.map((s) => ({
      id: `catalog-skill-${s.name}`,
      kind: "catalog-skill" as const,
      skillName: s.name,
      displayName: s.displayName,
      description: s.description,
    }));
  }

  private getEventNodes(): SidebarNode[] {
    const events = this.timelineStore.getEvents().slice(0, 5);
    if (events.length === 0) {
      return [
        {
          id: "event-empty",
          kind: "event",
          event: {
            id: "event-empty",
            title: "No activity yet",
            detail: "Run a ScreenshotsMCP command to populate the sidebar timeline.",
            status: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }

    return events.map((event) => ({
      id: `event-${event.id}`,
      kind: "event",
      event,
    }));
  }
}

function getEventIcon(status: TimelineEventStatus): string {
  if (status === "success") {
    return "pass-filled";
  }

  if (status === "error") {
    return "error";
  }

  return "circle-outline";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}
