import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, authInfo } from "../pocketbase.js";
import { ok, handler } from "../util.js";

export function registerHealthTools(server: McpServer): void {
  server.registerTool(
    "health_check",
    {
      title: "Health check",
      description:
        "Check the PocketBase API health status. Does not require authentication. " +
        "Returns the server code, message and health data.",
      inputSchema: {},
    },
    handler(async () => {
      const pb = getClient();
      const result = await pb.health.check();
      return ok(result);
    }),
  );

  server.registerTool(
    "auth_info",
    {
      title: "Authentication info",
      description:
        "Return information about the current MCP authentication: PocketBase URL, " +
        "the auth collection used, whether the token is valid, and the identity " +
        "(id/email) of the authenticated superuser or user. The raw token is never exposed.",
      inputSchema: {},
    },
    handler(async () => ok(await authInfo())),
  );
}
