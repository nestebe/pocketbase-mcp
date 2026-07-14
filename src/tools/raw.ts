import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";

export function registerRawTools(server: McpServer): void {
  server.registerTool(
    "send_raw_request",
    {
      title: "Send raw API request",
      description:
        "Escape hatch: send an arbitrary authenticated HTTP request to any PocketBase API endpoint. " +
        "Use this for endpoints not covered by a dedicated tool, custom routes added via hooks, or new API " +
        "features. The Authorization header (superuser token) is attached automatically. " +
        "`path` is relative to the server root and must start with '/api/...' (e.g. '/api/collections'). " +
        "Returns the parsed JSON response.",
      inputSchema: {
        path: z.string().describe("Request path, e.g. '/api/health' or '/api/collections/posts/records'."),
        method: z
          .enum(["GET", "POST", "PATCH", "PUT", "DELETE"])
          .optional()
          .describe("HTTP method (default GET)."),
        body: z.record(z.any()).optional().describe("JSON request body for POST/PATCH/PUT."),
        query: z.record(z.any()).optional().describe("Query parameters as a key/value object."),
        headers: z.record(z.string()).optional().describe("Extra request headers."),
      },
    },
    handler(async ({ path, method, body, query, headers }) =>
      withAuth(async (pb) => {
        const result = await pb.send(
          path,
          compact({
            method: method ?? "GET",
            body: body ? JSON.stringify(body) : undefined,
            query,
            headers: {
              ...(body ? { "Content-Type": "application/json" } : {}),
              ...(headers ?? {}),
            },
          }) as any,
        );
        return ok(result);
      }),
    ),
  );
}
