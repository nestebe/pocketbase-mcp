import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
// `File` is only a global from Node 20+; importing from node:buffer keeps the
// server working on Node 18.13+ (see package.json "engines").
import { File } from "node:buffer";
import { withAuth } from "../pocketbase.js";
import { ok, handler } from "../util.js";

export function registerBackupTools(server: McpServer): void {
  server.registerTool(
    "list_backups",
    {
      title: "List backups",
      description: "List all available backup files (key, size, modified date). Superuser only.",
      inputSchema: {},
    },
    handler(async () => withAuth(async (pb) => ok(await pb.backups.getFullList()))),
  );

  server.registerTool(
    "create_backup",
    {
      title: "Create backup",
      description:
        "Create a new backup (zip snapshot of the database and storage). If `basename` is omitted, " +
        "PocketBase auto-generates a timestamped name. Returns the backup name. Superuser only.",
      inputSchema: {
        basename: z
          .string()
          .optional()
          .describe("Optional backup file name, e.g. 'pb_backup_2024.zip' (auto-generated if omitted)."),
      },
    },
    handler(async ({ basename: name }) =>
      withAuth(async (pb) => {
        await pb.backups.create(name ?? "");
        return ok({ success: true, basename: name ?? "(auto-generated)" });
      }),
    ),
  );

  server.registerTool(
    "upload_backup",
    {
      title: "Upload backup",
      description: "Upload an existing local backup zip file into the instance's backups. Superuser only.",
      inputSchema: {
        path: z.string().describe("Local filesystem path to the backup .zip file to upload."),
      },
    },
    handler(async ({ path }) =>
      withAuth(async (pb) => {
        const buf = await readFile(path);
        const file = new File([new Uint8Array(buf)], basename(path), { type: "application/zip" });
        await pb.backups.upload({ file });
        return ok({ success: true, uploaded: basename(path), bytes: buf.length });
      }),
    ),
  );

  server.registerTool(
    "delete_backup",
    {
      title: "Delete backup",
      description: "Delete a single backup file by its key/name. Cannot be undone. Superuser only.",
      inputSchema: {
        key: z.string().describe("Backup file key/name (as returned by list_backups)."),
      },
    },
    handler(async ({ key }) =>
      withAuth(async (pb) => {
        await pb.backups.delete(key);
        return ok({ success: true, deleted: key });
      }),
    ),
  );

  server.registerTool(
    "restore_backup",
    {
      title: "Restore backup",
      description:
        "Restore the instance from an existing backup file. THIS OVERWRITES ALL CURRENT DATA and restarts " +
        "the application. Use with extreme caution. Superuser only.",
      inputSchema: {
        key: z.string().describe("Backup file key/name to restore from."),
      },
    },
    handler(async ({ key }) =>
      withAuth(async (pb) => {
        await pb.backups.restore(key);
        return ok({ success: true, restoredFrom: key });
      }),
    ),
  );

  server.registerTool(
    "get_backup_download_url",
    {
      title: "Get backup download URL",
      description: "Build a download URL for a backup file using a fresh superuser file token. Superuser only.",
      inputSchema: {
        key: z.string().describe("Backup file key/name."),
      },
    },
    handler(async ({ key }) =>
      withAuth(async (pb) => {
        const token = await pb.files.getToken();
        return ok({ url: pb.backups.getDownloadURL(token, key) });
      }),
    ),
  );

  server.registerTool(
    "download_backup",
    {
      title: "Download backup",
      description: "Download a backup file to a local path on the machine running this MCP server. Superuser only.",
      inputSchema: {
        key: z.string().describe("Backup file key/name to download."),
        destPath: z.string().describe("Local filesystem path to write the .zip to."),
      },
    },
    handler(async ({ key, destPath }) =>
      withAuth(async (pb) => {
        const token = await pb.files.getToken();
        const url = pb.backups.getDownloadURL(token, key);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download backup: HTTP ${res.status} ${res.statusText}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(destPath, buf);
        return ok({ success: true, path: destPath, bytes: buf.length });
      }),
    ),
  );
}
