import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth } from "../pocketbase.js";
import { ok, handler } from "../util.js";

export function registerSettingsTools(server: McpServer): void {
  server.registerTool(
    "get_settings",
    {
      title: "Get settings",
      description:
        "Fetch all instance settings (app name/url, SMTP, S3 storage, S3 backups, batch API, rate limits, " +
        "trusted proxy, OAuth2 secrets are redacted). Superuser only.",
      inputSchema: {},
    },
    handler(async () => withAuth(async (pb) => ok(await pb.settings.getAll()))),
  );

  server.registerTool(
    "update_settings",
    {
      title: "Update settings",
      description:
        "Bulk update instance settings. Provide only the sections you want to change in `data`. " +
        "Examples: { \"meta\": { \"appName\": \"My App\", \"appURL\": \"https://example.com\" } }, " +
        "{ \"smtp\": { \"enabled\": true, \"host\": \"smtp.example.com\", \"port\": 587, \"username\": \"...\", \"password\": \"...\" } }, " +
        "{ \"batch\": { \"enabled\": true, \"maxRequests\": 50 } }. Superuser only.",
      inputSchema: {
        data: z.record(z.any()).describe("Partial settings object with the sections to update."),
      },
    },
    handler(async ({ data }) => withAuth(async (pb) => ok(await pb.settings.update(data)))),
  );

  server.registerTool(
    "test_s3",
    {
      title: "Test S3 connection",
      description: "Perform an S3 filesystem connection test for either 'storage' or 'backups'. Superuser only.",
      inputSchema: {
        filesystem: z.enum(["storage", "backups"]).optional().describe("Which S3 filesystem to test (default 'storage')."),
      },
    },
    handler(async ({ filesystem }) =>
      withAuth(async (pb) => {
        await pb.settings.testS3(filesystem ?? "storage");
        return ok({ success: true, filesystem: filesystem ?? "storage" });
      }),
    ),
  );

  server.registerTool(
    "test_email",
    {
      title: "Send a test email",
      description:
        "Send a test email to verify SMTP configuration. Choose a template: 'verification', 'password-reset' " +
        "or 'email-change'. Superuser only. Requires SMTP to be configured.",
      inputSchema: {
        toEmail: z.string().describe("Recipient email address."),
        template: z
          .enum(["verification", "password-reset", "email-change"])
          .optional()
          .describe("Email template to test (default 'verification')."),
        collection: z.string().optional().describe("Auth collection to use for the template (default 'users')."),
      },
    },
    handler(async ({ toEmail, template, collection }) =>
      withAuth(async (pb) => {
        await pb.settings.testEmail(collection ?? "users", toEmail, template ?? "verification");
        return ok({ success: true, sentTo: toEmail, template: template ?? "verification" });
      }),
    ),
  );

  server.registerTool(
    "generate_apple_client_secret",
    {
      title: "Generate Apple client secret",
      description: "Generate a new Apple OAuth2 client secret (JWT) from your Apple developer credentials. Superuser only.",
      inputSchema: {
        clientId: z.string().describe("Apple Services ID (client id)."),
        teamId: z.string().describe("Apple Developer Team ID."),
        keyId: z.string().describe("Apple private key id."),
        privateKey: z.string().describe("Apple private key contents (PEM)."),
        duration: z.number().int().positive().describe("Secret validity duration in seconds (max ~15777000)."),
      },
    },
    handler(async ({ clientId, teamId, keyId, privateKey, duration }) =>
      withAuth(async (pb) =>
        ok(await pb.settings.generateAppleClientSecret(clientId, teamId, keyId, privateKey, duration)),
      ),
    ),
  );
}
