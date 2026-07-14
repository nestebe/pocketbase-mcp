/**
 * End-to-end smoke test: spawns the compiled MCP server over stdio and exercises
 * the main tools against the live PocketBase instance (docker-test / :8090).
 *
 * Usage: node scripts/smoke-test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "..", "dist", "index.js");

const env = {
  ...process.env,
  POCKETBASE_URL: process.env.POCKETBASE_URL || "http://127.0.0.1:8090",
  POCKETBASE_ADMIN_EMAIL: process.env.POCKETBASE_ADMIN_EMAIL || "admin@yourdomain.com",
  POCKETBASE_ADMIN_PASSWORD: process.env.POCKETBASE_ADMIN_PASSWORD || "your-secure-password-here",
};

let pass = 0;
let fail = 0;
const results = [];

function log(name, okFlag, detail = "") {
  results.push({ name, ok: okFlag, detail });
  if (okFlag) pass++;
  else fail++;
  const tag = okFlag ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name}${detail ? " — " + detail : ""}`);
}

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.map((c) => c.text).join("\n") ?? "";
  if (res.isError) {
    throw new Error(`tool ${name} returned error: ${text}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return parsed;
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env,
    stderr: "inherit",
  });
  const client = new Client({ name: "smoke-test", version: "1.0.0" });
  await client.connect(transport);

  // 1. List tools
  const tools = await client.listTools();
  log("tools/list", tools.tools.length >= 30, `${tools.tools.length} tools registered`);
  console.log("   tools:", tools.tools.map((t) => t.name).join(", "));

  // 2. Health
  const health = await call(client, "health_check");
  log("health_check", health.code === 200, JSON.stringify(health));

  // 3. Auth info
  const info = await call(client, "auth_info");
  log("auth_info", info.isValid === true, `identity=${info.record?.email}`);

  // 4. Scaffolds
  const scaffolds = await call(client, "get_collection_scaffolds");
  log("get_collection_scaffolds", !!scaffolds.base && !!scaffolds.auth, `types: ${Object.keys(scaffolds).join(",")}`);

  const COL = "mcp_smoke_posts";

  // Clean up any leftover collection from a previous run
  try {
    await call(client, "delete_collection", { idOrName: COL });
  } catch {
    /* ignore if not present */
  }

  // 5. Create collection with a few fields
  const created = await call(client, "create_collection", {
    name: COL,
    type: "base",
    data: {
      fields: [
        { name: "title", type: "text", required: true, max: 200 },
        { name: "body", type: "editor" },
        { name: "views", type: "number" },
        { name: "published", type: "bool" },
        // In PocketBase 0.23+ these are NOT added automatically.
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      listRule: "",
      viewRule: "",
    },
  });
  log("create_collection", created.name === COL, `id=${created.id}`);

  // 6. Get collection
  const gotCol = await call(client, "get_collection", { idOrName: COL });
  log("get_collection", gotCol.name === COL, `${gotCol.fields?.length} fields`);

  // 7. List collections (filtered)
  const cols = await call(client, "list_collections", { filter: `name = "${COL}"` });
  log("list_collections", cols.totalItems >= 1, `found ${cols.totalItems}`);

  // 8. Create record
  const rec = await call(client, "create_record", {
    collection: COL,
    data: { title: "Hello MCP", body: "<p>content</p>", views: 5, published: true },
  });
  log("create_record", rec.title === "Hello MCP", `id=${rec.id}`);

  // 9. Get record
  const gotRec = await call(client, "get_record", { collection: COL, id: rec.id });
  log("get_record", gotRec.id === rec.id, `views=${gotRec.views}`);

  // 10. Update record
  const upd = await call(client, "update_record", { collection: COL, id: rec.id, data: { views: 42 } });
  log("update_record", upd.views === 42, `views=${upd.views}`);

  // 10b. Enable the Batch API (disabled by default) — exercises update_settings
  const setUpd = await call(client, "update_settings", {
    data: { batch: { enabled: true, maxRequests: 100, timeout: 3 } },
  });
  log("update_settings", setUpd?.batch?.enabled === true, "batch API enabled");

  // 11. Batch create
  const batchRes = await call(client, "batch", {
    operations: [
      { action: "create", collection: COL, data: { title: "Batch 1", published: false } },
      { action: "create", collection: COL, data: { title: "Batch 2", published: true } },
    ],
  });
  const batchOk = Array.isArray(batchRes) && batchRes.every((r) => r.status === 200);
  log("batch", batchOk, `${batchRes.length} ops, statuses=${batchRes.map((r) => r.status).join(",")}`);

  // 12. List records with filter + sort
  const list = await call(client, "list_records", { collection: COL, filter: "published = true", sort: "-created" });
  log("list_records", list.totalItems >= 1, `published=${list.totalItems}`);

  // 13. Full list
  const full = await call(client, "get_full_record_list", { collection: COL });
  log("get_full_record_list", full.length >= 3, `total=${full.length}`);

  // 14. Get first
  const first = await call(client, "get_first_record", { collection: COL, filter: 'title = "Batch 1"' });
  log("get_first_record", first.title === "Batch 1", `id=${first.id}`);

  // 15. Settings
  const settings = await call(client, "get_settings");
  log("get_settings", !!settings.meta, `appName=${settings.meta?.appName}`);

  // 16. Logs
  const logs = await call(client, "list_logs", { perPage: 5 });
  log("list_logs", typeof logs.totalItems === "number", `items=${logs.items?.length}`);

  // 17. Logs stats
  const stats = await call(client, "get_logs_stats");
  log("get_logs_stats", Array.isArray(stats), `buckets=${stats.length}`);

  // 18. Crons
  const crons = await call(client, "list_crons");
  log("list_crons", Array.isArray(crons), `jobs=${crons.map((c) => c.id).join(",")}`);

  // 19. Backups
  const backups = await call(client, "list_backups");
  log("list_backups", Array.isArray(backups), `count=${backups.length}`);

  // 20. Superusers
  const supers = await call(client, "list_superusers");
  log("list_superusers", supers.totalItems >= 1, `count=${supers.totalItems}`);

  // 21. Raw request
  const raw = await call(client, "send_raw_request", { path: "/api/health" });
  log("send_raw_request", raw.code === 200, "GET /api/health");

  // 22. Delete a record
  const del = await call(client, "delete_record", { collection: COL, id: rec.id });
  log("delete_record", del.success === true);

  // 23. Truncate
  const trunc = await call(client, "truncate_collection", { idOrName: COL });
  log("truncate_collection", trunc.success === true);

  // 24. Cleanup: delete collection
  const delCol = await call(client, "delete_collection", { idOrName: COL });
  log("delete_collection", delCol.success === true);

  await client.close();

  console.log("\n=========================================");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("=========================================");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("SMOKE TEST CRASHED:", err);
  process.exit(2);
});
