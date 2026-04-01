import path from "node:path";
import { Codex } from "@openai/codex-sdk";

export function createCodex() {
  return new Codex();
}

export function defaultThreadOptions(overrides = {}) {
  return {
    workingDirectory: process.cwd(),
    approvalPolicy: "never",
    modelReasoningEffort: "low",
    webSearchEnabled: false,
    networkAccessEnabled: false,
    sandboxMode: "read-only",
    ...overrides,
  };
}

function oneLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function preview(value, maxLength = 140) {
  const normalized = oneLine(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatTodoItems(items) {
  return items.map((item) => `${item.completed ? "[x]" : "[ ]"} ${item.text}`).join(" | ");
}

function formatCommand(item) {
  const parts = [item.command];

  if (typeof item.exit_code === "number") {
    parts.push(`exit=${item.exit_code}`);
  }

  if (item.aggregated_output) {
    parts.push(`output=${preview(item.aggregated_output)}`);
  }

  return parts.join(" | ");
}

function formatFileChange(item) {
  const changes = item.changes.map((change) => `${change.kind}:${change.path}`).join(", ");
  return `${item.status} | ${changes}`;
}

function formatMcpTool(item) {
  return `${item.server}/${item.tool} | status=${item.status}`;
}

function formatItem(item) {
  switch (item.type) {
    case "agent_message":
      return preview(item.text, 200);
    case "reasoning":
      return preview(item.text, 200);
    case "command_execution":
      return formatCommand(item);
    case "file_change":
      return formatFileChange(item);
    case "mcp_tool_call":
      return formatMcpTool(item);
    case "web_search":
      return item.query;
    case "todo_list":
      return formatTodoItems(item.items);
    case "error":
      return item.message;
    default:
      return "";
  }
}

export function printEvent(event) {
  switch (event.type) {
    case "thread.started":
      console.log(`[thread.started] ${event.thread_id}`);
      break;
    case "turn.started":
      console.log("[turn.started]");
      break;
    case "turn.completed":
      console.log(
        `[turn.completed] input=${event.usage.input_tokens} cached=${event.usage.cached_input_tokens} output=${event.usage.output_tokens}`,
      );
      break;
    case "turn.failed":
      console.log(`[turn.failed] ${event.error.message}`);
      break;
    case "error":
      console.log(`[error] ${event.message}`);
      break;
    case "item.started":
    case "item.updated":
    case "item.completed":
      console.log(`[${event.type}:${event.item.type}] ${formatItem(event.item)}`);
      break;
    default:
      console.log(`[unknown] ${JSON.stringify(event)}`);
      break;
  }
}

export async function runStreamedPrompt(prompt, options = {}) {
  const codex = createCodex();
  const thread = codex.startThread(defaultThreadOptions(options));
  const { events } = await thread.runStreamed(prompt);

  const summary = {
    threadId: null,
    itemTypes: new Set(),
    finalMessage: null,
  };

  for await (const event of events) {
    printEvent(event);

    if (event.type === "thread.started") {
      summary.threadId = event.thread_id;
    }

    if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
      summary.itemTypes.add(event.item.type);

      if (event.item.type === "agent_message") {
        summary.finalMessage = event.item.text;
      }
    }
  }

  console.log(
    `[summary] thread=${summary.threadId ?? "unknown"} item_types=${Array.from(summary.itemTypes).join(", ") || "none"}`,
  );

  if (summary.finalMessage) {
    console.log(`[final] ${oneLine(summary.finalMessage)}`);
  }

  return summary;
}

export function outputFilePath() {
  return path.join(process.cwd(), "output", "hello-from-codex.txt");
}
