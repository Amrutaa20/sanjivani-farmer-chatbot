import "dotenv/config";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const app = express();
const port = 3000;

const db = new Pool();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
});

app.use(
  cors({
    origin: "http://localhost:4200",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// Test backend
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Sanjivani API is running",
  });
});

// Retrieve farmer records
app.get("/api/farmers", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id,
        name,
        village,
        sugarcane_supply_tons,
        amount_paid,
        payment_pending
      FROM farmers
      ORDER BY id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to retrieve farmers:", error);

    res.status(500).json({
      error: "Failed to retrieve farmer records",
    });
  }
});

// Ask AI a question
app.post("/api/ai/ask", async (req, res) => {
  const question = req.body?.question;

  if (typeof question !== "string" || !question.trim()) {
    res.status(400).json({
      error: "Please enter a question.",
    });
    return;
  }

  let client: Client | undefined;

  try {
    console.log("\nQuestion received:", question);

    // Connect to MCP server
    client = new Client({
      name: "sanjivani-angular-client",
      version: "1.0.0",
    });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", "server.ts"],
      stderr: "inherit",
    });

    await client.connect(transport);

    console.log("MCP connected.");

    const { tools } = await client.listTools();

    console.log(
      "MCP tools:",
      tools.map((tool) => tool.name)
    );

    if (tools.length === 0) {
      throw new Error("No MCP tools are available.");
    }

    const openAITools = tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
      strict: false,
    }));

    let response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions: `
        You are the Sanjivani Sugar Factory farmer assistant.

        Use the connected farmer database tools to answer
        questions about farmers, villages, sugarcane supply,
        and payments.

        Never invent farmer records or financial totals.
        If information is unavailable, explain that clearly.
        Format financial amounts in Indian rupees.
      `,
      input: question,
      tools: openAITools,
    });

    let iteration = 0;
    const maxIterations = 5;

    while (
      response.output.some((item) => item.type === "function_call") &&
      iteration < maxIterations
    ) {
      iteration++;

      const toolOutputs: Array<{
        type: "function_call_output";
        call_id: string;
        output: string;
      }> = [];

      for (const item of response.output) {
        if (item.type !== "function_call") {
          continue;
        }

        console.log("Calling MCP tool:", item.name);

        const result = await client.callTool({
          name: item.name,
          arguments: JSON.parse(item.arguments),
        });

        if (result.isError) {
          throw new Error(`MCP tool failed: ${item.name}`);
        }

        const textResult = result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");

        toolOutputs.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: textResult,
        });
      }

      response = await openai.responses.create({
        model: "gpt-4.1-mini",
        instructions: `
          Answer accurately using the farmer database results.
          Never invent records or financial totals.
          Format financial amounts in Indian rupees.
        `,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: openAITools,
      });
    }

    if (
      response.output.some((item) => item.type === "function_call")
    ) {
      throw new Error("Too many tool-calling rounds.");
    }

    const answer = response.output_text;

    if (!answer || !answer.trim()) {
      throw new Error("The AI returned an empty answer.");
    }

    console.log("AI ANSWER:", answer);
    console.log("Sending answer to website.");

    // Send the answer to Angular as JSON.
    res.status(200).json({
      answer: answer,
    });

  } catch (error) {
    console.error("AI request failed:", error);

    if (!res.headersSent) {
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "An unexpected server error occurred.",
      });
    }

  } finally {
    if (client) {
      try {
        await client.close();
        console.log("MCP connection closed.");
      } catch (error) {
        console.error("Failed to close MCP:", error);
      }
    }
  }
});

app.listen(port, () => {
  console.log(`Sanjivani API running at http://localhost:${port}`);
});