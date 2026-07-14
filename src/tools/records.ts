import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";
import { buildRecordBody } from "../formdata.js";

const fileUploadSchema = z
  .array(
    z.object({
      field: z.string().describe("Record field name that stores the file."),
      path: z.string().describe("Local filesystem path of the file to upload."),
    }),
  )
  .optional()
  .describe("Optional list of local files to upload into file fields.");

export function registerRecordTools(server: McpServer): void {
  server.registerTool(
    "list_records",
    {
      title: "List records",
      description:
        "List records of a collection with pagination, filtering, sorting and relation expansion. " +
        "Filter supports operators like =, !=, >, <, ~ (contains), and functions. " +
        "Example filter: 'status = \"active\" && created > \"2024-01-01\"'. " +
        "Use `expand` to inline related records (e.g. 'author,comments_via_post'). " +
        "Set `skipTotal` to true for faster queries when you don't need the total count.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        page: z.number().int().positive().optional().describe("Page number (default 1)."),
        perPage: z.number().int().positive().max(500).optional().describe("Items per page (default 30)."),
        filter: z.string().optional().describe("PocketBase filter expression."),
        sort: z.string().optional().describe("Sort expression, e.g. '-created,title'."),
        expand: z.string().optional().describe("Comma-separated relations to expand."),
        fields: z.string().optional().describe("Comma-separated fields to return (supports :excerpt modifiers)."),
        skipTotal: z.boolean().optional().describe("Skip counting total items for performance."),
      },
    },
    handler(async ({ collection, page, perPage, filter, sort, expand, fields, skipTotal }) =>
      withAuth(async (pb) =>
        ok(
          await pb
            .collection(collection)
            .getList(page ?? 1, perPage ?? 30, compact({ filter, sort, expand, fields, skipTotal })),
        ),
      ),
    ),
  );

  server.registerTool(
    "get_full_record_list",
    {
      title: "Get full record list",
      description:
        "Fetch ALL records matching a filter, auto-paginating in batches. Use for exports or small/medium " +
        "collections. Prefer list_records with pagination for large datasets to avoid huge responses.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        filter: z.string().optional().describe("PocketBase filter expression."),
        sort: z.string().optional().describe("Sort expression."),
        expand: z.string().optional().describe("Comma-separated relations to expand."),
        fields: z.string().optional().describe("Comma-separated fields to return."),
        batch: z.number().int().positive().max(1000).optional().describe("Records per underlying request (default 200)."),
      },
    },
    handler(async ({ collection, filter, sort, expand, fields, batch }) =>
      withAuth(async (pb) =>
        ok(
          await pb
            .collection(collection)
            .getFullList(compact({ filter, sort, expand, fields, batch: batch ?? 200 })),
        ),
      ),
    ),
  );

  server.registerTool(
    "get_record",
    {
      title: "Get record",
      description: "Fetch a single record by id, optionally expanding relations and selecting specific fields.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        id: z.string().describe("Record id."),
        expand: z.string().optional().describe("Comma-separated relations to expand."),
        fields: z.string().optional().describe("Comma-separated fields to return."),
      },
    },
    handler(async ({ collection, id, expand, fields }) =>
      withAuth(async (pb) => ok(await pb.collection(collection).getOne(id, compact({ expand, fields })))),
    ),
  );

  server.registerTool(
    "get_first_record",
    {
      title: "Get first matching record",
      description:
        "Return the first record matching a filter expression (throws if none found). " +
        "Convenient for lookups like 'email = \"a@b.com\"'.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        filter: z.string().describe("PocketBase filter expression to match."),
        expand: z.string().optional().describe("Comma-separated relations to expand."),
        fields: z.string().optional().describe("Comma-separated fields to return."),
      },
    },
    handler(async ({ collection, filter, expand, fields }) =>
      withAuth(async (pb) =>
        ok(await pb.collection(collection).getFirstListItem(filter, compact({ expand, fields }))),
      ),
    ),
  );

  server.registerTool(
    "create_record",
    {
      title: "Create record",
      description:
        "Create a new record in a collection. Pass field values in `data`. " +
        "For auth collections, include 'password' and 'passwordConfirm' (and usually 'email'). " +
        "To upload files, list them in `files` (each maps a field name to a local file path). " +
        "Relation fields accept a record id or an array of ids.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        data: z.record(z.any()).optional().describe("Field values for the new record."),
        files: fileUploadSchema,
        expand: z.string().optional().describe("Comma-separated relations to expand in the response."),
        fields: z.string().optional().describe("Comma-separated fields to return."),
      },
    },
    handler(async ({ collection, data, files, expand, fields }) =>
      withAuth(async (pb) => {
        const body = await buildRecordBody(data, files);
        return ok(await pb.collection(collection).create(body as any, compact({ expand, fields })));
      }),
    ),
  );

  server.registerTool(
    "update_record",
    {
      title: "Update record",
      description:
        "Update an existing record by id. Only the fields present in `data` are changed. " +
        "To append to a multi-relation/file/select field use the '+' modifier as a key " +
        "(e.g. { \"tags+\": \"id\" }); to remove use 'field-'. Upload files via `files`.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        id: z.string().describe("Record id to update."),
        data: z.record(z.any()).optional().describe("Field values to update."),
        files: fileUploadSchema,
        expand: z.string().optional().describe("Comma-separated relations to expand in the response."),
        fields: z.string().optional().describe("Comma-separated fields to return."),
      },
    },
    handler(async ({ collection, id, data, files, expand, fields }) =>
      withAuth(async (pb) => {
        const body = await buildRecordBody(data, files);
        return ok(await pb.collection(collection).update(id, body as any, compact({ expand, fields })));
      }),
    ),
  );

  server.registerTool(
    "delete_record",
    {
      title: "Delete record",
      description: "Permanently delete a single record by id. Cannot be undone.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        id: z.string().describe("Record id to delete."),
      },
    },
    handler(async ({ collection, id }) =>
      withAuth(async (pb) => {
        await pb.collection(collection).delete(id);
        return ok({ success: true, deleted: id, collection });
      }),
    ),
  );

  server.registerTool(
    "batch",
    {
      title: "Batch operations (transactional)",
      description:
        "Execute multiple record operations in a single transactional request. All operations succeed " +
        "or all are rolled back. Each operation has an `action` ('create' | 'update' | 'delete' | 'upsert'), " +
        "a target `collection`, and depending on the action a `data` object and/or record `id`. " +
        "For 'upsert', include the record 'id' inside `data` (creates if missing, updates if present). " +
        "Note: the Batch API must be enabled in PocketBase settings (Settings > Batch API).",
      inputSchema: {
        operations: z
          .array(
            z.object({
              action: z.enum(["create", "update", "delete", "upsert"]),
              collection: z.string().describe("Collection id or name."),
              id: z.string().optional().describe("Record id (required for update/delete)."),
              data: z.record(z.any()).optional().describe("Record data (for create/update/upsert)."),
            }),
          )
          .min(1)
          .describe("List of operations to run atomically."),
      },
    },
    handler(async ({ operations }) =>
      withAuth(async (pb) => {
        const batch = pb.createBatch();
        for (const op of operations) {
          const sub = batch.collection(op.collection);
          switch (op.action) {
            case "create":
              sub.create(op.data ?? {});
              break;
            case "update":
              if (!op.id) throw new Error("update operation requires 'id'");
              sub.update(op.id, op.data ?? {});
              break;
            case "delete":
              if (!op.id) throw new Error("delete operation requires 'id'");
              sub.delete(op.id);
              break;
            case "upsert":
              sub.upsert(op.data ?? {});
              break;
          }
        }
        return ok(await batch.send());
      }),
    ),
  );
}
