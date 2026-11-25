#!/usr/bin/env node
/**
 * Smoke tests for DealFlowPro MCP Server.
 *
 * Spawns the server with a dummy API key and sends JSON-RPC messages
 * over stdio to verify initialization and tool registration.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "index.js");

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

function sendJsonRpc(proc, id, method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  proc.stdin.write(msg + "\n");
}

function parseResponses(data) {
  return data
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function runTests() {
  console.log("DealFlowPro MCP Server — smoke tests\n");

  const proc = spawn("node", [SERVER_PATH], {
    env: { ...process.env, DFP_API_KEY: "test_dummy_key" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  // Send initialize request
  sendJsonRpc(proc, 0, "initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test-runner", version: "1.0.0" },
  });

  // Wait for initialize response, then request tool list
  await new Promise((resolve) => setTimeout(resolve, 1500));

  sendJsonRpc(proc, 1, "tools/list", {});

  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Parse responses
  const responses = parseResponses(stdout);

  // Test 1: Server responds to initialize
  const initResp = responses.find((r) => r.id === 0);
  assert(initResp != null, "Server responds to initialize");

  // Test 2: Protocol version returned
  assert(
    initResp?.result?.protocolVersion != null,
    "Returns protocol version: " + (initResp?.result?.protocolVersion ?? "missing")
  );

  // Test 3: Server name is DealFlowPro
  assert(
    initResp?.result?.serverInfo?.name === "DealFlowPro",
    "Server name is DealFlowPro"
  );

  // Test 4: Tools capability advertised
  assert(
    initResp?.result?.capabilities?.tools != null,
    "Advertises tools capability"
  );

  // Test 5: tools/list returns tools
  const toolsResp = responses.find((r) => r.id === 1);
  const tools = toolsResp?.result?.tools || [];
  assert(tools.length === 4, `Registers 4 tools (got ${tools.length})`);

  // Test 6-9: Each expected tool is present
  const expectedTools = ["analyze_deal", "score_deal", "reverse_calc", "market_data"];
  for (const name of expectedTools) {
    assert(
      tools.some((t) => t.name === name),
      `Tool "${name}" is registered`
    );
  }

  // Test 10: Each tool has inputSchema
  for (const tool of tools) {
    assert(
      tool.inputSchema?.type === "object",
      `Tool "${tool.name}" has valid inputSchema`
    );
  }

  // Test 11: units is required on the three underwriting tools (the API rejects a deal without it, 2026-11-21)
  for (const name of ["analyze_deal", "score_deal", "reverse_calc"]) {
    const tool = tools.find((t) => t.name === name);
    assert(
      Array.isArray(tool?.inputSchema?.required) && tool.inputSchema.required.includes("units"),
      `Tool "${name}" requires units`
    );
  }

  // Test 12: tool input schemas use hyphen parameter names, none of the old underscore names
  const props = (name) => Object.keys(tools.find((t) => t.name === name)?.inputSchema?.properties || {});
  const targetProps = Object.keys(
    tools.find((t) => t.name === "reverse_calc")?.inputSchema?.properties?.targets?.properties || {}
  );
  const hyphenExpected = {
    analyze_deal: ["purchase-price", "monthly-income", "monthly-expenses", "monthly-capex", "property-address", "year-built", "income-source", "expense-source", "units"],
    score_deal: ["purchase-price", "monthly-income", "monthly-expenses", "monthly-capex", "property-address", "income-source", "expense-source", "units"],
    reverse_calc: ["monthly-income", "monthly-expenses", "monthly-capex", "units"],
  };
  for (const [name, expected] of Object.entries(hyphenExpected)) {
    const have = props(name);
    for (const key of expected) {
      assert(have.includes(key), `Tool "${name}" has parameter "${key}"`);
    }
  }
  for (const key of ["cap-rate", "cash-on-cash", "price-per-unit", "dscr", "irr"]) {
    assert(targetProps.includes(key), `reverse_calc target "${key}" is present`);
  }
  const oldNames = ["purchase_price", "monthly_income", "monthly_expenses", "monthly_capex", "property_address", "property_name", "year_built", "income_source", "expense_source", "cap_rate", "cash_on_cash", "price_per_unit"];
  for (const tool of tools) {
    const all = [...props(tool.name), ...(tool.name === "reverse_calc" ? targetProps : [])];
    const bad = all.filter((k) => oldNames.includes(k));
    assert(bad.length === 0, `Tool "${tool.name}" has no underscore parameter names${bad.length ? " (found " + bad.join(", ") + ")" : ""}`);
  }
  // No false defaults text in descriptions
  const allSchemaText = JSON.stringify(tools);
  assert(!/\(default \d/.test(allSchemaText), "No '(default N)' assumption claims in tool schemas");
  assert(!/50% of income/.test(allSchemaText), "No '50% of income' expense assumption text");

  // Clean up
  proc.kill();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
