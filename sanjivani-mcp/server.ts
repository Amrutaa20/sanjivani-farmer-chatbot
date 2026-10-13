import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Pool } from "pg";
import * as z from "zod/v4";

const db = new Pool();

const server = new McpServer({
  name: "sanjivani-farmer-server",
  version: "1.0.0",
});

server.registerTool(
  "get_farmer_data",
  {
    description:
      "Retrieve farmer names, villages, sugarcane supply, amount paid, and pending payments.",
    inputSchema: {
      village: z.string().optional().describe("Optional village filter"),
    },
  },
  async ({ village }) => {
    const result = await db.query(
      `SELECT id, name, village, sugarcane_supply_tons,
              amount_paid, payment_pending
       FROM farmers
       WHERE ($1::text IS NULL OR village ILIKE $1)
       ORDER BY id`,
      [village ? `%${village}%` : null]
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.rows),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();

await server.connect(transport);

console.error("Sanjivani MCP server started.");