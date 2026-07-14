import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";

const SUPERUSERS = "_superusers";

/** Convenience tools around the built-in `_superusers` auth collection (admins). */
export function registerSuperuserTools(server: McpServer): void {
  server.registerTool(
    "list_superusers",
    {
      title: "List superusers",
      description: "List superuser (admin) accounts from the built-in _superusers collection.",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number (default 1)."),
        perPage: z.number().int().positive().max(500).optional().describe("Items per page (default 100)."),
        filter: z.string().optional().describe("Filter expression, e.g. 'email ~ \"@example.com\"'."),
        sort: z.string().optional().describe("Sort expression, e.g. '-created'."),
      },
    },
    handler(async ({ page, perPage, filter, sort }) =>
      withAuth(async (pb) =>
        ok(await pb.collection(SUPERUSERS).getList(page ?? 1, perPage ?? 100, compact({ filter, sort }))),
      ),
    ),
  );

  server.registerTool(
    "create_superuser",
    {
      title: "Create superuser",
      description:
        "Create a new superuser (admin) account. Provide email and password. " +
        "The new superuser has full administrative access to the instance.",
      inputSchema: {
        email: z.string().describe("Superuser email."),
        password: z.string().min(8).describe("Superuser password (min 8 chars)."),
        passwordConfirm: z.string().optional().describe("Password confirmation (defaults to password)."),
      },
    },
    handler(async ({ email, password, passwordConfirm }) =>
      withAuth(async (pb) =>
        ok(
          await pb.collection(SUPERUSERS).create({
            email,
            password,
            passwordConfirm: passwordConfirm ?? password,
          }),
        ),
      ),
    ),
  );

  server.registerTool(
    "update_superuser",
    {
      title: "Update superuser",
      description:
        "Update a superuser account (e.g. change email or reset the password). " +
        "To change the password, include both 'password' and 'passwordConfirm' in `data`.",
      inputSchema: {
        id: z.string().describe("Superuser record id."),
        data: z.record(z.any()).describe("Fields to update (email, password, passwordConfirm, ...)."),
      },
    },
    handler(async ({ id, data }) =>
      withAuth(async (pb) => ok(await pb.collection(SUPERUSERS).update(id, data))),
    ),
  );

  server.registerTool(
    "delete_superuser",
    {
      title: "Delete superuser",
      description: "Delete a superuser (admin) account by id. At least one superuser must always remain.",
      inputSchema: {
        id: z.string().describe("Superuser record id to delete."),
      },
    },
    handler(async ({ id }) =>
      withAuth(async (pb) => {
        await pb.collection(SUPERUSERS).delete(id);
        return ok({ success: true, deleted: id });
      }),
    ),
  );
}
