import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";

export function registerLogTools(server: McpServer): void {
  server.registerTool(
    "list_logs",
    {
      title: "List logs",
      description:
        "List application request/activity logs with pagination, filtering and sorting (superuser only). " +
        "Filter example: 'level >= 4 && data.status >= 400'. Sort defaults to newest first.",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number (default 1)."),
        perPage: z.number().int().positive().max(500).optional().describe("Items per page (default 50)."),
        filter: z.string().optional().describe("Filter expression over log fields (level, message, data.*)."),
        sort: z.string().optional().describe("Sort expression (default '-created')."),
      },
    },
    handler(async ({ page, perPage, filter, sort }) =>
      withAuth(async (pb) =>
        ok(await pb.logs.getList(page ?? 1, perPage ?? 50, compact({ filter, sort: sort ?? "-created" }))),
      ),
    ),
  );

  server.registerTool(
    "get_log",
    {
      title: "Get log",
      description: "Fetch a single log entry by its id (superuser only).",
      inputSchema: {
        id: z.string().describe("Log entry id."),
      },
    },
    handler(async ({ id }) => withAuth(async (pb) => ok(await pb.logs.getOne(id)))),
  );

  server.registerTool(
    "get_logs_stats",
    {
      title: "Get logs statistics",
      description:
        "Return hourly aggregated log statistics, optionally filtered. Useful to chart request volume or " +
        "error rates. Filter example: 'level = 0'.",
      inputSchema: {
        filter: z.string().optional().describe("Filter expression to scope the statistics."),
      },
    },
    handler(async ({ filter }) => withAuth(async (pb) => ok(await pb.logs.getStats(compact({ filter }))))),
  );
}
