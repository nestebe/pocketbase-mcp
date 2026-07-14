import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withAuth, freshClient } from "../pocketbase.js";
import { ok, handler, compact } from "../util.js";

/**
 * Auth-collection tools. Operations that authenticate as an end user run on a
 * throwaway client so the superuser session used by the rest of the MCP stays intact.
 */
export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "auth_with_password",
    {
      title: "Authenticate a user (password)",
      description:
        "Authenticate an end user against an auth collection with their identity (email/username) and " +
        "password. Returns the auth token and the user record. Does not affect the MCP's own superuser " +
        "session. Useful to obtain a token to act on behalf of a user or to verify credentials.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        identity: z.string().describe("Email or username."),
        password: z.string().describe("User password."),
        expand: z.string().optional().describe("Comma-separated relations to expand on the record."),
      },
    },
    handler(async ({ collection, identity, password, expand }) => {
      const pb = freshClient();
      const res = await pb
        .collection(collection ?? "users")
        .authWithPassword(identity, password, compact({ expand }));
      return ok(res);
    }),
  );

  server.registerTool(
    "list_auth_methods",
    {
      title: "List auth methods",
      description:
        "List the available authentication methods for an auth collection: whether password/OTP auth is " +
        "enabled and the configured OAuth2 providers (Google, GitHub, etc.).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
      },
    },
    handler(async ({ collection }) => {
      const pb = freshClient();
      return ok(await pb.collection(collection ?? "users").listAuthMethods());
    }),
  );

  server.registerTool(
    "impersonate",
    {
      title: "Impersonate a user",
      description:
        "Generate an auth token for an existing user without their password (superuser only). Returns a " +
        "non-refreshable token valid for the given duration, useful to make API calls on behalf of a user.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        recordId: z.string().describe("Id of the user record to impersonate."),
        duration: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Token lifetime in seconds (default: collection auth token duration)."),
      },
    },
    handler(async ({ collection, recordId, duration }) =>
      withAuth(async (pb) => {
        const impersonated = await pb
          .collection(collection ?? "users")
          .impersonate(recordId, duration ?? 0);
        return ok({ token: impersonated.authStore.token, record: impersonated.authStore.record });
      }),
    ),
  );

  server.registerTool(
    "request_verification",
    {
      title: "Request email verification",
      description: "Send a verification email to a user of an auth collection (requires SMTP configured).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        email: z.string().describe("User email address."),
      },
    },
    handler(async ({ collection, email }) => {
      const pb = freshClient();
      await pb.collection(collection ?? "users").requestVerification(email);
      return ok({ success: true, message: `Verification email requested for ${email}` });
    }),
  );

  server.registerTool(
    "confirm_verification",
    {
      title: "Confirm email verification",
      description: "Confirm a user's email verification using the token from the verification email.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        token: z.string().describe("Verification token."),
      },
    },
    handler(async ({ collection, token }) => {
      const pb = freshClient();
      await pb.collection(collection ?? "users").confirmVerification(token);
      return ok({ success: true });
    }),
  );

  server.registerTool(
    "request_password_reset",
    {
      title: "Request password reset",
      description: "Send a password reset email to a user (requires SMTP configured).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        email: z.string().describe("User email address."),
      },
    },
    handler(async ({ collection, email }) => {
      const pb = freshClient();
      await pb.collection(collection ?? "users").requestPasswordReset(email);
      return ok({ success: true, message: `Password reset email requested for ${email}` });
    }),
  );

  server.registerTool(
    "confirm_password_reset",
    {
      title: "Confirm password reset",
      description: "Set a new password using the reset token from the password reset email.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        token: z.string().describe("Password reset token."),
        password: z.string().describe("New password."),
        passwordConfirm: z.string().describe("New password confirmation (must match)."),
      },
    },
    handler(async ({ collection, token, password, passwordConfirm }) => {
      const pb = freshClient();
      await pb.collection(collection ?? "users").confirmPasswordReset(token, password, passwordConfirm);
      return ok({ success: true });
    }),
  );

  server.registerTool(
    "request_otp",
    {
      title: "Request OTP (one-time password)",
      description:
        "Send a one-time password email to a user and return the otpId needed to complete auth_with_otp " +
        "(requires SMTP and OTP auth enabled on the collection).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        email: z.string().describe("User email address."),
      },
    },
    handler(async ({ collection, email }) => {
      const pb = freshClient();
      const res = await pb.collection(collection ?? "users").requestOTP(email);
      return ok(res);
    }),
  );

  server.registerTool(
    "auth_with_otp",
    {
      title: "Authenticate with OTP",
      description: "Complete OTP authentication using the otpId (from request_otp) and the code the user received.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        otpId: z.string().describe("The otpId returned by request_otp."),
        code: z.string().describe("The one-time code received by the user."),
      },
    },
    handler(async ({ collection, otpId, code }) => {
      const pb = freshClient();
      return ok(await pb.collection(collection ?? "users").authWithOTP(otpId, code));
    }),
  );

  server.registerTool(
    "confirm_email_change",
    {
      title: "Confirm email change",
      description: "Confirm a user's email change using the token from the confirmation email and the user's password.",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        token: z.string().describe("Email change token."),
        password: z.string().describe("The user's current password."),
      },
    },
    handler(async ({ collection, token, password }) => {
      const pb = freshClient();
      await pb.collection(collection ?? "users").confirmEmailChange(token, password);
      return ok({ success: true });
    }),
  );

  server.registerTool(
    "list_external_auths",
    {
      title: "List external auth providers",
      description: "List the OAuth2 providers linked to a specific user record (superuser only).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        recordId: z.string().describe("User record id."),
      },
    },
    handler(async ({ collection, recordId }) =>
      withAuth(async (pb) => ok(await pb.collection(collection ?? "users").listExternalAuths(recordId))),
    ),
  );

  server.registerTool(
    "unlink_external_auth",
    {
      title: "Unlink external auth provider",
      description: "Remove a linked OAuth2 provider from a user record (superuser only).",
      inputSchema: {
        collection: z.string().optional().describe("Auth collection (default 'users')."),
        recordId: z.string().describe("User record id."),
        provider: z.string().describe("Provider name (e.g. 'google', 'github')."),
      },
    },
    handler(async ({ collection, recordId, provider }) =>
      withAuth(async (pb) => {
        await pb.collection(collection ?? "users").unlinkExternalAuth(recordId, provider);
        return ok({ success: true, recordId, provider });
      }),
    ),
  );
}
