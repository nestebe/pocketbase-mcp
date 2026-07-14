/** Helpers to build request bodies, including multipart bodies with file uploads. */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface FileUpload {
  /** Target record field name (e.g. "avatar", "documents"). */
  field: string;
  /** Absolute or relative path to the local file to upload. */
  path: string;
}

function toFormValue(v: unknown): string {
  if (v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Build a record body. When `files` are provided, returns a FormData object
 * suitable for multipart upload; otherwise returns the plain data object.
 */
export async function buildRecordBody(
  data: Record<string, unknown> | undefined,
  files: FileUpload[] | undefined,
): Promise<Record<string, unknown> | FormData> {
  if (!files || files.length === 0) return data ?? {};

  const form = new FormData();
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, toFormValue(item));
    } else {
      form.append(key, toFormValue(value));
    }
  }

  for (const f of files) {
    const buf = await readFile(f.path);
    // Uint8Array copy keeps the Blob independent of the underlying Buffer.
    const blob = new Blob([new Uint8Array(buf)]);
    form.append(f.field, blob, basename(f.path));
  }

  return form;
}
