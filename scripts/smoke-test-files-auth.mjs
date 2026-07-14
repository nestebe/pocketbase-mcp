/**
 * Second smoke test: auth-collection users, file upload/download, impersonation,
 * and backups — the trickier paths not fully covered by scripts/smoke-test.mjs.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(__dirname, "..", "dist", "index.js");

const env = {
  ...process.env,
  POCKETBASE_URL: process.env.POCKETBASE_URL || "http://127.0.0.1:8090",
  POCKETBASE_ADMIN_EMAIL: process.env.POCKETBASE_ADMIN_EMAIL || "admin@yourdomain.com",
  POCKETBASE_ADMIN_PASSWORD: process.env.POCKETBASE_ADMIN_PASSWORD || "your-secure-password-here",
};

let pass = 0, fail = 0;
function log(name, okFlag, detail = "") {
  if (okFlag) pass++; else fail++;
  console.log(`[${okFlag ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}
async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.map((c) => c.text).join("\n") ?? "";
  if (res.isError) throw new Error(`tool ${name} error: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env, stderr: "inherit" });
  const client = new Client({ name: "smoke-test-2", version: "1.0.0" });
  await client.connect(transport);

  // ---- Prep: local file to upload ----
  const srcPath = join(tmpdir(), "mcp_pb_upload.txt");
  const content = "PocketBase MCP file upload test " + "x".repeat(64);
  writeFileSync(srcPath, content, "utf8");

  // ================= AUTH (users) =================
  const userEmail = `mcp_smoke_user@example.com`;
  const userPass = "Password12345";

  // cleanup leftover user
  try {
    const existing = await call(client, "get_first_record", { collection: "users", filter: `email = "${userEmail}"` });
    if (existing?.id) await call(client, "delete_record", { collection: "users", id: existing.id });
  } catch { /* none */ }

  const user = await call(client, "create_record", {
    collection: "users",
    data: { email: userEmail, password: userPass, passwordConfirm: userPass, name: "Smoke User", emailVisibility: true },
  });
  log("create_record(user)", user.email === userEmail, `id=${user.id}`);

  const methods = await call(client, "list_auth_methods", { collection: "users" });
  log("list_auth_methods", typeof methods.password === "object", `password.enabled=${methods.password?.enabled}`);

  const authed = await call(client, "auth_with_password", { collection: "users", identity: userEmail, password: userPass });
  log("auth_with_password", !!authed.token && authed.record?.id === user.id, `token len=${authed.token?.length}`);

  const imp = await call(client, "impersonate", { collection: "users", recordId: user.id });
  log("impersonate", !!imp.token && imp.record?.id === user.id, `token len=${imp.token?.length}`);

  // ================= FILES =================
  const FCOL = "mcp_smoke_files";
  try { await call(client, "delete_collection", { idOrName: FCOL }); } catch { /* none */ }

  await call(client, "create_collection", {
    name: FCOL,
    type: "base",
    data: {
      fields: [
        { name: "label", type: "text" },
        { name: "document", type: "file", maxSelect: 1, maxSize: 5242880 },
      ],
      listRule: "", viewRule: "",
    },
  });

  const fileRec = await call(client, "create_record", {
    collection: FCOL,
    data: { label: "doc1" },
    files: [{ field: "document", path: srcPath }],
  });
  const storedName = fileRec.document;
  log("create_record(file upload)", typeof storedName === "string" && storedName.length > 0, `stored=${storedName}`);

  const urlRes = await call(client, "get_file_url", { collection: FCOL, recordId: fileRec.id, filename: storedName });
  log("get_file_url", typeof urlRes.url === "string" && urlRes.url.includes(storedName), urlRes.url);

  const tokenRes = await call(client, "get_file_token");
  log("get_file_token", typeof tokenRes.token === "string" && tokenRes.token.length > 10, `len=${tokenRes.token?.length}`);

  const dlPath = join(tmpdir(), "mcp_pb_download.txt");
  if (existsSync(dlPath)) rmSync(dlPath);
  const dl = await call(client, "download_file", { collection: FCOL, recordId: fileRec.id, filename: storedName, destPath: dlPath });
  const roundTrip = existsSync(dlPath) && readFileSync(dlPath, "utf8") === content;
  log("download_file", dl.success === true && roundTrip, `bytes=${dl.bytes}, roundTrip=${roundTrip}`);

  // ================= BACKUPS =================
  const backupName = "mcp_smoke_backup.zip";
  try { await call(client, "delete_backup", { key: backupName }); } catch { /* none */ }

  await call(client, "create_backup", { basename: backupName });
  const backups = await call(client, "list_backups");
  const found = Array.isArray(backups) && backups.some((b) => b.key === backupName);
  log("create_backup + list_backups", found, `count=${backups.length}`);

  const burl = await call(client, "get_backup_download_url", { key: backupName });
  log("get_backup_download_url", typeof burl.url === "string" && burl.url.includes(backupName), "url built");

  const bdlPath = join(tmpdir(), "mcp_pb_backup.zip");
  if (existsSync(bdlPath)) rmSync(bdlPath);
  const bdl = await call(client, "download_backup", { key: backupName, destPath: bdlPath });
  const zipOk = existsSync(bdlPath) && readFileSync(bdlPath).slice(0, 2).toString("latin1") === "PK";
  log("download_backup", bdl.success === true && zipOk, `bytes=${bdl.bytes}, isZip=${zipOk}`);

  const bdel = await call(client, "delete_backup", { key: backupName });
  log("delete_backup", bdel.success === true);

  // ================= CLEANUP =================
  await call(client, "delete_record", { collection: "users", id: user.id });
  await call(client, "delete_collection", { idOrName: FCOL });
  for (const p of [srcPath, dlPath, bdlPath]) if (existsSync(p)) rmSync(p);
  log("cleanup", true);

  await client.close();
  console.log("\n=========================================");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("=========================================");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => { console.error("SMOKE TEST 2 CRASHED:", err); process.exit(2); });
