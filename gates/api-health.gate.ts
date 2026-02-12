#!/usr/bin/env bun
/**
 * API Health Gate
 *
 * Hits /stats to prove the Worker is up and Durable Objects respond.
 */

import { Gate, Act, Assert, createEmptyObserveResource } from "gateproof";

const url = process.env.DEJA_URL || "http://localhost:8787";
const apiKey = process.env.DEJA_API_KEY;

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
};

const gate = {
  name: "api-health",
  observe: createEmptyObserveResource(),
  act: [Act.wait(500)],
  assert: [
    Assert.custom("stats_returns_200", async () => {
      const res = await fetch(`${url}/stats`, { headers });
      if (!res.ok) {
        console.error(`/stats returned ${res.status}: ${await res.text()}`);
        return false;
      }
      const data = await res.json();
      return typeof data.totalLearnings === "number";
    }),
  ],
  stop: { idleMs: 2000, maxMs: 15000 },
};

export async function run() {
  const result = await Gate.run(gate);
  return { status: result.status };
}

if (import.meta.main) {
  Gate.run(gate)
    .then((result) => {
      if (result.status !== "success") {
        console.error(`API health gate failed`);
        process.exit(1);
      }
      console.log("API health gate passed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
