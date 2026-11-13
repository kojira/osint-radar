import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBrief, isPriority } from "../lib/briefing-evaluation.ts";

test("unknown novelty preserves each editorial importance and remains unscored", () => {
  for (const priority of ["high", "medium", "low"]) {
    assert.deepEqual(evaluateBrief({ priority, relevanceScore: 5, noveltyScore: null, practicalityScore: 4 }), { priority, score: null });
  }
});

test("a complete weighted score cannot overwrite the explicit importance", () => {
  assert.deepEqual(evaluateBrief({ priority: "medium", relevanceScore: 4, noveltyScore: 4, practicalityScore: 3 }), { priority: "medium", score: 76 });
  assert.deepEqual(evaluateBrief({ priority: "high", relevanceScore: 5, noveltyScore: 0, practicalityScore: 4 }), { priority: "high", score: 56 });
});

test("importance validation rejects absent and unsupported values", () => {
  for (const value of [undefined, null, "", "urgent", 1, {}, "HIGH"]) assert.equal(isPriority(value), false);
  for (const value of ["high", "medium", "low"]) assert.equal(isPriority(value), true);
});
