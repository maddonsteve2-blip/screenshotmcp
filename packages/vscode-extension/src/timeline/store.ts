export type TimelineEventStatus = "info" | "success" | "error";

export type TimelineEventKind = "screenshot" | "audit" | "run" | "info";

export interface TimelineEvent {
  id: string;
  title: string;
  detail?: string;
  status: TimelineEventStatus;
  kind: TimelineEventKind;
  occurredAt: string;
  /** Public image URL for the captured screenshot or audit hero image. */
  thumbnailUrl?: string;
  /** Target URL the screenshot/audit was run against. */
  targetUrl?: string;
  /** Dashboard deep-link for the run, if available. */
  runUrl?: string;
}

export interface AddTimelineEventInput {
  title: string;
  detail?: string;
  status?: TimelineEventStatus;
  kind?: TimelineEventKind;
  thumbnailUrl?: string;
  targetUrl?: string;
  runUrl?: string;
}

type TimelineListener = (events: TimelineEvent[]) => void;

export class TimelineStore {
  private readonly events: TimelineEvent[] = [];

  private readonly listeners = new Set<TimelineListener>();

  private counter = 0;

  add(input: AddTimelineEventInput): TimelineEvent {
    const event: TimelineEvent = {
      id: `${Date.now()}-${this.counter++}`,
      title: input.title,
      detail: input.detail,
      status: input.status ?? "info",
      kind: input.kind ?? "info",
      thumbnailUrl: input.thumbnailUrl,
      targetUrl: input.targetUrl,
      runUrl: input.runUrl,
      occurredAt: new Date().toISOString(),
    };

    this.events.unshift(event);
    if (this.events.length > 100) {
      this.events.length = 100;
    }
    this.emit();
    return event;
  }

  clear(): void {
    this.events.length = 0;
    this.emit();
  }

  getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener);
    listener(this.getEvents());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getEvents();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
