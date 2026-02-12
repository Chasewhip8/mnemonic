#!/usr/bin/env bun
/**
 * Learn → Inject Round-Trip Gate
 *
 * Proves the full stack: Worker → DO → Vectorize → AI embeddings → semantic search.
 *
 * 1. POST /learn with a unique trigger+learning
 * 2. Wait for vectorize indexing
 * 3. POST /inject with matching context
 * 4. Assert the learning comes back in data.learnings
 * 5. Clean up: DELETE the test learning
 */

import { Gate, Act, Assert, createEmptyObserveResource } from "gateproof";

const url = process.env.DEJA_URL || "http://localhost:8787";
const apiKey = process.env.DEJA_API_KEY;

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
};

const SCOPE = "session:gate-test";
const ts = Date.now();
const trigger = `gate-test-trigger-${ts}`;
const learning = `gate-test-learning-${ts}`;

let learningId: string | null = null;

const gate = {
  name: "learn-inject-round-trip",
  observe: createEmptyObserveResource(),
  act: [Act.wait(500)],
  assert: [
    Assert.custom("learn_stores_memory", async () => {
      const res = await fetch(`${url}/learn`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          trigger,
          learning,
          confidence: 0.9,
          scope: SCOPE,
        }),
      });
      if (!res.ok) {
        console.error(`/learn returned ${res.status}: ${await res.text()}`);
        return false;
      }
      const data = await res.json();
      learningId = data.id;
      return !!learningId;
    }),

    // Vectorize indexing takes a moment
    Assert.custom("wait_for_indexing", async () => {
      await new Promise((r) => setTimeout(r, 3000));
      return true;
    }),

    Assert.custom("inject_returns_learning", async () => {
      const res = await fetch(`${url}/inject`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: trigger,
          scopes: [SCOPE],
          limit: 5,
        }),
      });
      if (!res.ok) {
        console.error(`/inject returned ${res.status}: ${await res.text()}`);
        return false;
      }
      const data = await res.json();
      const found = data.learnings?.some(
        (l: { learning: string }) => l.learning === learning
      );
      if (!found) {
        console.error(
          `Learning not found in inject response. Got ${data.learnings?.length || 0} learnings.`
        );
      }
      return !!found;
    }),

    // Cleanup: remove the test learning
    Assert.custom("cleanup_test_learning", async () => {
      if (!learningId) return true;
      const res = await fetch(`${url}/learning/${learningId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        console.error(
          `DELETE /learning/${learningId} returned ${res.status}: ${await res.text()}`
        );
      }
      // Pass even if cleanup fails — the gate already proved the round trip
      return true;
    }),
  ],
  stop: { idleMs: 2000, maxMs: 30000 },
};

export async function run() {
  const result = await Gate.run(gate);
  return { status: result.status };
}

if (import.meta.main) {
  Gate.run(gate)
    .then((result) => {
      if (result.status !== "success") {
        console.error(`Learn→Inject round-trip gate failed`);
        process.exit(1);
      }
      console.log("Learn→Inject round-trip gate passed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
