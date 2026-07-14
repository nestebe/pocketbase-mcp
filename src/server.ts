import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHealthTools } from "./tools/health.js";
import { registerCollectionTools } from "./tools/collections.js";
import { registerRecordTools } from "./tools/records.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerSuperuserTools } from "./tools/superusers.js";
import { registerFileTools } from "./tools/files.js";
import { registerLogTools } from "./tools/logs.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerBackupTools } from "./tools/backups.js";
import { registerCronTools } from "./tools/crons.js";
import { registerRawTools } from "./tools/raw.js";

export const SERVER_NAME = "pocketbase-mcp";
export const SERVER_VERSION = "1.0.0";

/** Build a fully configured MCP server with every PocketBase tool registered. */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerHealthTools(server);
  registerCollectionTools(server);
  registerRecordTools(server);
  registerAuthTools(server);
  registerSuperuserTools(server);
  registerFileTools(server);
  registerLogTools(server);
  registerSettingsTools(server);
  registerBackupTools(server);
  registerCronTools(server);
  registerRawTools(server);

  return server;
}
