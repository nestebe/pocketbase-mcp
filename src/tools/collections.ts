import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";

export function registerCollectionTools(server: McpServer): void {
  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description:
        "List collections (database tables / schemas) with pagination, filtering and sorting. " +
        "Includes system collections such as _superusers, _authOrigins, etc. " +
        "Filter example: 'type = \"auth\"'. Sort example: '-created'.",
      inputSchema: {
        page: z.number().int().positive().optional().describe("Page number (default 1)."),
        perPage: z.number().int().positive().max(500).optional().describe("Items per page (default 100)."),
        filter: z.string().optional().describe("PocketBase filter expression, e.g. 'type = \"base\"'."),
        sort: z.string().optional().describe("Sort expression, e.g. '-created,name'."),
        fields: z.string().optional().describe("Comma-separated list of fields to return."),
      },
    },
    handler(async ({ page, perPage, filter, sort, fields }) =>
      withAuth(async (pb) =>
        ok(
          await pb.collections.getList(page ?? 1, perPage ?? 100, compact({ filter, sort, fields })),
        ),
      ),
    ),
  );

  server.registerTool(
    "get_collection",
    {
      title: "Get collection",
      description: "Fetch a single collection by its id or name, including its full field schema, rules and indexes.",
      inputSchema: {
        idOrName: z.string().describe("Collection id or name."),
        fields: z.string().optional().describe("Comma-separated list of fields to return."),
      },
    },
    handler(async ({ idOrName, fields }) =>
      withAuth(async (pb) => ok(await pb.collections.getOne(idOrName, compact({ fields })))),
    ),
  );

  server.registerTool(
    "get_collection_scaffolds",
    {
      title: "Get collection scaffolds",
      description:
        "Return default collection templates (scaffolds) for each collection type (base, auth, view). " +
        "Useful as a starting point before calling create_collection — copy a scaffold, adjust the " +
        "name and fields, then create it.",
      inputSchema: {},
    },
    handler(async () => withAuth(async (pb) => ok(await pb.collections.getScaffolds()))),
  );

  server.registerTool(
    "create_collection",
    {
      title: "Create collection",
      description:
        "Create a new collection. Provide `name` and `type` ('base', 'auth' or 'view'). " +
        "Use `data` for the rest of the collection payload: `fields` (array of field definitions), " +
        "API rules (listRule, viewRule, createRule, updateRule, deleteRule — string or null), " +
        "`indexes` (array of CREATE INDEX statements), `viewQuery` (for view collections), and " +
        "auth options for auth collections. Tip: call get_collection_scaffolds first to see the expected shape. " +
        "Example field: { \"name\": \"title\", \"type\": \"text\", \"required\": true }. " +
        "IMPORTANT (PocketBase 0.23+): 'created'/'updated' timestamps are NOT added automatically — " +
        "add them explicitly as autodate fields if you need them, e.g. " +
        "{ \"name\": \"created\", \"type\": \"autodate\", \"onCreate\": true } and " +
        "{ \"name\": \"updated\", \"type\": \"autodate\", \"onCreate\": true, \"onUpdate\": true }.",
      inputSchema: {
        name: z.string().describe("Collection name."),
        type: z.enum(["base", "auth", "view"]).optional().describe("Collection type (default 'base')."),
        data: z
          .record(z.any())
          .optional()
          .describe("Rest of the collection payload (fields, rules, indexes, viewQuery, auth options...)."),
      },
    },
    handler(async ({ name, type, data }) =>
      withAuth(async (pb) => {
        const body = { name, type: type ?? "base", ...(data ?? {}) };
        return ok(await pb.collections.create(body));
      }),
    ),
  );

  server.registerTool(
    "update_collection",
    {
      title: "Update collection",
      description:
        "Update an existing collection by id or name. Provide the fields to change in `data`. " +
        "To modify the schema, pass the full `fields` array (existing field ids must be preserved to keep data). " +
        "You can also update rules, indexes and options.",
      inputSchema: {
        idOrName: z.string().describe("Collection id or name."),
        data: z.record(z.any()).describe("Partial collection payload with the properties to update."),
      },
    },
    handler(async ({ idOrName, data }) =>
      withAuth(async (pb) => ok(await pb.collections.update(idOrName, data))),
    ),
  );

  server.registerTool(
    "delete_collection",
    {
      title: "Delete collection",
      description: "Permanently delete a collection and ALL of its records. This cannot be undone.",
      inputSchema: {
        idOrName: z.string().describe("Collection id or name to delete."),
      },
    },
    handler(async ({ idOrName }) =>
      withAuth(async (pb) => {
        await pb.collections.delete(idOrName);
        return ok({ success: true, deleted: idOrName });
      }),
    ),
  );

  server.registerTool(
    "import_collections",
    {
      title: "Import collections",
      description:
        "Bulk import collections from an array of collection definitions (as exported from the PocketBase " +
        "admin UI). When `deleteMissing` is true, collections not present in the import list are deleted — " +
        "use with caution. This is the recommended way to apply a full schema in one call.",
      inputSchema: {
        collections: z.array(z.record(z.any())).describe("Array of collection definition objects."),
        deleteMissing: z
          .boolean()
          .optional()
          .describe("If true, delete collections not present in the list (default false)."),
      },
    },
    handler(async ({ collections, deleteMissing }) =>
      withAuth(async (pb) => {
        await pb.collections.import(collections as any[], deleteMissing ?? false);
        return ok({ success: true, imported: collections.length, deleteMissing: deleteMissing ?? false });
      }),
    ),
  );

  server.registerTool(
    "truncate_collection",
    {
      title: "Truncate collection",
      description: "Delete ALL records of a collection while keeping the collection/schema itself. Cannot be undone.",
      inputSchema: {
        idOrName: z.string().describe("Collection id or name to truncate."),
      },
    },
    handler(async ({ idOrName }) =>
      withAuth(async (pb) => {
        await pb.collections.truncate(idOrName);
        return ok({ success: true, truncated: idOrName });
      }),
    ),
  );
}
