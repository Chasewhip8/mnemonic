import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export type RunningServer = {
  child: ChildProcess;
  baseUrl: string;
  dbPath: string;
};

export const API_KEY = 'test-key';
export const STARTUP_TIMEOUT_MS = 120_000;
export const TEST_TIMEOUT_MS = 240_000;
export const REQUIRED_LD_LIBRARY_PATH = '/nix/store/j9nz3m8hqnyjjj5zxz5qvmd35g37rjyi-gcc-15.2.0-lib/lib';

export const unique = (label: string) => `${label}-${crypto.randomUUID()}`;
export const memoryScope = (label: string) => `session:${unique(label)}`;

export function mergedLdLibraryPath(current: string | undefined): string {
  if (!current || current.trim() === '') return REQUIRED_LD_LIBRARY_PATH;
  const parts = current.split(':');
  if (parts.includes(REQUIRED_LD_LIBRARY_PATH)) return current;
  return `${REQUIRED_LD_LIBRARY_PATH}:${current}`;
}

export async function removeDbArtifacts(dbPath: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) {
      await rm(target, { force: true });
    }
  }
}

export async function waitForServer(baseUrl: string, timeoutMs = STARTUP_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Server did not become ready at ${baseUrl}: ${String(lastError)}`);
}

export async function stopServer(server: RunningServer): Promise<void> {
  const { child } = server;

  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    once(child, 'exit').then(() => true),
    delay(8_000).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

export async function startServer(options: {
  port: number;
  dbPath: string;
  apiKey?: string;
}): Promise<RunningServer> {
  await removeDbArtifacts(options.dbPath);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(options.port),
    DB_PATH: options.dbPath,
    LD_LIBRARY_PATH: mergedLdLibraryPath(process.env.LD_LIBRARY_PATH),
  };

  if (options.apiKey !== undefined) {
    env.API_KEY = options.apiKey;
  } else {
    delete env.API_KEY;
  }

  const child = spawn('bun', ['run', 'src/index.ts'], {
    cwd: process.cwd(),
    env,
    stdio: 'pipe',
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    await stopServer({ child, baseUrl, dbPath: options.dbPath }).catch(() => undefined);
    throw error;
  }

  return { child, baseUrl, dbPath: options.dbPath };
}

export async function httpJson(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    apiKey?: string;
  } = {},
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers();

  if (options.auth !== false) {
    const effectiveKey = options.apiKey ?? API_KEY;
    headers.set('Authorization', `Bearer ${effectiveKey}`);
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const request: RequestInit = {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers,
  };

  if (options.body !== undefined) {
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${path}`, request);

  const text = await response.text();
  if (text.length === 0) {
    return { status: response.status, body: null };
  }

  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: text };
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('Expected object response');
}

export function asArray(value: unknown): Array<unknown> {
  if (Array.isArray(value)) return value;
  throw new Error('Expected array response');
}
