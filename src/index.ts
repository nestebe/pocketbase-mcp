#!/usr/bin/env node
/**
 * PocketBase MCP server — entry point (stdio transport).
 *
 * Reads connection settings from the environment (POCKETBASE_URL,
 * POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD, ...) and exposes the full
 * PocketBase management surface as MCP tools.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { ensureAuth, getConfig } from "./pocketbase.js";

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Everything that is not MCP protocol traffic must go to stderr.
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);

  // Best-effort eager auth so credential problems surface immediately in logs
  // (without failing startup — tools will report actionable errors otherwise).
  try {
    const cfg = getConfig();
    console.error(`Connecting to PocketBase at ${cfg.url} (auth collection: ${cfg.authCollection})`);
    await ensureAuth();
    console.error("Authenticated with PocketBase successfully.");
  } catch (err) {
    console.error(
      `Warning: initial PocketBase authentication failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal error starting PocketBase MCP server:", err);
  process.exit(1);
});
