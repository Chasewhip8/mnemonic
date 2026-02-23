import { and, desc, eq, like, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { startCleanupCron } from "./cleanup";
import { getDb, getDrizzle, initDb } from "./db";
import { initEmbeddings } from "./embeddings";
import * as schema from "./schema";
import {
	DejaService,
	type InjectResult,
	type WorkingStateResponse,
} from "./service";

const app = new Hono();

type JsonObject = Record<string, unknown>;
type DeleteLearningsFilters = Parameters<DejaService["deleteLearnings"]>[0];
type ResolveStateOptions = NonNullable<
	Parameters<DejaService["resolveState"]>[1]
>;
type UpsertStatePayload = Parameters<DejaService["upsertState"]>[1];

declare const Bun: {
	serve(options: {
		port: number;
		fetch: (request: Request) => Response | Promise<Response>;
	}): unknown;
};

function asObject(value: unknown): JsonObject {
	return typeof value === "object" && value !== null
		? (value as JsonObject)
		: {};
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
	if (!Array.isArray(value)) return fallback;
	const items = value.filter(
		(entry): entry is string => typeof entry === "string",
	);
	return items.length > 0 ? items : fallback;
}

const MCP_TOOLS = [
	{
		name: "learn",
		description:
			'Store a learning for future recall. Use after completing tasks, encountering issues, or when the user says "remember this".',
		inputSchema: {
			type: "object",
			properties: {
				trigger: {
					type: "string",
					description:
						'When this learning applies (e.g., "deploying to production")',
				},
				learning: {
					type: "string",
					description: 'What was learned (e.g., "always run dry-run first")',
				},
				confidence: {
					type: "number",
					description: "Confidence level 0-1 (default 0.8)",
					default: 0.8,
				},
				scope: {
					type: "string",
					description:
						'Memory scope: "shared", "agent:<id>", or "session:<id>"',
					default: "shared",
				},
				reason: { type: "string", description: "Why this was learned" },
				source: { type: "string", description: "Source identifier" },
			},
			required: ["trigger", "learning"],
		},
	},
	{
		name: "inject",
		description:
			"Retrieve relevant memories for the current context. Use before starting tasks to get helpful context.",
		inputSchema: {
			type: "object",
			properties: {
				context: {
					type: "string",
					description: "Current context to find relevant memories for",
				},
				scopes: {
					type: "array",
					items: { type: "string" },
					description: "Scopes to search",
					default: ["shared"],
				},
				limit: {
					type: "number",
					description: "Max memories to return",
					default: 5,
				},
				includeState: {
					type: "boolean",
					description: "Include live working state in prompt",
					default: false,
				},
				runId: {
					type: "string",
					description: "Run/session ID when includeState is true",
				},
			},
			required: ["context"],
		},
	},
	{
		name: "inject_trace",
		description:
			"Debug retrieval pipeline: returns candidates, similarity scores, threshold filtering. Use to understand why agents recall what they recall.",
		inputSchema: {
			type: "object",
			properties: {
				context: {
					type: "string",
					description: "Current context to find relevant memories for",
				},
				scopes: {
					type: "array",
					items: { type: "string" },
					description: "Scopes to search",
					default: ["shared"],
				},
				limit: {
					type: "number",
					description: "Max memories to return",
					default: 5,
				},
				threshold: {
					type: "number",
					description:
						"Minimum similarity score (0-1). Memories below this are marked rejected.",
					default: 0,
				},
			},
			required: ["context"],
		},
	},
	{
		name: "query",
		description:
			"Search memories semantically. Use when looking for specific past learnings.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search query" },
				scopes: {
					type: "array",
					items: { type: "string" },
					description: "Scopes to search",
					default: ["shared"],
				},
				limit: { type: "number", description: "Max results", default: 10 },
			},
			required: ["query"],
		},
	},
	{
		name: "forget",
		description:
			"Delete a specific learning by ID. Use to remove outdated or incorrect memories.",
		inputSchema: {
			type: "object",
			properties: {
				id: { type: "string", description: "Learning ID to delete" },
			},
			required: ["id"],
		},
	},
	{
		name: "forget_bulk",
		description:
			"Bulk delete memories by filters. Requires at least one filter. Use to prune stale or low-confidence memories.",
		inputSchema: {
			type: "object",
			properties: {
				confidence_lt: {
					type: "number",
					description: "Delete memories with confidence below this",
				},
				not_recalled_in_days: {
					type: "number",
					description: "Delete memories not recalled in this many days",
				},
				scope: {
					type: "string",
					description: "Delete only memories in this scope",
				},
			},
		},
	},
	{
		name: "learning_neighbors",
		description:
			"Find semantically similar memories for a learning. Use to check for contradictions or overlap before saving new memories.",
		inputSchema: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "Learning ID to find neighbors for",
				},
				threshold: {
					type: "number",
					description: "Minimum cosine similarity (0-1)",
					default: 0.85,
				},
				limit: {
					type: "number",
					description: "Max neighbors to return",
					default: 10,
				},
			},
			required: ["id"],
		},
	},
	{
		name: "list",
		description: "List all memories, optionally filtered by scope.",
		inputSchema: {
			type: "object",
			properties: {
				scope: { type: "string", description: "Filter by scope" },
				limit: { type: "number", description: "Max results", default: 20 },
			},
		},
	},
	{
		name: "stats",
		description: "Get memory statistics including counts by scope.",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "state_put",
		description: "Upsert live working state for a run/session.",
		inputSchema: {
			type: "object",
			properties: {
				runId: { type: "string" },
				goal: { type: "string" },
				assumptions: { type: "array", items: { type: "string" } },
				decisions: { type: "array", items: { type: "object" } },
				open_questions: { type: "array", items: { type: "string" } },
				next_actions: { type: "array", items: { type: "string" } },
				confidence: { type: "number" },
				updatedBy: { type: "string" },
			},
			required: ["runId"],
		},
	},
	{
		name: "state_get",
		description: "Fetch live working state for a run/session.",
		inputSchema: {
			type: "object",
			properties: { runId: { type: "string" } },
			required: ["runId"],
		},
	},
	{
		name: "state_patch",
		description: "Patch live working state for a run/session.",
		inputSchema: {
			type: "object",
			properties: {
				runId: { type: "string" },
				patch: { type: "object" },
				updatedBy: { type: "string" },
			},
			required: ["runId", "patch"],
		},
	},
	{
		name: "state_resolve",
		description:
			"Resolve a run/session state and optionally persist compact learnings.",
		inputSchema: {
			type: "object",
			properties: {
				runId: { type: "string" },
				persistToLearn: { type: "boolean", default: false },
				scope: { type: "string", default: "shared" },
				summaryStyle: {
					type: "string",
					enum: ["compact", "full"],
					default: "compact",
				},
				updatedBy: { type: "string" },
			},
			required: ["runId"],
		},
	},
];

function formatStatePrompt(state: WorkingStateResponse): string {
	const lines: string[] = [];
	lines.push("Working state (live):");
	if (state.state.goal) lines.push(`Goal: ${state.state.goal}`);
	if (state.state.assumptions?.length) {
		lines.push("Assumptions:");
		for (const a of state.state.assumptions) lines.push(`- ${a}`);
	}
	if (state.state.decisions?.length) {
		lines.push("Decisions:");
		for (const d of state.state.decisions) {
			lines.push(`- ${d.text}${d.status ? ` (${d.status})` : ""}`);
		}
	}
	if (state.state.open_questions?.length) {
		lines.push("Open questions:");
		for (const q of state.state.open_questions) lines.push(`- ${q}`);
	}
	if (state.state.next_actions?.length) {
		lines.push("Next actions:");
		for (const a of state.state.next_actions) lines.push(`- ${a}`);
	}
	if (typeof state.state.confidence === "number") {
		lines.push(`Confidence: ${state.state.confidence}`);
	}
	return lines.join("\n");
}

async function maybeAttachState(
	service: DejaService,
	result: InjectResult,
	includeState: unknown,
	runId: unknown,
	format: string,
): Promise<void> {
	if (!(includeState && typeof runId === "string" && runId.trim())) return;

	const state = await service.getState(runId.trim());
	if (!state) return;

	const statePrompt = formatStatePrompt(state);
	if (result.prompt) {
		result.prompt = `${statePrompt}\n\n${result.prompt}`;
	} else if ((format || "prompt") === "prompt") {
		result.prompt = statePrompt;
	}
	result.state = state;
}

async function runCleanup(): Promise<{ deleted: number; reasons: string[] }> {
	const drizzle = getDrizzle();
	let deleted = 0;
	const reasons: string[] = [];

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const staleSession = await drizzle
		.select({ id: schema.learnings.id })
		.from(schema.learnings)
		.where(
			and(
				like(schema.learnings.scope, "session:%"),
				sql`${schema.learnings.createdAt} < ${weekAgo}`,
			),
		);
	if (staleSession.length > 0) {
		deleted += staleSession.length;
		reasons.push(`${staleSession.length} stale session entries`);
		await drizzle
			.delete(schema.learnings)
			.where(
				and(
					like(schema.learnings.scope, "session:%"),
					sql`${schema.learnings.createdAt} < ${weekAgo}`,
				),
			);
	}

	const monthAgo = new Date(
		Date.now() - 30 * 24 * 60 * 60 * 1000,
	).toISOString();
	const staleAgent = await drizzle
		.select({ id: schema.learnings.id })
		.from(schema.learnings)
		.where(
			and(
				like(schema.learnings.scope, "agent:%"),
				sql`${schema.learnings.createdAt} < ${monthAgo}`,
			),
		);
	if (staleAgent.length > 0) {
		deleted += staleAgent.length;
		reasons.push(`${staleAgent.length} stale agent entries`);
		await drizzle
			.delete(schema.learnings)
			.where(
				and(
					like(schema.learnings.scope, "agent:%"),
					sql`${schema.learnings.createdAt} < ${monthAgo}`,
				),
			);
	}

	const lowConfidence = await drizzle
		.select({ id: schema.learnings.id })
		.from(schema.learnings)
		.where(sql`${schema.learnings.confidence} < 0.3`);
	if (lowConfidence.length > 0) {
		deleted += lowConfidence.length;
		reasons.push(`${lowConfidence.length} low confidence entries`);
		await drizzle
			.delete(schema.learnings)
			.where(sql`${schema.learnings.confidence} < 0.3`);
	}

	return { deleted, reasons };
}

async function handleMcpToolCall(
	service: DejaService,
	toolName: string,
	args: JsonObject,
): Promise<unknown> {
	switch (toolName) {
		case "learn":
			return service.learn(
				asString(args.scope) ?? "shared",
				asString(args.trigger) ?? "",
				asString(args.learning) ?? "",
				asNumber(args.confidence) ?? 0.8,
				asString(args.reason),
				asString(args.source),
			);

		case "inject": {
			const result = await service.inject(
				asStringArray(args.scopes, ["shared"]),
				asString(args.context) ?? "",
				asNumber(args.limit) ?? 5,
				"prompt",
			);
			await maybeAttachState(
				service,
				result,
				args.includeState,
				args.runId,
				"prompt",
			);
			return result;
		}

		case "inject_trace": {
			const threshold = asNumber(args.threshold) ?? 0;
			return service.injectTrace(
				asStringArray(args.scopes, ["shared"]),
				asString(args.context) ?? "",
				asNumber(args.limit) ?? 5,
				threshold,
			);
		}

		case "query":
			return service.query(
				asStringArray(args.scopes, ["shared"]),
				asString(args.query) ?? "",
				asNumber(args.limit) ?? 10,
			);

		case "forget":
			return service.deleteLearning(asString(args.id) ?? "");

		case "learning_neighbors":
			return service.getLearningNeighbors(
				asString(args.id) ?? "",
				asNumber(args.threshold) ?? 0.85,
				asNumber(args.limit) ?? 10,
			);

		case "forget_bulk":
			return service.deleteLearnings({
				confidence_lt: asNumber(args.confidence_lt),
				not_recalled_in_days: asNumber(args.not_recalled_in_days),
				scope: asString(args.scope),
			});

		case "list":
			return service.getLearnings({
				scope: asString(args.scope),
				limit: asNumber(args.limit),
			});

		case "stats":
			return service.getStats();

		case "state_get":
			return service.getState(asString(args.runId) ?? "");

		case "state_put": {
			const runId = asString(args.runId);
			if (!runId) throw new Error("runId is required");
			const { runId: _runId, ...payload } = args;
			return service.upsertState(
				runId,
				payload as unknown as UpsertStatePayload,
				asString(payload.updatedBy),
				asString(payload.changeSummary),
			);
		}

		case "state_patch":
			return service.patchState(
				asString(args.runId) ?? "",
				asObject(args.patch),
				asString(args.updatedBy),
			);

		case "state_resolve":
			return service.resolveState(asString(args.runId) ?? "", {
				persistToLearn: args.persistToLearn === true,
				scope: asString(args.scope),
				summaryStyle:
					args.summaryStyle === "compact" || args.summaryStyle === "full"
						? args.summaryStyle
						: undefined,
				updatedBy: asString(args.updatedBy),
			});

		default:
			throw new Error(`Unknown tool: ${toolName}`);
	}
}

async function handleMcpRequest(
	c: Context,
	service: DejaService,
): Promise<Response> {
	const body = asObject(await c.req.json());
	const jsonrpc = body.jsonrpc;
	const id = body.id;
	const method = body.method;
	const params = asObject(body.params);

	if (jsonrpc !== "2.0") {
		return c.json({
			jsonrpc: "2.0",
			id,
			error: {
				code: -32600,
				message: "Invalid Request - must be JSON-RPC 2.0",
			},
		});
	}

	try {
		let result: unknown;

		switch (method) {
			case "initialize":
				result = {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "deja", version: "1.0.0" },
				};
				break;

			case "tools/list":
				result = { tools: MCP_TOOLS };
				break;

			case "tools/call": {
				const name = asString(params.name);
				if (!name) throw new Error("Tool name is required");
				const toolResult = await handleMcpToolCall(
					service,
					name,
					asObject(params.arguments),
				);
				result = {
					content: [
						{ type: "text", text: JSON.stringify(toolResult, null, 2) },
					],
				};
				break;
			}

			case "notifications/initialized":
			case "notifications/cancelled":
				return new Response(null, { status: 204 });

			default:
				return c.json({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: `Method not found: ${method}` },
				});
		}

		return c.json({ jsonrpc: "2.0", id, result });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Internal error";
		return c.json({
			jsonrpc: "2.0",
			id,
			error: { code: -32603, message },
		});
	}
}

app.use(
	"*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "DELETE", "PATCH", "PUT", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

app.use("*", async (c, next) => {
	if (c.req.method === "OPTIONS" || c.req.path === "/") return next();
	const apiKey = process.env.API_KEY;
	if (apiKey) {
		const auth = c.req.header("Authorization");
		const provided = auth?.replace("Bearer ", "");
		if (provided !== apiKey) {
			return c.json({ error: "unauthorized - API key required" }, 401);
		}
	}
	return next();
});

await initDb();
await initEmbeddings();
const db = getDb();
const drizzle = getDrizzle();
const service = new DejaService(db, drizzle) as DejaService & {
	cleanup: () => Promise<{ deleted: number; reasons: string[] }>;
};
service.cleanup = runCleanup;

app.get("/", (c) => c.json({ status: "ok", service: "deja" }));

app.post("/learn", async (c) => {
	const body = asObject(await c.req.json());
	const result = await service.learn(
		asString(body.scope) ?? "shared",
		asString(body.trigger) ?? "",
		asString(body.learning) ?? "",
		asNumber(body.confidence),
		asString(body.reason),
		asString(body.source),
	);
	return c.json(result);
});

app.post("/query", async (c) => {
	const body = asObject(await c.req.json());
	const result = await service.query(
		asStringArray(body.scopes, ["shared"]),
		asString(body.text) ?? "",
		asNumber(body.limit),
	);
	return c.json(result);
});

app.post("/inject", async (c) => {
	const body = asObject(await c.req.json());
	const format = body.format === "learnings" ? "learnings" : "prompt";
	const result = await service.inject(
		asStringArray(body.scopes, ["shared"]),
		asString(body.context) ?? "",
		asNumber(body.limit),
		format,
	);
	await maybeAttachState(
		service,
		result,
		body.includeState,
		body.runId,
		format,
	);
	return c.json(result);
});

app.post("/inject/trace", async (c) => {
	const body = asObject(await c.req.json().catch(() => ({})));
	const thresholdParam = c.req.query("threshold");
	const threshold =
		asNumber(body.threshold) !== undefined
			? (asNumber(body.threshold) as number)
			: thresholdParam !== undefined
				? parseFloat(thresholdParam)
				: 0;
	const result = await service.injectTrace(
		asStringArray(body.scopes, ["shared"]),
		asString(body.context) ?? "",
		asNumber(body.limit) ?? 5,
		Number.isFinite(threshold) ? threshold : 0,
	);
	return c.json(result);
});

app.get("/stats", async (c) => c.json(await service.getStats()));

app.get("/learnings", async (c) => {
	const scope = c.req.query("scope");
	const limit = c.req.query("limit");
	const result = await service.getLearnings({
		scope,
		limit: limit ? parseInt(limit, 10) : undefined,
	});
	return c.json(result);
});

app.delete("/learnings", async (c) => {
	const confidenceLt = c.req.query("confidence_lt");
	const notRecalledInDays = c.req.query("not_recalled_in_days");
	const scope = c.req.query("scope");

	const filters: DeleteLearningsFilters = {};
	if (confidenceLt != null) {
		const n = parseFloat(confidenceLt);
		if (Number.isFinite(n)) filters.confidence_lt = n;
	}
	if (notRecalledInDays != null) {
		const n = parseInt(notRecalledInDays, 10);
		if (Number.isFinite(n) && n > 0) filters.not_recalled_in_days = n;
	}
	if (scope?.trim()) filters.scope = scope.trim();

	if (Object.keys(filters).length === 0) {
		return c.json(
			{
				error:
					"At least one filter required: confidence_lt, not_recalled_in_days, or scope",
			},
			400,
		);
	}

	return c.json(await service.deleteLearnings(filters));
});

app.delete("/learning/:id", async (c) => {
	const id = c.req.param("id");
	return c.json(await service.deleteLearning(id));
});

app.get("/learning/:id/neighbors", async (c) => {
	const id = c.req.param("id");
	const thresholdParam = c.req.query("threshold");
	const limitParam = c.req.query("limit");
	const threshold = thresholdParam ? parseFloat(thresholdParam) : 0.85;
	const limit = limitParam ? parseInt(limitParam, 10) : 10;
	const result = await service.getLearningNeighbors(
		id,
		Number.isFinite(threshold) ? threshold : 0.85,
		Number.isFinite(limit) && limit > 0 ? limit : 10,
	);
	return c.json(result);
});

app.post("/secret", async (c) => {
	const body = asObject(await c.req.json());
	return c.json(
		await service.setSecret(
			asString(body.scope) ?? "shared",
			asString(body.name) ?? "",
			asString(body.value) ?? "",
		),
	);
});

app.get("/secret/:name", async (c) => {
	const name = c.req.param("name");
	const scopes = c.req.query("scopes")?.split(",") || ["shared"];
	const result = await service.getSecret(scopes, name);
	if (result === null) return c.json({ error: "not found" }, 404);
	return c.json({ value: result });
});

app.delete("/secret/:name", async (c) => {
	const name = c.req.param("name");
	const scope = c.req.query("scope") || "shared";
	const result = await service.deleteSecret(scope, name);
	if (result.error) return c.json({ error: result.error }, 404);
	return c.json(result);
});

app.get("/secrets", async (c) => {
	const scope = c.req.query("scope");
	const results = scope
		? await drizzle
				.select()
				.from(schema.secrets)
				.where(eq(schema.secrets.scope, scope))
				.orderBy(desc(schema.secrets.updatedAt))
		: await drizzle
				.select()
				.from(schema.secrets)
				.orderBy(desc(schema.secrets.updatedAt));
	return c.json(results);
});

app.get("/state/:runId", async (c) => {
	const runId = c.req.param("runId");
	const state = await service.getState(runId);
	if (!state) return c.json({ error: "not found" }, 404);
	return c.json(state);
});

app.put("/state/:runId", async (c) => {
	const runId = c.req.param("runId");
	const body = asObject(await c.req.json());
	const state = await service.upsertState(
		runId,
		body as unknown as UpsertStatePayload,
		asString(body.updatedBy),
		asString(body.changeSummary) ?? "state put",
	);
	return c.json(state);
});

app.patch("/state/:runId", async (c) => {
	const runId = c.req.param("runId");
	const body = asObject(await c.req.json());
	return c.json(
		await service.patchState(runId, body, asString(body.updatedBy)),
	);
});

app.post("/state/:runId/events", async (c) => {
	const runId = c.req.param("runId");
	const body = asObject(await c.req.json());
	const payload = body.payload !== undefined ? asObject(body.payload) : body;
	const result = await service.addStateEvent(
		runId,
		asString(body.eventType) ?? "note",
		payload,
		asString(body.createdBy),
	);
	return c.json(result);
});

app.post("/state/:runId/resolve", async (c) => {
	const runId = c.req.param("runId");
	const body = asObject(await c.req.json());
	const opts: ResolveStateOptions = {
		persistToLearn: body.persistToLearn === true,
		scope: asString(body.scope),
		summaryStyle:
			body.summaryStyle === "compact" || body.summaryStyle === "full"
				? body.summaryStyle
				: undefined,
		updatedBy: asString(body.updatedBy),
	};
	const result = await service.resolveState(runId, opts);
	if (!result) return c.json({ error: "not found" }, 404);
	return c.json(result);
});

app.post("/cleanup", async (c) => {
	return c.json(await service.cleanup());
});

app.post("/mcp", async (c) => handleMcpRequest(c, service));

app.get("/mcp", async (c) => {
	const url = new URL(c.req.url);
	return c.json({
		name: "deja",
		version: "1.0.0",
		description:
			"Persistent memory for agents. Store learnings, recall context.",
		protocol: "mcp",
		endpoint: `${url.origin}/mcp`,
		tools: MCP_TOOLS.map((t) => t.name),
	});
});

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
	console.error("Hono error:", err);
	return c.json({ error: err.message }, 500);
});

startCleanupCron(service);

const port = Number(process.env.PORT) || 8787;
Bun.serve({ port, fetch: app.fetch });
console.log(`Server running on port ${port}`);
