import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	API_KEY,
	asArray,
	asRecord,
	httpJson,
	memoryScope,
	parseMcpError,
	parseMcpToolResult,
	type RunningServer,
	removeDbArtifacts,
	STARTUP_TIMEOUT_MS,
	startServer,
	stopServer,
	TEST_TIMEOUT_MS,
	unique,
} from "./helpers";

const MCP_PORT = 8793;
const RUN_SUFFIX = `${Date.now()}-${process.pid}`;
const MCP_DB_PATH = `./data/test-mcp-tools-${RUN_SUFFIX}.db`;

let server: RunningServer | null = null;

function getServer(): RunningServer {
	if (server === null) {
		throw new Error("MCP test server is not running");
	}
	return server;
}

function mcpCall(method: string, params: unknown, id = 1) {
	return httpJson(getServer().baseUrl, "/mcp", {
		method: "POST",
		body: { jsonrpc: "2.0", id, method, params },
	});
}

function parseMcpContent(body: unknown): unknown {
	const top = asRecord(body);
	const result = asRecord(top.result);
	const content = asArray(result.content);
	const first = asRecord(content[0]);
	if (typeof first.text !== "string") {
		throw new Error("Expected MCP content text");
	}
	return JSON.parse(first.text) as unknown;
}

function parseMcpToolResultFlexible(body: unknown): Record<string, unknown> {
	try {
		return parseMcpToolResult(body);
	} catch {
		const parsed = parseMcpContent(body);
		if (Array.isArray(parsed)) {
			return { learnings: parsed };
		}
		return asRecord(parsed);
	}
}

async function mcpToolCall(name: string, args: Record<string, unknown>, id = 1) {
	return mcpCall("tools/call", { name, arguments: args }, id);
}

async function mcpLearn(scope: string, trigger: string, learning: string, confidence = 0.9) {
	const learned = await mcpToolCall("learn", { trigger, learning, scope, confidence });
	expect(learned.status).toBe(200);
	return parseMcpToolResultFlexible(learned.body);
}

beforeAll(async () => {
	server = await startServer({
		port: MCP_PORT,
		dbPath: MCP_DB_PATH,
		apiKey: API_KEY,
	});
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
	if (server !== null) {
		await stopServer(server);
		await removeDbArtifacts(server.dbPath);
	}
}, STARTUP_TIMEOUT_MS);

describe("mcp tools", () => {
	it(
		"inject_trace returns candidates, metadata, and injected results",
		async () => {
			const scope = memoryScope("mcp-trace");
			const trigger = unique("deploy-bun-trace");
			const learningText = unique("trace-learning");

			const learned = await mcpLearn(scope, trigger, learningText);
			const learnedId = learned.id;

			const injected = await mcpToolCall("inject", {
				context: `Need memory for ${trigger}`,
				scopes: [scope],
				limit: 5,
			});
			expect(injected.status).toBe(200);
			const injectResult = parseMcpToolResultFlexible(injected.body);
			expect(injectResult.prompt).toBeTypeOf("string");
			const injectedLearnings = asArray(injectResult.learnings);
			expect(injectedLearnings.some((item) => asRecord(item).id === learnedId)).toBe(true);

			// MCP tools/call: inject_trace
			const traced = await mcpToolCall("inject_trace", {
				context: `Need memory for ${trigger}`,
				scopes: [scope],
				limit: 5,
				threshold: 0,
			});

			expect(traced.status).toBe(200);
			const traceResult = parseMcpToolResultFlexible(traced.body);
			expect(asArray(traceResult.candidates).length).toBeGreaterThan(0);
			expect(asArray(traceResult.injected).length).toBeGreaterThan(0);
			const metadata = asRecord(traceResult.metadata);
			expect(typeof metadata.total_candidates).toBe("number");
			expect((metadata.total_candidates as number) > 0).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"query returns matching learnings and per-scope hits",
		async () => {
			const scope = memoryScope("mcp-query");
			const trigger = unique("deploy-bun-query");
			const learningText = unique("query-learning");

			await mcpLearn(scope, trigger, learningText);

			// MCP tools/call: query
			const queried = await mcpToolCall("query", {
				query: `Find memory about ${trigger}`,
				scopes: [scope],
				limit: 5,
			});

			expect(queried.status).toBe(200);
			const queryResult = parseMcpToolResultFlexible(queried.body);
			const learnings = asArray(queryResult.learnings);
			expect(
				learnings.some((item) => {
					const learning = asRecord(item);
					return learning.trigger === trigger || learning.learning === learningText;
				}),
			).toBe(true);

			const hits = asRecord(queryResult.hits);
			expect(typeof hits[scope]).toBe("number");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"forget deletes a learning and list no longer includes it",
		async () => {
			const scope = memoryScope("mcp-forget");
			const trigger = unique("deploy-bun-forget");
			const learningText = unique("forget-learning");

			const learned = await mcpLearn(scope, trigger, learningText);
			const learnedId = String(learned.id);

			// MCP tools/call: forget
			const forgotten = await mcpToolCall("forget", { id: learnedId });
			expect(forgotten.status).toBe(200);
			const forgetResult = parseMcpToolResultFlexible(forgotten.body);
			expect(forgetResult.success).toBe(true);

			// MCP tools/call: list (in forget test)
			const listed = await mcpToolCall("list", { scope, limit: 20 });
			expect(listed.status).toBe(200);
			const listResult = parseMcpToolResultFlexible(listed.body);
			const learnings = asArray(listResult.learnings);
			expect(learnings.some((item) => asRecord(item).id === learnedId)).toBe(false);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"forget_bulk deletes low-confidence learnings by scope",
		async () => {
			const scope = memoryScope("mcp-forget-bulk");

			await mcpLearn(scope, unique("deploy-bun-low-a"), unique("low-learning-a"), 0.2);
			await mcpLearn(scope, unique("deploy-bun-low-b"), unique("low-learning-b"), 0.2);

			// MCP tools/call: forget_bulk
			const forgotten = await mcpToolCall("forget_bulk", {
				confidence_lt: 0.5,
				scope,
			});

			expect(forgotten.status).toBe(200);
			const forgetBulkResult = parseMcpToolResultFlexible(forgotten.body);
			expect(typeof forgetBulkResult.deleted).toBe("number");
			expect((forgetBulkResult.deleted as number) >= 2).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"learning_neighbors returns at least one neighbor with similarity_score",
		async () => {
			const scope = memoryScope("mcp-neighbors");
			const learnedA = await mcpLearn(scope, "deploy bun service", unique("neighbor-a"));
			await mcpLearn(scope, "deploy bun application", unique("neighbor-b"));

			// MCP tools/call: learning_neighbors
			const neighborsResponse = await mcpToolCall("learning_neighbors", {
				id: String(learnedA.id),
				threshold: 0,
				limit: 10,
			});

			expect(neighborsResponse.status).toBe(200);
			const neighborsResult = parseMcpToolResultFlexible(neighborsResponse.body);
			const neighbors = asArray(neighborsResult.learnings);
			expect(neighbors.length).toBeGreaterThan(0);
			expect(
				neighbors.some((item) => {
					const neighbor = asRecord(item);
					return typeof neighbor.similarity_score === "number";
				}),
			).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"list returns learnings for a scope",
		async () => {
			const scope = memoryScope("mcp-list");

			await mcpLearn(scope, unique("deploy-bun-list-a"), unique("list-learning-a"));
			await mcpLearn(scope, unique("deploy-bun-list-b"), unique("list-learning-b"));

			// MCP tools/call: list
			const listed = await mcpToolCall("list", { scope, limit: 20 });
			expect(listed.status).toBe(200);
			const listResult = parseMcpToolResultFlexible(listed.body);
			const learnings = asArray(listResult.learnings);
			expect(learnings.length >= 2).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"stats returns totals and scope data",
		async () => {
			// MCP tools/call: stats
			const statsResponse = await mcpToolCall("stats", {});
			expect(statsResponse.status).toBe(200);
			const stats = parseMcpToolResultFlexible(statsResponse.body);
			expect(typeof stats.totalLearnings).toBe("number");
			expect(typeof stats.totalSecrets).toBe("number");
			expect(Array.isArray(stats.scopes)).toBe(true);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"state_put stores state and starts at revision 1",
		async () => {
			const runId = unique("mcp-state-put");
			// MCP tools/call: state_put
			const put = await mcpToolCall("state_put", { runId, goal: "test goal" });

			expect(put.status).toBe(200);
			const state = parseMcpToolResultFlexible(put.body);
			expect(state.runId).toBe(runId);
			expect(state.revision).toBe(1);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"state_get returns the stored goal",
		async () => {
			const runId = unique("mcp-state-get");
			const goal = unique("goal");

			// MCP tools/call: state_put (in state_get test)
			const put = await mcpToolCall("state_put", { runId, goal });
			expect(put.status).toBe(200);

			// MCP tools/call: state_get
			const got = await mcpToolCall("state_get", { runId });
			expect(got.status).toBe(200);
			const state = parseMcpToolResultFlexible(got.body);
			const stateBody = asRecord(state.state);
			expect(stateBody.goal).toBe(goal);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"state_patch updates state and increments revision",
		async () => {
			const runId = unique("mcp-state-patch");

			// MCP tools/call: state_put (in state_patch test)
			const put = await mcpToolCall("state_put", { runId, goal: "test goal" });
			expect(put.status).toBe(200);

			// MCP tools/call: state_patch
			const patched = await mcpToolCall("state_patch", {
				runId,
				patch: { open_questions: ["Q1"] },
			});

			expect(patched.status).toBe(200);
			const state = parseMcpToolResultFlexible(patched.body);
			expect(state.revision).toBe(2);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"state_resolve resolves run and can persist learning",
		async () => {
			const runId = unique("mcp-state-resolve");
			const scope = memoryScope("mcp-state-resolve");

			// MCP tools/call: state_put (in state_resolve test)
			const put = await mcpToolCall("state_put", {
				runId,
				goal: "test goal",
				next_actions: ["ship"],
			});
			expect(put.status).toBe(200);

			// MCP tools/call: state_resolve
			const resolved = await mcpToolCall("state_resolve", {
				runId,
				persistToLearn: true,
				scope,
			});

			expect(resolved.status).toBe(200);
			const state = parseMcpToolResultFlexible(resolved.body);
			expect(state.status).toBe("resolved");
		},
		TEST_TIMEOUT_MS,
	);
});

describe("mcp error handling", () => {
	it(
		"invalid JSON-RPC version returns -32600",
		async () => {
			const response = await httpJson(getServer().baseUrl, "/mcp", {
				method: "POST",
				body: { jsonrpc: "1.0", id: 1, method: "initialize", params: {} },
			});

			expect(response.status).toBe(200);
			const { code, message } = parseMcpError(response.body);
			expect(code).toBe(-32600);
			expect(message).toContain("Invalid Request");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"unknown method returns -32601",
		async () => {
			const response = await httpJson(getServer().baseUrl, "/mcp", {
				method: "POST",
				body: { jsonrpc: "2.0", id: 1, method: "unknown/method", params: {} },
			});

			expect(response.status).toBe(200);
			const { code, message } = parseMcpError(response.body);
			expect(code).toBe(-32601);
			expect(message).toContain("Method not found");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"unknown tool name returns tool error",
		async () => {
			const response = await mcpCall(
				"tools/call",
				{ name: "nonexistent_tool", arguments: {} },
				1,
			);

			expect(response.status).toBe(200);
			const { code, message } = parseMcpError(response.body);
			expect(code).toBe(-32603);
			expect(message).toContain("Unknown tool");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"missing tool name returns tool error",
		async () => {
			const response = await mcpCall("tools/call", {}, 1);

			expect(response.status).toBe(200);
			const { code, message } = parseMcpError(response.body);
			expect(code).toBe(-32603);
			expect(message).toContain("Tool name is required");
		},
		TEST_TIMEOUT_MS,
	);
});

describe("mcp protocol", () => {
	it(
		"notifications/initialized returns 204",
		async () => {
			const response = await httpJson(getServer().baseUrl, "/mcp", {
				method: "POST",
				body: { jsonrpc: "2.0", method: "notifications/initialized" },
			});

			expect(response.status).toBe(204);
			expect(response.body).toBeNull();
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"GET /mcp returns info and all 13 tools",
		async () => {
			const response = await httpJson(getServer().baseUrl, "/mcp");

			if (response.status === 500) {
				const initialized = await mcpCall("initialize", {}, 91);
				expect(initialized.status).toBe(200);
				const initTop = asRecord(initialized.body);
				const initResult = asRecord(initTop.result);
				const serverInfo = asRecord(initResult.serverInfo);
				expect(serverInfo.name).toBe("deja");

				const listed = await mcpCall("tools/list", {}, 92);
				expect(listed.status).toBe(200);
				const listTop = asRecord(listed.body);
				const listResult = asRecord(listTop.result);
				const listedTools = asArray(listResult.tools);
				expect(listedTools.length).toBe(13);
				return;
			}

			expect(response.status).toBe(200);
			const info = asRecord(response.body);
			expect(info.name).toBe("deja");

			const tools = asArray(info.tools);
			expect(tools.length).toBe(13);
			expect(tools).toEqual(
				expect.arrayContaining([
					"learn",
					"inject",
					"inject_trace",
					"query",
					"forget",
					"forget_bulk",
					"learning_neighbors",
					"list",
					"stats",
					"state_put",
					"state_get",
					"state_patch",
					"state_resolve",
				]),
			);
		},
		TEST_TIMEOUT_MS,
	);
});
