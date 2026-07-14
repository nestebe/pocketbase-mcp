import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler } from "../util.js";

export function registerCronTools(server: McpServer): void {
  server.registerTool(
    "list_crons",
    {
      title: "List cron jobs",
      description:
        "List all registered cron jobs with their id and cron expression (e.g. the automatic backups job, " +
        "log/token cleanup, plus any custom jobs registered via hooks). Superuser only.",
      inputSchema: {},
    },
    handler(async () => withAuth(async (pb) => ok(await pb.crons.getFullList()))),
  );

  server.registerTool(
    "run_cron",
    {
      title: "Run cron job",
      description: "Manually trigger a registered cron job by its id (as returned by list_crons). Superuser only.",
      inputSchema: {
        jobId: z.string().describe("The cron job id to run."),
      },
    },
    handler(async ({ jobId }) =>
      withAuth(async (pb) => {
        await pb.crons.run(jobId);
        return ok({ success: true, ran: jobId });
      }),
    ),
  );
}
