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

const PORT = 8791;
const RUN_SUFFIX = `${Date.now()}-${process.pid}`;
const DB_PATH = `./data/test-secrets-ext-${RUN_SUFFIX}.db`;

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

describe("secrets extended", () => {
	it(
		"upserts existing secret value for the same name and scope",
		async () => {
			const name = unique("secret-upsert");
			const scope = memoryScope("scope-upsert");

			const firstSet = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: "A", scope },
			});
			expect(firstSet.status).toBe(200);

			const secondSet = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: "B", scope },
			});
			expect(secondSet.status).toBe(200);

			const fetched = await httpJson(
				getServer().baseUrl,
				`/secret/${encodeURIComponent(name)}?scopes=${encodeURIComponent(scope)}`,
			);

			expect(fetched.status).toBe(200);
			expect(asRecord(fetched.body).value).toBe("B");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"returns 404 when getting a non-existent secret",
		async () => {
			const response = await httpJson(
				getServer().baseUrl,
				"/secret/does-not-exist-xyz?scopes=shared",
			);

			expect(response.status).toBe(404);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"uses session scope priority over shared when resolving a secret",
		async () => {
			const name = unique("secret-priority");
			const sessionScope = memoryScope("scope-priority");

			const setSession = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: "session-value", scope: sessionScope },
			});
			expect(setSession.status).toBe(200);

			const setShared = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: "shared-value", scope: "shared" },
			});
			expect(setShared.status).toBe(200);

			const setSessionAgain = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: "session-value", scope: sessionScope },
			});
			expect(setSessionAgain.status).toBe(200);

			const fetched = await httpJson(
				getServer().baseUrl,
				`/secret/${encodeURIComponent(name)}?scopes=${encodeURIComponent(sessionScope)},shared`,
			);

			expect(fetched.status).toBe(200);
			expect(asRecord(fetched.body).value).toBe("session-value");
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"lists all secrets without a scope filter",
		async () => {
			const firstName = unique("secret-list-all-a");
			const secondName = unique("secret-list-all-b");
			const firstScope = memoryScope("scope-list-all-a");

			await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name: firstName, value: unique("value-list-a"), scope: firstScope },
			});

			await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name: secondName, value: unique("value-list-b"), scope: "shared" },
			});

			const listed = await httpJson(getServer().baseUrl, "/secrets");
			expect(listed.status).toBe(200);

			const names = asArray(listed.body).map((item) => asRecord(item).name);
			expect(names.length).toBeGreaterThanOrEqual(2);
			expect(names).toContain(firstName);
			expect(names).toContain(secondName);
		},
		TEST_TIMEOUT_MS,
	);

	it(
		"omits deleted secret from scoped list results",
		async () => {
			const scope = memoryScope("scope-list-delete");
			const name = unique("secret-list-delete");

			const setSecret = await httpJson(getServer().baseUrl, "/secret", {
				method: "POST",
				body: { name, value: unique("value-list-delete"), scope },
			});
			expect(setSecret.status).toBe(200);

			const deleted = await httpJson(
				getServer().baseUrl,
				`/secret/${encodeURIComponent(name)}?scope=${encodeURIComponent(scope)}`,
				{ method: "DELETE" },
			);
			expect(deleted.status).toBe(200);

			const listed = await httpJson(
				getServer().baseUrl,
				`/secrets?scope=${encodeURIComponent(scope)}`,
			);
			expect(listed.status).toBe(200);

			const names = asArray(listed.body).map((item) => asRecord(item).name);
			expect(names).not.toContain(name);
		},
		TEST_TIMEOUT_MS,
	);
});
