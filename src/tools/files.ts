import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { getConfig, withAuth } from "../pocketbase.js";
import { ok, handler } from "../util.js";

function buildFileUrl(
  baseUrl: string,
  collection: string,
  recordId: string,
  filename: string,
  opts: { thumb?: string; token?: string; download?: boolean },
): string {
  const url = new URL(
    `${baseUrl}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(
      filename,
    )}`,
  );
  if (opts.thumb) url.searchParams.set("thumb", opts.thumb);
  if (opts.token) url.searchParams.set("token", opts.token);
  if (opts.download) url.searchParams.set("download", "1");
  return url.toString();
}

export function registerFileTools(server: McpServer): void {
  server.registerTool(
    "get_file_url",
    {
      title: "Get file URL",
      description:
        "Build the public URL for a file stored in a record's file field. " +
        "For image files you may request a thumbnail via `thumb` (e.g. '100x100', '100x100t', '0x100'). " +
        "For protected files (collection with a non-public file field), set `protected` to true to embed " +
        "a short-lived access token.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        recordId: z.string().describe("Record id."),
        filename: z.string().describe("Stored file name (the value of the file field)."),
        thumb: z.string().optional().describe("Thumbnail size, e.g. '100x100', '0x100', '100x100t'."),
        download: z.boolean().optional().describe("Force a download (Content-Disposition attachment)."),
        protected: z.boolean().optional().describe("Embed a file access token for protected files."),
      },
    },
    handler(async ({ collection, recordId, filename, thumb, download, protected: isProtected }) => {
      const cfg = getConfig();
      let token: string | undefined;
      if (isProtected) token = await withAuth((pb) => pb.files.getToken());
      const url = buildFileUrl(cfg.url, collection, recordId, filename, { thumb, token, download });
      return ok({ url });
    }),
  );

  server.registerTool(
    "get_file_token",
    {
      title: "Get file access token",
      description:
        "Generate a short-lived file access token used to access protected files by appending it as a " +
        "`?token=...` query parameter to a file URL.",
      inputSchema: {},
    },
    handler(async () => ok({ token: await withAuth((pb) => pb.files.getToken()) })),
  );

  server.registerTool(
    "download_file",
    {
      title: "Download file",
      description:
        "Download a record file to a local path on the machine running this MCP server. " +
        "Handles protected files automatically by requesting an access token.",
      inputSchema: {
        collection: z.string().describe("Collection id or name."),
        recordId: z.string().describe("Record id."),
        filename: z.string().describe("Stored file name."),
        destPath: z.string().describe("Local filesystem path to write the downloaded file to."),
        thumb: z.string().optional().describe("Optional thumbnail size for images."),
        protected: z.boolean().optional().describe("Set true for protected files (embeds a token)."),
      },
    },
    handler(async ({ collection, recordId, filename, destPath, thumb, protected: isProtected }) => {
      const cfg = getConfig();
      let token: string | undefined;
      if (isProtected) token = await withAuth((pb) => pb.files.getToken());
      const url = buildFileUrl(cfg.url, collection, recordId, filename, { thumb, token });
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to download file: HTTP ${res.status} ${res.statusText}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(destPath, buf);
      return ok({ success: true, path: destPath, bytes: buf.length, contentType: res.headers.get("content-type") });
    }),
  );
}
