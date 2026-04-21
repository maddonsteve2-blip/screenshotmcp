import { EventEmitter } from "events";

/**
 * In-process pub/sub for dashboard live updates.
 *
 * All persistence paths that change user-visible state (new run, new capture,
 * recording uploaded, diagnostics updated, status transitioned) call
 * `emitDashboardEvent` with the affected user. The dashboard WebSocket route
 * subscribes per connection and pushes matching events to the client.
 *
 * This bus is intentionally in-memory and scoped to the running API process.
 * For a multi-instance API, replace with Redis pub/sub — the emitter surface
 * is deliberately small to make that swap trivial.
 */
export type DashboardEventType =
  | "run.created"
  | "run.updated"
  | "run.completed"
  | "screenshot.completed"
  | "recording.created";

export interface DashboardEvent {
  type: DashboardEventType;
  userId: string;
  /** Run id when relevant (every event currently has one). */
  runId?: string;
  /** Arbitrary payload — listeners cherry-pick what they need. */
  payload?: Record<string, unknown>;
  /** Timestamp in ISO for freshness debugging on the client. */
  emittedAt: string;
}

const emitter = new EventEmitter();
// Node's default 10-listener cap is too low — one listener per open dashboard
// WebSocket connection. Set to a generous ceiling; real guard is connection
// count, not listener count.
emitter.setMaxListeners(1000);

const EVENT_NAME = "dashboard-event";

export function emitDashboardEvent(event: Omit<DashboardEvent, "emittedAt">) {
  const payload: DashboardEvent = { ...event, emittedAt: new Date().toISOString() };
  emitter.emit(EVENT_NAME, payload);
}

/**
 * Subscribe to all dashboard events for a given user. Returns an
 * unsubscribe function — call it when the socket closes.
 */
export function subscribeDashboardEvents(
  userId: string,
  handler: (event: DashboardEvent) => void,
): () => void {
  const listener = (event: DashboardEvent) => {
    if (event.userId === userId) handler(event);
  };
  emitter.on(EVENT_NAME, listener);
  return () => {
    emitter.off(EVENT_NAME, listener);
  };
}
