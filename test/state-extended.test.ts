import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	API_KEY,
	asArray,
	asRecord,
	httpJson,
	memoryScope,
	type RunningServer,
	removeDbArtifacts,
	STARTUP_TIMEOUT_MS,
	startServer,
	stopServer,
	TEST_TIMEOUT_MS,
	unique,
} from "./helpers";

const PORT = 8792;
const RUN_SUFFIX = `${Date.now()}-${process.pid}`;
const DB_PATH = `./data/test-state-ext-${RUN_SUFFIX}.db`;
let server: RunningServer | null = null;

beforeAll(async () => {
	server = await startServer({ port: PORT, dbPath: DB_PATH, apiKey: API_KEY });
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
	if (server !== null) {
		await stopServer(server);
		await removeDbArtifacts(DB_PATH);
	}
}, STARTUP_TIMEOUT_MS);

function getServer(): RunningServer {
	if (server === null) throw new Error("Server not running");
	return server;
}

describe("state extended edge cases", () => {
	it(
		"GET non-existent state returns 404",
		async () => {
			const getState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent("nonexistent-run-id-xyz")}`,
			);
			expect(getState.status).toBe(404);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"revision tracking increments for PUT + PATCH + PATCH",
		async () => {
			const runId = unique("run-revision");

			const putState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PUT",
					body: {
						goal: unique("goal"),
						assumptions: [],
						decisions: [],
						updatedBy: "vitest",
						changeSummary: "test",
					},
				},
			);
			expect(putState.status).toBe(200);
			expect(asRecord(putState.body).revision).toBe(1);

			const patchOne = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PATCH",
					body: { open_questions: ["Q1"], updatedBy: "vitest" },
				},
			);
			expect(patchOne.status).toBe(200);
			expect(asRecord(patchOne.body).revision).toBe(2);

			const patchTwo = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PATCH",
					body: { next_actions: ["A1"], updatedBy: "vitest" },
				},
			);
			expect(patchTwo.status).toBe(200);
			expect(asRecord(patchTwo.body).revision).toBe(3);

			const getState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
			);
			expect(getState.status).toBe(200);
			expect(asRecord(getState.body).revision).toBe(3);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"multiple patches accumulate merged state fields",
		async () => {
			const runId = unique("run-accumulate");

			const putState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PUT",
					body: {
						goal: "G",
						assumptions: [],
						decisions: [],
						updatedBy: "vitest",
						changeSummary: "test",
					},
				},
			);
			expect(putState.status).toBe(200);

			const patchOne = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PATCH",
					body: { open_questions: ["Q1"], updatedBy: "vitest" },
				},
			);
			expect(patchOne.status).toBe(200);

			const patchTwo = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PATCH",
					body: { next_actions: ["A1"], updatedBy: "vitest" },
				},
			);
			expect(patchTwo.status).toBe(200);

			const getState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
			);
			expect(getState.status).toBe(200);
			const state = asRecord(asRecord(getState.body).state);
			expect(state.goal).toBe("G");
			expect(state.open_questions).toEqual(["Q1"]);
			expect(state.next_actions).toEqual(["A1"]);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"resolving an already resolved state returns 200 again",
		async () => {
			const runId = unique("run-double-resolve");
			const scope = memoryScope("state-ext-double-resolve");

			const putState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PUT",
					body: {
						goal: unique("goal"),
						assumptions: [],
						decisions: [],
						updatedBy: "vitest",
						changeSummary: "test",
					},
				},
			);
			expect(putState.status).toBe(200);

			const firstResolve = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}/resolve`,
				{
					method: "POST",
					body: { persistToLearn: true, scope, updatedBy: "vitest" },
				},
			);
			expect(firstResolve.status).toBe(200);
			expect(asRecord(firstResolve.body).status).toBe("resolved");

			const secondResolve = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}/resolve`,
				{
					method: "POST",
					body: { persistToLearn: true, scope, updatedBy: "vitest" },
				},
			);
			expect(secondResolve.status).toBe(200);
			expect(asRecord(secondResolve.body).status).toBe("resolved");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"persistToLearn=false does not create a learning",
		async () => {
			const runId = unique("run-no-persist");
			const scope = memoryScope("state-ext-no-persist");

			const putState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PUT",
					body: {
						goal: unique("goal"),
						assumptions: [],
						decisions: [],
						updatedBy: "vitest",
						changeSummary: "test",
					},
				},
			);
			expect(putState.status).toBe(200);

			const resolved = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}/resolve`,
				{
					method: "POST",
					body: { persistToLearn: false, scope, updatedBy: "vitest" },
				},
			);
			expect(resolved.status).toBe(200);

			const learnings = await httpJson(
				getServer().baseUrl,
				`/learnings?scope=${encodeURIComponent(scope)}&limit=20`,
			);
			expect(learnings.status).toBe(200);
			expect(asArray(learnings.body)).toHaveLength(0);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"events creation returns unique ids",
		async () => {
			const runId = unique("run-events");

			const putState = await httpJson(
				getServer().baseUrl,
				`/state/${encodeURIComponent(runId)}`,
				{
					method: "PUT",
					body: {
						goal: unique("goal"),
						assumptions: [],
						decisions: [],
						updatedBy: "vitest",
						changeSummary: "test",
					},
				},
			);
			expect(putState.status).toBe(200);

			const eventTypes = ["note", "checkpoint", "decision"];
			const ids: string[] = [];

			for (const eventType of eventTypes) {
				const response = await httpJson(
					getServer().baseUrl,
					`/state/${encodeURIComponent(runId)}/events`,
					{
						method: "POST",
						body: {
							eventType,
							payload: { text: unique("event") },
							createdBy: "vitest",
						},
					},
				);

				expect(response.status).toBe(200);
				const body = asRecord(response.body);
				expect(body.success).toBe(true);
				expect(body.id).toBeTypeOf("string");
				ids.push(String(body.id));
			}

			expect(new Set(ids).size).toBe(3);
		},
		TEST_TIMEOUT_MS,
	);
});
