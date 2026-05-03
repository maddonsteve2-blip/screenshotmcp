import * as fs from "fs";
import { homedir } from "os";
import { join } from "path";
import * as vscode from "vscode";
import { AuthStore } from "../auth/store";
import { CatalogCache } from "../catalog/cache";
import { EXTENSION_DISPLAY_NAME } from "../constants";
import { UrlHistoryStore } from "../history/store";
import { AuditDiagnostics } from "./auditDiagnostics";
import { getInstalledSkillsForSidebar, getAvailableSkillsForSidebar } from "../skills";
import { discoverWorkflows, type DiscoveredWorkflow } from "../skills/discoverWorkflows";
import { TimelineStore, type TimelineEvent, type TimelineEventStatus } from "../timeline/store";
import { getApiUrl } from "../settings";

type SidebarNode =
  | StatusNode
  | ActionNode
  | SectionNode
  | EventNode
  | InstalledSkillNode
  | CatalogSkillNode
  | WorkflowNode
  | RecentUrlNode
  | FindingGroupNode;

interface BaseNode {
  id: string;
  kind: "status" | "action" | "section" | "event" | "installed-skill" | "catalog-skill" | "workflow" | "recent-url" | "finding-group";
}

interface RecentUrlNode extends BaseNode {
  kind: "recent-url";
  url: string;
  count: number;
  lastSeen: string;
}

interface FindingGroupNode extends BaseNode {
  kind: "finding-group";
  uri: vscode.Uri;
  url?: string;
  count: number;
  worstSeverity: vscode.DiagnosticSeverity;
}

interface WorkflowNode extends BaseNode {
  kind: "workflow";
  workflow: DiscoveredWorkflow;
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

  private readonly catalogUnsubscribe: vscode.Disposable | undefined;

  private readonly findingsUnsubscribe: vscode.Disposable | undefined;

  constructor(
    private readonly authStore: AuthStore,
    private readonly timelineStore: TimelineStore,
    private readonly catalogCache: CatalogCache,
    private readonly urlHistory: UrlHistoryStore,
    private readonly auditDiagnostics: AuditDiagnostics,
  ) {
    this.unsubscribe = this.timelineStore.subscribe(() => {
      this.refresh();
    });
    this.catalogUnsubscribe = this.catalogCache.onChange(() => {
      this.refresh();
    });
    this.findingsUnsubscribe = this.auditDiagnostics.onDidChangeCount(() => {
      this.refresh();
    });
    this.watchSkillsDir();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.catalogUnsubscribe?.dispose();
    this.findingsUnsubscribe?.dispose();
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

    if (element.kind === "section" && element.id === "section-workflows") {
      return this.getWorkflowNodes();
    }

    if (element.kind === "section" && element.id === "section-recent-urls") {
      return this.getRecentUrlNodes();
    }

    if (element.kind === "section" && element.id === "section-findings") {
      return this.getFindingNodes();
    }

    return [];
  }

  private getFindingNodes(): SidebarNode[] {
    const groups = this.auditDiagnostics.listGroupedByUri();
    if (groups.length === 0) {
      return [
        {
          id: "finding-empty",
          kind: "event",
          event: {
            id: "finding-empty",
            title: "No audit findings",
            detail: "Run an audit (\u2318\u21E7P \u2192 DeepSyte: Audit URL) to populate this list.",
            status: "info",
            kind: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }
    return groups.slice(0, 20).map((g, i) => ({
      id: `finding-group-${i}-${g.uri.toString()}`,
      kind: "finding-group" as const,
      uri: g.uri,
      url: g.url,
      count: g.diagnostics.length,
      worstSeverity: g.diagnostics.reduce<vscode.DiagnosticSeverity>(
        (acc, d) => (d.severity < acc ? d.severity : acc),
        vscode.DiagnosticSeverity.Hint,
      ),
    }));
  }

  private getRecentUrlNodes(): SidebarNode[] {
    const urls = this.urlHistory.listUrls().slice(0, 10);
    if (urls.length === 0) {
      return [
        {
          id: "recent-url-empty",
          kind: "event",
          event: {
            id: "recent-url-empty",
            title: "No URLs yet",
            detail: "Capture or audit a URL to populate this list.",
            status: "info",
            kind: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }
    return urls.map((u) => ({
      id: `recent-url-${u.url}`,
      kind: "recent-url" as const,
      url: u.url,
      count: u.count,
      lastSeen: u.lastSeen,
    }));
  }

  private getWorkflowNodes(): SidebarNode[] {
    const workflows = discoverWorkflows();
    if (workflows.length === 0) {
      return [
        {
          id: "workflow-empty",
          kind: "event",
          event: {
            id: "workflow-empty",
            title: "No workflows found",
            detail: "Install a skill that ships WORKFLOW.md files (e.g. DeepSyte core).",
            status: "info",
            kind: "info",
            occurredAt: new Date().toISOString(),
          },
        },
      ];
    }
    return workflows.map((w) => ({
      id: `workflow-${w.skill}-${w.id}`,
      kind: "workflow" as const,
      workflow: w,
    }));
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
          : element.id === "section-workflows"
            ? "run-all"
            : element.id === "section-recent-urls"
              ? "globe"
              : element.id === "section-findings"
                ? "warning"
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
      item.tooltip = `Preview "${element.skillName}" — shows the SKILL.md before installing.`;
      item.iconPath = new vscode.ThemeIcon("eye");
      item.command = {
        command: "deepsyte.previewSkill",
        title: `Preview ${element.displayName}`,
        arguments: [element.skillName],
      };
      return item;
    }

    if (element.kind === "workflow") {
      const item = new vscode.TreeItem(element.workflow.title, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = element.workflow.skill;
      item.tooltip = `${element.workflow.title}\n${element.workflow.path}`;
      item.iconPath = new vscode.ThemeIcon("run-all");
      item.command = {
        command: "deepsyte.openWorkflow",
        title: `Open ${element.workflow.title}`,
        arguments: [element.workflow.path],
      };
      return item;
    }

    if (element.kind === "finding-group") {
      const label = element.url ? shortenUrl(element.url) : element.uri.path.split(/[\\/]/).pop() ?? element.uri.toString();
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = `${element.count} finding${element.count === 1 ? "" : "s"}`;
      item.tooltip = `${element.url ?? element.uri.toString()}\n${element.count} audit finding${element.count === 1 ? "" : "s"}\nClick to open the source.`;
      item.iconPath = new vscode.ThemeIcon(
        element.worstSeverity === vscode.DiagnosticSeverity.Error
          ? "error"
          : element.worstSeverity === vscode.DiagnosticSeverity.Warning
            ? "warning"
            : "info",
      );
      item.command = element.uri.scheme === "deepsyte-audit"
        ? { command: "workbench.actions.view.problems", title: "Open Problems" }
        : { command: "vscode.open", title: "Open file", arguments: [element.uri] };
      return item;
    }

    if (element.kind === "recent-url") {
      const item = new vscode.TreeItem(shortenUrl(element.url), vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      item.description = `${element.count} \u00b7 ${formatTimestamp(element.lastSeen)}`;
      item.tooltip = `${element.url}\n${element.count} event${element.count === 1 ? "" : "s"} \u00b7 last ${formatTimestamp(element.lastSeen)}\n\nClick to open history`;
      item.iconPath = new vscode.ThemeIcon("globe");
      item.contextValue = "recentUrl";
      item.command = {
        command: "deepsyte.showUrlHistory",
        title: "Show URL history",
        arguments: [element.url],
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
        description: signedIn ? "Clear the stored session" : "Authorize with the DeepSyte website",
        commandId: signedIn ? "deepsyte.signOut" : "deepsyte.signIn",
        icon: signedIn ? "sign-out" : "sign-in",
      },
      {
        id: "action-status",
        kind: "action",
        label: "Check Status",
        description: "Validate the current DeepSyte connection",
        commandId: "deepsyte.checkStatus",
        icon: "pulse",
      },
      {
        id: "action-screenshot",
        kind: "action",
        label: "Take Screenshot",
        description: "Capture a page with DeepSyte",
        commandId: "deepsyte.takeScreenshot",
        icon: "device-camera",
      },
      {
        id: "action-install",
        kind: "action",
        label: "Configure Editor Integration",
        description: "Install or repair the DeepSyte MCP connection for this editor",
        commandId: "deepsyte.installMcpServer",
        icon: "cloud-upload",
      },
      {
        id: "action-sync-skill",
        kind: "action",
        label: "Sync Core Skill",
        description: "Install, update, or repair the managed DeepSyte skill in ~/.agents/skills",
        commandId: "deepsyte.syncCoreSkill",
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
        id: "section-workflows",
        kind: "section",
        label: "Workflows",
        description: "Packaged runbooks from installed skills",
      },
      {
        id: "section-recent-urls",
        kind: "section",
        label: "Recent URLs",
        description: `${Math.min(this.urlHistory.listUrls().length, 10)} most-recent`,
      },
      {
        id: "section-findings",
        kind: "section",
        label: "Audit Findings",
        description: this.auditDiagnostics.totalCount() > 0 ? `${this.auditDiagnostics.totalCount()} active` : "no findings",
      },
      {
        id: "action-browse-skills",
        kind: "action",
        label: "Browse Community Skills",
        description: "Discover addon skills from skills.sh",
        commandId: "deepsyte.browseSkills",
        icon: "link-external",
      },
      {
        id: "action-timeline",
        kind: "action",
        label: "Open Timeline Panel",
        description: "Open the detailed timeline view",
        commandId: "deepsyte.openTimeline",
        icon: "history",
      },
      {
        id: "action-dashboard",
        kind: "action",
        label: "Open Dashboard",
        description: "Open the DeepSyte dashboard",
        commandId: "deepsyte.openDashboard",
        icon: "link-external",
      },
      {
        id: "action-output",
        kind: "action",
        label: "Show Output",
        description: "Open the DeepSyte output channel",
        commandId: "deepsyte.showOutput",
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
            kind: "info",
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
    const available = getAvailableSkillsForSidebar(this.catalogCache.get());
    if (available.length === 0) {
      return [
        {
          id: "catalog-skill-empty",
          kind: "event",
          event: {
            id: "catalog-skill-empty",
            title: "All catalog skills installed",
            detail: "You have all the curated DeepSyte skills.",
            status: "info",
            kind: "info",
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
            detail: "Run a DeepSyte command to populate the sidebar timeline.",
            status: "info",
            kind: "info",
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

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = parsed.host + parsed.pathname;
    return base.length > 48 ? base.slice(0, 45) + "..." : base;
  } catch {
    return url.length > 48 ? url.slice(0, 45) + "..." : url;
  }
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
