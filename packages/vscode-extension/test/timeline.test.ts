import test from "node:test";
import assert from "node:assert/strict";
import { TimelineStore } from "../src/timeline/store";

test("TimelineStore adds newest events first", () => {
  const store = new TimelineStore();

  store.add({ title: "First event" });
  store.add({ title: "Second event", status: "success" });

  const events = store.getEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0].title, "Second event");
  assert.equal(events[1].title, "First event");
  assert.equal(events[0].status, "success");
});

test("TimelineStore notifies subscribers on add and clear", () => {
  const store = new TimelineStore();
  const snapshots: string[][] = [];

  const dispose = store.subscribe((events) => {
    snapshots.push(events.map((event) => event.title));
  });

  store.add({ title: "Captured screenshot" });
  store.clear();
  dispose();

  assert.deepEqual(snapshots, [[], ["Captured screenshot"], []]);
});
