/**
 * Runtime configuration, read from environment variables.
 *
 * These are the variables an MCP client passes through its `env` block, e.g.:
 *   {
 *     "env": {
 *       "POCKETBASE_URL": "http://localhost:8090",
 *       "POCKETBASE_ADMIN_EMAIL": "admin@example.com",
 *       "POCKETBASE_ADMIN_PASSWORD": "..."
 *     }
 *   }
 */

export interface Config {
  /** Base URL of the PocketBase instance (e.g. http://localhost:8090). */
  url: string;
  /** Superuser (or auth-collection) identity used to authenticate. */
  adminEmail?: string;
  /** Password for the identity above. */
  adminPassword?: string;
  /** Auth collection to authenticate against. Defaults to `_superusers`. */
  authCollection: string;
  /** Optional pre-issued auth token (skips email/password login). */
  token?: string;
}

export function loadConfig(): Config {
  const url = (process.env.POCKETBASE_URL || "").trim();
  if (!url) {
    throw new Error(
      "POCKETBASE_URL is not set. Configure it in your MCP client `env` block " +
        "(e.g. http://localhost:8090).",
    );
  }

  return {
    url: url.replace(/\/+$/, ""),
    adminEmail: process.env.POCKETBASE_ADMIN_EMAIL?.trim() || undefined,
    adminPassword: process.env.POCKETBASE_ADMIN_PASSWORD || undefined,
    authCollection:
      process.env.POCKETBASE_AUTH_COLLECTION?.trim() || "_superusers",
    token: process.env.POCKETBASE_TOKEN?.trim() || undefined,
  };
}
