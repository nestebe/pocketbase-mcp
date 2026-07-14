# PocketBase MCP Server

A **complete** [Model Context Protocol](https://modelcontextprotocol.io) server for
[PocketBase](https://pocketbase.io). It exposes the full PocketBase management surface —
collections, records, authentication, files, logs, settings, backups and crons — as MCP
tools that an AI assistant (Claude Desktop, Claude Code, Cursor, etc.) can call directly.

Built and validated against **PocketBase v0.39.6** using the official
[`pocketbase` JS SDK](https://github.com/pocketbase/js-sdk).

---

## Features

**55 tools** across every part of the PocketBase API:

| Area | Tools |
| --- | --- |
| **Health & connection** | `health_check`, `auth_info` |
| **Collections (schema)** | `list_collections`, `get_collection`, `get_collection_scaffolds`, `create_collection`, `update_collection`, `delete_collection`, `import_collections`, `truncate_collection` |
| **Records (data)** | `list_records`, `get_full_record_list`, `get_record`, `get_first_record`, `create_record`, `update_record`, `delete_record`, `batch` |
| **Authentication** | `auth_with_password`, `list_auth_methods`, `impersonate`, `request_verification`, `confirm_verification`, `request_password_reset`, `confirm_password_reset`, `request_otp`, `auth_with_otp`, `confirm_email_change`, `list_external_auths`, `unlink_external_auth` |
| **Superusers (admins)** | `list_superusers`, `create_superuser`, `update_superuser`, `delete_superuser` |
| **Files** | `get_file_url`, `get_file_token`, `download_file` (+ uploads via `create_record`/`update_record`) |
| **Logs** | `list_logs`, `get_log`, `get_logs_stats` |
| **Settings** | `get_settings`, `update_settings`, `test_s3`, `test_email`, `generate_apple_client_secret` |
| **Backups** | `list_backups`, `create_backup`, `upload_backup`, `delete_backup`, `restore_backup`, `get_backup_download_url`, `download_backup` |
| **Crons** | `list_crons`, `run_cron` |
| **Escape hatch** | `send_raw_request` (call any endpoint, incl. custom hook routes) |

Highlights:

- **Auto-authentication** as a superuser from environment variables, with transparent
  re-auth when the token expires.
- **File uploads/downloads** to/from the local filesystem (multipart handled for you).
- **Transactional batch** operations (create/update/delete/upsert) in one request.
- **Non-destructive user auth** — authenticating as an end user never clobbers the MCP's
  own superuser session.
- **`send_raw_request`** guarantees completeness: anything the dedicated tools don't cover
  (custom routes, new API features) is still reachable.

---

## Configuration

The server reads its connection settings from environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `POCKETBASE_URL` | ✅ | Base URL, e.g. `http://localhost:8090`. Prefer `127.0.0.1` over `localhost` to avoid IPv6 resolution issues. |
| `POCKETBASE_ADMIN_EMAIL` | ✅* | Superuser email. |
| `POCKETBASE_ADMIN_PASSWORD` | ✅* | Superuser password. |
| `POCKETBASE_AUTH_COLLECTION` | – | Auth collection to log in against (default `_superusers`). |
| `POCKETBASE_TOKEN` | – | Use a pre-issued token instead of email/password. |

\* Required unless `POCKETBASE_TOKEN` is provided.

### MCP client config

Add the server to your MCP client (Claude Desktop `claude_desktop_config.json`,
Claude Code, Cursor, …):

```json
{
  "mcpServers": {
    "pocketbase": {
      "command": "node",
      "args": ["C:/Projets/Github/pocketbase-mcp/dist/index.js"],
      "env": {
        "POCKETBASE_URL": "",
        "POCKETBASE_ADMIN_EMAIL": "",
        "POCKETBASE_ADMIN_PASSWORD": ""
      }
    }
  }
}
```

Fill the three `env` values with your instance URL and superuser credentials. Once the
package is published to npm you can instead use `"command": "npx"` with
`"args": ["-y", "pocketbase-mcp"]`.

---

## Installation

```bash
# from source
git clone <this-repo>
cd pocketbase-mcp
npm install
npm run build      # compiles TypeScript to dist/
```

The entry point is `dist/index.js` (a stdio MCP server with a `#!/usr/bin/env node`
shebang, also exposed as the `pocketbase-mcp` bin).

---

## Local test instance (`docker-test/`)

A ready-to-run PocketBase is provided for development and validation:

```bash
docker compose -f docker-test/docker-compose.yml up -d
```

- Dashboard: <http://localhost:8090/_/>
- REST API: <http://localhost:8090/api/>
- Superuser (auto-created on first boot):
  - email: `admin@yourdomain.com`
  - password: `your-secure-password-here`

Stop / reset:

```bash
docker compose -f docker-test/docker-compose.yml down          # stop
docker compose -f docker-test/docker-compose.yml down -v       # stop + wipe data
```

> Settings encryption is intentionally **disabled** in this local setup. For production,
> enable it with a **32-character** key via `--encryptionEnv` (see the comments in
> `docker-test/docker-compose.yml`).

### Run the smoke tests

With the container running:

```bash
node scripts/smoke-test.mjs             # collections, records, batch, settings, logs, crons...
node scripts/smoke-test-files-auth.mjs  # users auth, file upload/download, impersonation, backups
```

Both spawn the compiled server over stdio and exercise the tools against the live instance.

---

## Usage notes & gotchas

- **PocketBase 0.23+ removed implicit `created`/`updated` fields.** New base collections
  have no timestamp columns unless you add them. To sort by creation date, add
  `autodate` fields when creating the collection:
  ```json
  { "name": "created", "type": "autodate", "onCreate": true },
  { "name": "updated", "type": "autodate", "onCreate": true, "onUpdate": true }
  ```
  Tip: call `get_collection_scaffolds` to get a template that already includes them.
- **Batch API is disabled by default.** The `batch` tool returns
  *"Batch requests are not allowed"* until you enable it:
  `update_settings { "data": { "batch": { "enabled": true } } }`.
- **Admins are now "superusers"** — a special `_superusers` auth collection. The
  `*_superuser` tools are convenience wrappers over record operations on it.
- **Email-dependent flows** (verification, password reset, OTP, test email) require SMTP
  to be configured in settings.
- **Filtering & sorting** use PocketBase's expression syntax, e.g.
  `filter: 'status = "active" && created > "2024-01-01"'`, `sort: '-created,title'`.
  Use `expand` to inline relations (e.g. `expand: 'author,comments_via_post'`).

---

## Development

```
src/
  index.ts          # stdio entry point + eager auth
  server.ts         # builds the McpServer and registers every tool group
  config.ts         # env parsing
  pocketbase.ts     # SDK client singleton, auth, withAuth() retry helper
  util.ts           # tool result / error helpers
  formdata.ts       # multipart body builder for file uploads
  tools/
    health.ts collections.ts records.ts auth.ts superusers.ts
    files.ts logs.ts settings.ts backups.ts crons.ts raw.ts
```

```bash
npm run build     # tsc -> dist/
npm run watch     # tsc --watch
npm run dev       # run from TS via tsx (no build step)
```

## License

MIT
