/** Shared helpers for building MCP tool results and handling PocketBase errors. */
import { ClientResponseError } from "pocketbase";

export interface ToolResult {
  // Index signature keeps the shape structurally compatible with the MCP SDK's
  // CallToolResult return type (which carries `[x: string]: unknown`).
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Build a successful tool result, JSON-encoding structured data. */
export function ok(data: unknown): ToolResult {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

/** Build an error tool result with a helpful, structured message. */
export function fail(error: unknown): ToolResult {
  let message: string;

  if (error instanceof ClientResponseError) {
    const details = {
      status: error.status,
      message: error.message,
      // PocketBase returns per-field validation errors under `data`.
      response: error.response,
    };
    message = `PocketBase error: ${JSON.stringify(details, null, 2)}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return { content: [{ type: "text", text: message }], isError: true };
}

/** Wrap an async tool handler with uniform error handling. */
export function handler<A extends Record<string, unknown>>(
  fn: (args: A) => Promise<ToolResult>,
): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

/**
 * Drop `undefined` values so we never send explicit `undefined` query params
 * to the PocketBase SDK (which would serialize them awkwardly).
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
