import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { type Client, createClient } from "@libsql/client";

const MODEL_ID = "onnx-community/bge-small-en-v1.5-ONNX";
const DB_URL = "file:./test-validate.db";
const DB_FILES = [
	"test-validate.db",
	"test-validate.db-shm",
	"test-validate.db-wal",
];
const IDENTICAL_DISTANCE_THRESHOLD = 0.001;
const NIX_LD_LIBRARY_PATH = "/run/current-system/sw/share/nix-ld/lib";

async function maybeReexecWithLdLibraryPath(): Promise<number | null> {
	const hasRequiredPath =
		process.env.LD_LIBRARY_PATH?.split(":").includes(NIX_LD_LIBRARY_PATH) ??
		false;
	const alreadyReexeced = process.env.VALIDATE_BLOCKERS_REEXEC === "1";

	if (hasRequiredPath || alreadyReexeced) {
		return null;
	}

	const libstdcppPath = `${NIX_LD_LIBRARY_PATH}/libstdc++.so.6`;
	if (!(await Bun.file(libstdcppPath).exists())) {
		return null;
	}

	console.log("Preparing native runtime for Transformers.js (libstdc++)...");
	const scriptPath = process.argv[1] ?? "scripts/validate-blockers.ts";
	const currentLdPath = process.env.LD_LIBRARY_PATH?.trim();
	const childLdPath = currentLdPath
		? `${NIX_LD_LIBRARY_PATH}:${currentLdPath}`
		: NIX_LD_LIBRARY_PATH;

	const child = spawn("bun", ["run", scriptPath], {
		stdio: "inherit",
		env: {
			...process.env,
			LD_LIBRARY_PATH: childLdPath,
			VALIDATE_BLOCKERS_REEXEC: "1",
		},
	});

	return await new Promise<number>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => {
			if (signal) {
				reject(new Error(`Child process terminated by signal: ${signal}`));
				return;
			}
			resolve(code ?? 1);
		});
	});
}

async function cleanupDbFiles(): Promise<void> {
	await Promise.all(DB_FILES.map((file) => rm(file, { force: true })));
}

function ensureDistanceNearZero(label: string, distance: number): void {
	if (!Number.isFinite(distance)) {
		throw new Error(`${label}: distance is not finite (${distance})`);
	}

	if (distance >= IDENTICAL_DISTANCE_THRESHOLD) {
		throw new Error(
			`${label}: expected distance < ${IDENTICAL_DISTANCE_THRESHOLD}, got ${distance}`,
		);
	}
}

function readDistance(rows: Array<Record<string, unknown>>): number {
	if (rows.length === 0) {
		throw new Error("No rows returned from distance query");
	}

	const row = rows[0];
	const value = row.distance ?? Object.values(row)[0];
	const distance = Number(value);
	if (!Number.isFinite(distance)) {
		throw new Error(`Distance value is invalid: ${String(value)}`);
	}
	return distance;
}

async function validateBlocker1(): Promise<Float32Array> {
	try {
		console.log("Blocker 1: validating Transformers.js embedding output...");
		const { pipeline } = await import("@huggingface/transformers");
		const extractor = await pipeline("feature-extraction", MODEL_ID);
		const tensor = await extractor("hello world", {
			pooling: "cls",
			normalize: true,
		});

		const embedding = (tensor as { data?: unknown }).data;
		if (!(embedding instanceof Float32Array)) {
			throw new Error(
				`Expected Float32Array, got ${embedding == null ? "null/undefined" : typeof embedding}`,
			);
		}

		if (embedding.length !== 384) {
			throw new Error(`Expected embedding length 384, got ${embedding.length}`);
		}

		console.log(`Embedding length: ${embedding.length}`);
		console.log("Blocker 1: PASS");
		return embedding;
	} catch (error) {
		throw new Error(
			`Blocker 1 failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function validateBlocker2(client: Client): Promise<void> {
	try {
		console.log("Blocker 2: validating libSQL vector functions...");

		await client.execute(`
      CREATE TABLE IF NOT EXISTS blocker_vectors (
        id INTEGER PRIMARY KEY,
        embedding F32_BLOB(384) NOT NULL
      )
    `);

		const vector = new Array<number>(384).fill(0);
		vector[0] = 1;
		const vectorJson = JSON.stringify(vector);

		await client.execute({
			sql: "INSERT INTO blocker_vectors (id, embedding) VALUES (?, vector32(?))",
			args: [1, vectorJson],
		});

		const identicalDistanceResult = await client.execute({
			sql: "SELECT vector_distance_cos(embedding, vector32(?)) AS distance FROM blocker_vectors WHERE id = ?",
			args: [vectorJson, 1],
		});

		const identicalDistance = readDistance(
			identicalDistanceResult.rows as Array<Record<string, unknown>>,
		);
		console.log(`Identical vector distance: ${identicalDistance}`);
		ensureDistanceNearZero("Blocker 2", identicalDistance);
		console.log("Blocker 2: PASS");
	} catch (error) {
		throw new Error(
			`Blocker 2 failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function validateBlocker3(
	client: Client,
	embedding: Float32Array,
): Promise<void> {
	try {
		console.log("Blocker 3: validating embedding -> libSQL roundtrip...");
		const embeddingJson = JSON.stringify(Array.from(embedding));

		await client.execute({
			sql: "INSERT INTO blocker_vectors (id, embedding) VALUES (?, vector32(?))",
			args: [2, embeddingJson],
		});

		const roundtripResult = await client.execute({
			sql: "SELECT vector_distance_cos(embedding, vector32(?)) AS distance FROM blocker_vectors WHERE id = ?",
			args: [embeddingJson, 2],
		});

		const roundtripDistance = readDistance(
			roundtripResult.rows as Array<Record<string, unknown>>,
		);
		console.log(`Roundtrip distance: ${roundtripDistance}`);
		ensureDistanceNearZero("Blocker 3", roundtripDistance);
		console.log("Roundtrip OK");
		console.log("Blocker 3: PASS");
	} catch (error) {
		throw new Error(
			`Blocker 3 failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

async function main(): Promise<number> {
	let client: Client | null = null;

	try {
		const reexecExitCode = await maybeReexecWithLdLibraryPath();
		if (reexecExitCode !== null) {
			return reexecExitCode;
		}

		await cleanupDbFiles();

		const embedding = await validateBlocker1();

		client = createClient({ url: DB_URL });
		await validateBlocker2(client);
		await validateBlocker3(client, embedding);

		console.log("All hard blockers validated successfully.");
		return 0;
	} catch (error) {
		console.error("Validation FAILED");
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	} finally {
		if (client) {
			try {
				await client.close();
			} catch {}
		}
		await cleanupDbFiles();
	}
}

const exitCode = await main();
process.exit(exitCode);
