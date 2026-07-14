/**
 * Thin wrapper around the official PocketBase JS SDK that:
 *  - lazily creates a singleton client from the environment config,
 *  - authenticates as a superuser (or against a configured auth collection),
 *  - transparently re-authenticates when the token expires (401),
 *  - exposes helpers used by the tool modules.
 */
import PocketBase, { ClientResponseError } from "pocketbase";
import { loadConfig, type Config } from "./config.js";

let client: PocketBase | null = null;
let config: Config | null = null;

export function getConfig(): Config {
  if (!config) config = loadConfig();
  return config;
}

export function getClient(): PocketBase {
  if (!client) {
    const cfg = getConfig();
    client = new PocketBase(cfg.url);
    // PocketBase SDK auto-refreshes tokens for auth collections; disable the
    // implicit re-throw on cancelled duplicate requests to keep tool calls simple.
    client.autoCancellation(false);
    if (cfg.token) {
      client.authStore.save(cfg.token, null);
    }
  }
  return client;
}

/**
 * Create a fresh, independent PocketBase client sharing only the base URL.
 * Used for operations that would otherwise overwrite the superuser session in
 * the shared client's auth store (e.g. authenticating as an end user).
 */
export function freshClient(): PocketBase {
  const pb = new PocketBase(getConfig().url);
  pb.autoCancellation(false);
  return pb;
}

/** Authenticate if we do not already hold a valid token. */
export async function ensureAuth(force = false): Promise<void> {
  const cfg = getConfig();
  const pb = getClient();

  if (!force && pb.authStore.isValid) return;

  // A pre-issued token was provided but is (now) invalid and we have no
  // credentials to refresh it — nothing more we can do.
  if (cfg.token && !cfg.adminEmail) {
    if (!pb.authStore.isValid) {
      throw new Error(
        "POCKETBASE_TOKEN is invalid/expired and no admin credentials were " +
          "provided to obtain a new one.",
      );
    }
    return;
  }

  if (!cfg.adminEmail || !cfg.adminPassword) {
    throw new Error(
      "No credentials configured. Set POCKETBASE_ADMIN_EMAIL and " +
        "POCKETBASE_ADMIN_PASSWORD (or POCKETBASE_TOKEN) in your MCP client env.",
    );
  }

  pb.authStore.clear();
  await pb
    .collection(cfg.authCollection)
    .authWithPassword(cfg.adminEmail, cfg.adminPassword);
}

/**
 * Run an authenticated PocketBase operation, re-authenticating once if the
 * server rejects the current token (401/403 auth errors).
 */
export async function withAuth<T>(fn: (pb: PocketBase) => Promise<T>): Promise<T> {
  await ensureAuth();
  const pb = getClient();
  try {
    return await fn(pb);
  } catch (err) {
    if (err instanceof ClientResponseError && (err.status === 401 || err.status === 403)) {
      // Token likely expired mid-session; re-auth once and retry.
      await ensureAuth(true);
      return await fn(getClient());
    }
    throw err;
  }
}

/** Current authenticated identity info (without exposing the raw token). */
export async function authInfo(): Promise<Record<string, unknown>> {
  const cfg = getConfig();
  await ensureAuth();
  const pb = getClient();
  return {
    url: cfg.url,
    authCollection: cfg.authCollection,
    isValid: pb.authStore.isValid,
    record: pb.authStore.record
      ? {
          id: (pb.authStore.record as any).id,
          email: (pb.authStore.record as any).email,
          collectionName: (pb.authStore.record as any).collectionName,
        }
      : null,
  };
}
