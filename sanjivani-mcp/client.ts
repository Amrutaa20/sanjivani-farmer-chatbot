import "dotenv/config";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const client = new Client({
  name: "sanjivani-farmer-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "server.ts"],
  stderr: "inherit",
});

async function main() {
  await client.connect(transport);

  // Discover tools registered by the MCP server.
  const { tools } = await client.listTools();

  // Hardcoded question.
  const question = "Which village has supplied the most sugarcane to Sanjivani Sugar Factory?";

  // Send the question and MCP tool definition to OpenAI.
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: question,
    tools: tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema as Record<string, unknown>,
      strict: false,
    })),
  });

  const outputs = [];

  // Execute tool calls requested by OpenAI.
  for (const item of response.output) {
    if (item.type !== "function_call") continue;

    if (item.name !== "get_farmer_data") {
      throw new Error(`Unexpected tool: ${item.name}`);
    }

    const result = await client.callTool({
      name: item.name,
      arguments: JSON.parse(item.arguments),
    });

    const textResult = result.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    outputs.push({
      type: "function_call_output" as const,
      call_id: item.call_id,
      output: textResult,
    });
  }

  // Ask OpenAI to generate the final answer using the tool result.
  if (outputs.length > 0) {
    const answer = await openai.responses.create({
      model: "gpt-4.1-mini",
      previous_response_id: response.id,
      input: outputs,
    });

    console.log("\nAI ANSWER:\n");
    console.log(answer.output_text);
  } else {
    console.log(response.output_text);
  }

  await client.close();
}

main().catch((error) => {
  console.error("Application error:", error);
  process.exitCode = 1;
});