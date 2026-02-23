import { appendFile, mkdir, rm } from "node:fs/promises";

const API_KEY = "smoke-test-key";
const PORT = "9876";
const BASE_URL = `http://localhost:${PORT}`;
const DB_PATH = "./data/smoke-test.db";
const DB_FILES = [DB_PATH, `${DB_PATH}-shm`, `${DB_PATH}-wal`];
const EVIDENCE_E2E = ".sisyphus/evidence/task-12-e2e.txt";
const EVIDENCE_ROUNDTRIP = ".sisyphus/evidence/task-12-roundtrip.txt";

function assert(condition: boolean, msg: string): void {
	if (!condition) throw new Error(msg);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function sleep(ms: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function test(name: string, fn: () => Promise<void>): Promise<boolean> {
	try {
		await fn();
		console.log(`PASS: ${name}`);
		return true;
	} catch (e) {
		console.log(`FAIL: ${name} - ${e instanceof Error ? e.message : String(e)}`);
		return false;
	}
}

async function req(
	method: string,
	path: string,
	body?: unknown,
	auth = true,
): Promise<{ status: number; body: unknown }> {
	const headers: Record<string, string> = {};
	if (auth) headers.Authorization = `Bearer ${API_KEY}`;
	if (body !== undefined) headers["Content-Type"] = "application/json";

	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	const text = await response.text();
	try {
		return { status: response.status, body: JSON.parse(text) };
	} catch {
		return { status: response.status, body: text };
	}
}

async function waitForServer(maxWait = 60_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < maxWait) {
		try {
			const r = await fetch(`${BASE_URL}/`);
			if (r.status < 500) return true;
		} catch {}
		await sleep(2_000);
	}
	return false;
}

async function cleanupDbFiles(): Promise<void> {
	await Promise.all(DB_FILES.map((file) => rm(file, { force: true })));
}

async function appendEvidence(path: string, lines: string[]): Promise<void> {
	await appendFile(path, `${lines.join("\n")}\n`);
}

async function main(): Promise<number> {
	await mkdir("./data", { recursive: true });
	await mkdir(".sisyphus/evidence", { recursive: true });
	await cleanupDbFiles();

	const ldLibraryPath = `/run/current-system/sw/share/nix-ld/lib:${process.env.LD_LIBRARY_PATH || ""}`;
	const server = Bun.spawn(["bun", "run", "src/index.ts"], {
		env: {
			...process.env,
			API_KEY,
			PORT,
			DB_PATH,
			LD_LIBRARY_PATH: ldLibraryPath,
		},
		stdout: "inherit",
		stderr: "inherit",
	});

	const failed: string[] = [];
	const runStartedAt = new Date().toISOString();
	let learnedId = "";
	let learn2Id = "";

	try {
		const ready = await waitForServer();
		if (!ready) {
			throw new Error("Server did not become ready within 60s");
		}

		const scenarios: Array<[string, () => Promise<void>]> = [
			[
				"health",
				async () => {
					const r = await req("GET", "/", undefined, false);
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.status === "ok", `expected status=ok, got ${String(r.body.status)}`);
					assert(
						r.body.service === "deja",
						`expected service=deja, got ${String(r.body.service)}`,
					);
				},
			],
			[
				"auth-reject",
				async () => {
					const r = await req("GET", "/stats", undefined, false);
					assert(r.status === 401, `expected 401, got ${r.status}`);
				},
			],
			[
				"auth-accept",
				async () => {
					const r = await req("GET", "/stats");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(
						r.body.totalLearnings === 0,
						`expected totalLearnings=0, got ${String(r.body.totalLearnings)}`,
					);
				},
			],
			[
				"learn",
				async () => {
					const r = await req("POST", "/learn", {
						scope: "shared",
						trigger: "deploying to production",
						learning: "always run dry-run first",
						confidence: 0.9,
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(typeof r.body.id === "string" && r.body.id.length > 0, "expected id");
					assert(r.body.trigger === "deploying to production", "trigger mismatch");
					assert(r.body.learning === "always run dry-run first", "learning mismatch");
					learnedId = r.body.id;
				},
			],
			[
				"learn-2",
				async () => {
					const r = await req("POST", "/learn", {
						scope: "shared",
						trigger: "cooking pasta",
						learning: "use salted water",
						confidence: 0.8,
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(typeof r.body.id === "string" && r.body.id.length > 0, "expected id");
					learn2Id = r.body.id;
				},
			],
			[
				"inject-roundtrip",
				async () => {
					const r = await req("POST", "/inject", {
						scopes: ["shared"],
						context: "deploying to production",
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(Array.isArray(r.body.learnings), "expected learnings array");
					assert(r.body.learnings.length > 0, "expected non-empty learnings");

					const first = r.body.learnings[0];
					assert(isObject(first), "expected first learning object");
					const trigger = String(first.trigger || "").toLowerCase();
					const learning = String(first.learning || "").toLowerCase();
					assert(
						trigger.includes("production") || learning.includes("dry-run"),
						"expected production/dry-run learning in top result",
					);

					await appendEvidence(EVIDENCE_ROUNDTRIP, [
						`[${new Date().toISOString()}] PASS inject-roundtrip`,
						`first.id=${String(first.id || "")}`,
						`first.trigger=${String(first.trigger || "")}`,
						`first.learning=${String(first.learning || "")}`,
					]);
				},
			],
			[
				"query",
				async () => {
					const r = await req("POST", "/query", {
						scopes: ["shared"],
						text: "production deployment",
						limit: 5,
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(Array.isArray(r.body.learnings), "expected learnings array");
					assert(r.body.learnings.length > 0, "expected non-empty query results");
				},
			],
			[
				"list",
				async () => {
					const r = await req("GET", "/learnings");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(Array.isArray(r.body), "expected array response");
					assert(r.body.length >= 2, `expected >=2 learnings, got ${r.body.length}`);
				},
			],
			[
				"neighbors",
				async () => {
					assert(learnedId.length > 0, "missing learn id from previous scenario");
					const r = await req("GET", `/learning/${learnedId}/neighbors?threshold=0`);
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(Array.isArray(r.body), "expected neighbors array");
				},
			],
			[
				"stats",
				async () => {
					const r = await req("GET", "/stats");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(
						typeof r.body.totalLearnings === "number" && r.body.totalLearnings >= 2,
						`expected totalLearnings>=2, got ${String(r.body.totalLearnings)}`,
					);
					assert(isObject(r.body.scopes), "expected scopes object");
					assert(isObject(r.body.scopes.shared), "expected scopes.shared");
				},
			],
			[
				"delete-learning",
				async () => {
					assert(learn2Id.length > 0, "missing learn-2 id from previous scenario");
					const r = await req("DELETE", `/learning/${learn2Id}`);
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.success === true, "expected success=true");
				},
			],
			[
				"delete-confirm",
				async () => {
					const r = await req("GET", "/learnings");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(Array.isArray(r.body), "expected array response");
					assert(r.body.length === 1, `expected exactly 1 learning, got ${r.body.length}`);
				},
			],
			[
				"secret-set",
				async () => {
					const r = await req("POST", "/secret", {
						scope: "shared",
						name: "test-secret",
						value: "secret-value",
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.success === true, "expected success=true");
				},
			],
			[
				"secret-get",
				async () => {
					const r = await req("GET", "/secret/test-secret?scopes=shared");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.value === "secret-value", "expected secret value");
				},
			],
			[
				"secret-delete",
				async () => {
					const r = await req("DELETE", "/secret/test-secret?scope=shared");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.success === true, "expected success=true");
				},
			],
			[
				"state-put",
				async () => {
					const r = await req("PUT", "/state/run-001", {
						goal: "test goal",
						assumptions: ["a1"],
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.runId === "run-001", "expected runId=run-001");
					assert(typeof r.body.revision === "number", "expected numeric revision");
				},
			],
			[
				"state-get",
				async () => {
					const r = await req("GET", "/state/run-001");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(isObject(r.body.state), "expected state object");
					assert(r.body.state.goal === "test goal", "expected state.goal=test goal");
				},
			],
			[
				"state-patch",
				async () => {
					const r = await req("PATCH", "/state/run-001", { open_questions: ["q1"] });
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.runId === "run-001", "expected runId=run-001");
				},
			],
			[
				"state-event",
				async () => {
					const r = await req("POST", "/state/run-001/events", {
						eventType: "note",
						payload: { text: "hi" },
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.success === true, "expected success=true");
					assert(typeof r.body.id === "string" && r.body.id.length > 0, "expected event id");
				},
			],
			[
				"state-resolve",
				async () => {
					const r = await req("POST", "/state/run-001/resolve", { persistToLearn: false });
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(r.body.status === "resolved", "expected status=resolved");
				},
			],
			[
				"mcp-tools-list",
				async () => {
					const r = await req("POST", "/mcp", {
						jsonrpc: "2.0",
						id: 1,
						method: "tools/list",
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(isObject(r.body.result), "expected result object");
					assert(Array.isArray(r.body.result.tools), "expected result.tools array");
					assert(r.body.result.tools.length === 13, `expected 13 tools, got ${r.body.result.tools.length}`);
				},
			],
			[
				"mcp-learn",
				async () => {
					const r = await req("POST", "/mcp", {
						jsonrpc: "2.0",
						id: 2,
						method: "tools/call",
						params: {
							name: "learn",
							arguments: {
								trigger: "mcp trigger",
								learning: "mcp learning",
								scope: "shared",
							},
						},
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(isObject(r.body.result), "expected result object");
					assert(Array.isArray(r.body.result.content), "expected result.content array");
					assert(isObject(r.body.result.content[0]), "expected first content object");
					assert(r.body.result.content[0].type === "text", "expected content[0].type=text");
				},
			],
			[
				"cleanup",
				async () => {
					const r = await req("POST", "/cleanup");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(typeof r.body.deleted === "number" && r.body.deleted >= 0, "expected deleted>=0");
				},
			],
			[
				"inject-trace",
				async () => {
					const r = await req("POST", "/inject/trace", {
						scopes: ["shared"],
						context: "production deploy",
					});
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(Array.isArray(r.body.candidates), "expected candidates array");
				},
			],
			[
				"delete-bulk",
				async () => {
					const r = await req("DELETE", "/learnings?scope=shared");
					assert(r.status === 200, `expected 200, got ${r.status}`);
					assert(isObject(r.body), "expected JSON object response");
					assert(typeof r.body.deleted === "number" && r.body.deleted >= 0, "expected deleted>=0");
				},
			],
		];

		for (const [name, fn] of scenarios) {
			const ok = await test(name, fn);
			if (!ok) failed.push(name);
		}

		const passed = scenarios.length - failed.length;
		await appendEvidence(EVIDENCE_E2E, [
			`[${new Date().toISOString()}] smoke run`,
			`started=${runStartedAt}`,
			`port=${PORT}`,
			`total=${scenarios.length}`,
			`passed=${passed}`,
			`failed=${failed.length}`,
			`failed_names=${failed.length > 0 ? failed.join(",") : "none"}`,
		]);

		if (failed.length > 0) {
			console.log(`Smoke test failed (${failed.length}/${scenarios.length}): ${failed.join(", ")}`);
			return 1;
		}

		console.log(`Smoke test passed (${scenarios.length}/${scenarios.length})`);
		return 0;
	} finally {
		server.kill();
		await Promise.race([
			server.exited,
			sleep(3_000).then(() => {
				server.kill("SIGKILL");
			}),
		]);
		await cleanupDbFiles();
	}
}

const exitCode = await main();
process.exit(exitCode);
