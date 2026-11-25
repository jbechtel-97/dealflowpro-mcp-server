#!/usr/bin/env node
/**
 * DealFlowPro MCP Server (Spec 137 Phase 2)
 *
 * Exposes DealFlowPro's deal analysis engine as MCP tools for
 * Claude Code, Claude Desktop, and any MCP-compatible AI agent.
 *
 * Tools:
 *   - analyze_deal: Full multifamily deal analysis with DFP Score
 *   - score_deal: Quick deal scoring (lightweight)
 *   - reverse_calc: Back-solve max offer price from target returns
 *   - market_data: Flood zone, neighborhood income, job growth
 *
 * Configuration:
 *   DFP_API_KEY (required) — Your DealFlowPro API key
 *   DFP_API_URL (optional) — API base URL (defaults to https://dealflowpro.io)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const MCP_VERSION = "1.6.0";
const USER_AGENT = `dealflowpro-mcp/${MCP_VERSION}`;

const API_KEY = process.env.DFP_API_KEY;
const API_BASE = (process.env.DFP_API_URL || "https://dealflowpro.io").replace(/\/$/, "");

if (!API_KEY) {
  console.error("Error: DFP_API_KEY environment variable is required.");
  console.error("Get your API key at https://dealflowpro.io");
  process.exit(1);
}

async function callApi(endpoint, body) {
  const response = await fetch(`${API_BASE}/api/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    if (data.error && data.error.code === "missing_inputs") {
      throw new Error(formatMissingInputs(data.error, response.status));
    }
    const errorMsg = data.error?.message || data.error || "API call failed";
    throw new Error(`DFP API error (${response.status}): ${errorMsg}`);
  }

  return data;
}

/** The API returns 422 missing_inputs when the account has no saved value for an assumption the analysis needs. Nothing is substituted. */
function formatMissingInputs(err, status) {
  const list = Array.isArray(err["missing-inputs"]) ? err["missing-inputs"] : [];
  let msg = `DFP API error (${status}): ${err.message || "Missing inputs"}\n\n`;
  msg += `The analysis was not run because these inputs have no value (nothing is assumed or substituted). Set them in your DealFlowPro account settings, or pass them on the call:\n`;
  if (list.length === 0) {
    msg += `- (the API did not list the keys)\n`;
  }
  for (const item of list) {
    if (item && typeof item === "object") {
      const reason = item.reason ? `: ${item.reason}` : "";
      const withholds = Array.isArray(item.withholds) ? item.withholds.join(", ") : item.withholds;
      msg += `- ${item.key}${reason}${withholds ? ` (withholds: ${withholds})` : ""}\n`;
    } else {
      msg += `- ${item}\n`;
    }
  }
  return msg;
}

function formatCurrency(n) {
  if (n == null) return "N/A";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function formatPercent(n) {
  if (n == null) return "N/A";
  return n.toFixed(2) + "%";
}

/** One line saying which monthly CapEx the numbers used and where it came from (API assumptions-used). */
function capexLine(u) {
  if (!u || !("capex-basis" in u)) return "";
  if (u["monthly-capex"] === null || u["monthly-capex"] === undefined) return `**CapEx:** not included. ${u["capex-note"] || ""}\n\n`;
  const basis = u["capex-basis"] === "account_per_unit_yearly"
    ? `your CapEx setting of ${formatCurrency(u["capex-per-unit-yearly"])}/unit/yr x ${u["capex-units"]} units / 12`
    : "the monthly-capex you gave";
  return `**CapEx:** ${formatCurrency(u["monthly-capex"])}/mo (${basis})\n\n`;
}

function formatAnalysisResult(data) {
  const d = data.data;
  const m = d.metrics || {};
  const f = d.financials || {};
  const s = d["dfp-score"] || {};
  const mo = d["max-offer"] || {};

  let result = `## Deal Analysis Results\n\n`;
  result += `**DFP Score: ${s.score ?? "N/A"}/100 (${s.band?.label ?? "N/A"})**\n\n`;

  result += `### Key Metrics\n`;
  result += `| Metric | Value |\n|--------|-------|\n`;
  result += `| Cap Rate | ${formatPercent(m["going-in-cap-rate"])} |\n`;
  result += `| DSCR | ${m["going-in-dscr"] ?? "N/A"} |\n`;
  result += `| Cash-on-Cash | ${formatPercent(m["cash-on-cash"])} |\n`;
  result += `| Avg Cash-on-Cash | ${formatPercent(m["avg-cash-on-cash"])} |\n`;
  result += `| IRR | ${formatPercent(m.irr)} |\n`;
  result += `| Equity Multiple | ${m["equity-multiple"] ?? "N/A"}x |\n`;
  result += `| OER | ${formatPercent(m["operating-expense-ratio"])} |\n\n`;

  result += `### Financials\n`;
  result += `| Item | Value |\n|------|-------|\n`;
  result += `| NOI | ${formatCurrency(f["net-operating-income"])} |\n`;
  result += `| Annual Debt Service | ${formatCurrency(f["annual-debt-service"])} |\n`;
  result += `| Annual Cash Flow | ${formatCurrency(f["annual-cash-flow"])} |\n`;
  result += `| Total Cash Required | ${formatCurrency(f["total-cash-invested"])} |\n`;
  result += `| Loan Amount | ${formatCurrency(f["loan-amount"])} |\n\n`;
  result += capexLine(d["assumptions-used"]);

  if (mo["binding-price"]) {
    result += `### Max Offer Price\n`;
    result += `**${formatCurrency(mo["binding-price"])}** (binding constraint: ${mo["binding-key"]})\n\n`;
    if (mo.metrics) {
      result += `| Constraint | Max Price |\n|------------|----------|\n`;
      for (const [key, val] of Object.entries(mo.metrics)) {
        result += `| ${val.label} (${val.threshold}) | ${formatCurrency((val["max-price"] ?? val.maxPrice))} |\n`;
      }
      result += `\n`;
    }
  }

  return result;
}

// Create MCP server
const server = new McpServer({
  name: "DealFlowPro",
  version: "1.6.0",
});

// Tool: analyze_deal
// Annotation values mirror the remote server's mcp_tools.php so the two
// surfaces describe the same tools identically.
server.registerTool(
  "analyze_deal",
  {
    title: "Analyze Multifamily Deal",
    description: "Analyze a multifamily real estate deal. Returns cap rate, cash-on-cash, DSCR, IRR, DFP Score (0-100), max offer price, and full financial projections. Use this when someone asks about analyzing a property, evaluating a deal, or running the numbers on a multifamily investment.",
    annotations: {
      title: "Analyze Multifamily Deal",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
    "purchase-price": z.number().describe("Asking/purchase price in dollars"),
    units: z.number().int().positive().describe("Number of apartment units (required). Turns your account's CapEx ($/unit/yr) setting into the monthly CapEx reserve."),
    "monthly-capex": z.number().optional().describe("Monthly CapEx reserve in dollars for this deal, used as-is. Omitted: your account's CapEx ($/unit/yr) setting x units / 12."),
    "monthly-income": z.number().describe("Total monthly rental income in dollars"),
    "monthly-expenses": z.number().optional().describe("Total monthly operating expenses in dollars. Omitted: NO expenses are assumed, so NOI and every ratio built on it (cap rate, cash-on-cash, DSCR, IRR, DFP Score) are withheld, with the reason; nothing is estimated. A typed 0 is a value (zero expenses), not omission."),
    "property-address": z.string().optional().describe("Full street address. Drives the market data behind the DFP Score; without it the market component is understated."),
    "year-built": z.number().optional().describe("Year the property was built"),
    "income-source": z.string().optional().describe("Where monthly-income came from, e.g. RentRoll, T12, OM, Screen. Raises the confidence rating on the result."),
    "expense-source": z.string().optional().describe("Where monthly-expenses came from, e.g. T12, OperatingStatement, OM, Screen. Raises the confidence rating on the result."),
    scenario: z.enum(["current", "proforma"]).optional().describe("Defaults to current. The two scenarios use your account's saved current and proforma assumptions (proforma is generally more favorable for the same deal). An assumption your account has not set makes the call fail naming it; nothing is substituted. Pass it explicitly when comparing results."),
    assumptions: z.object({
      "down-payment": z.number().optional().describe("Down payment percentage. Omitted: your account's saved assumption"),
      "interest-rate": z.number().optional().describe("Loan interest rate percentage. Omitted: your account's saved assumption"),
      "vacancy-rate": z.number().optional().describe("Vacancy rate percentage. Omitted: your account's saved assumption"),
      "holding-period": z.number().optional().describe("Hold period in years. Omitted: your account's saved assumption"),
      "exit-cap-rate": z.number().optional().describe("Exit cap rate percentage. Omitted: your account's saved assumption"),
      "interest-basis": z.enum(["365-360", "30-360"]).optional().describe("First mortgage interest basis. 365-360: interest accrues at rate x 365/360 (commercial / agency convention); 30-360: every month counts as 30 days. Omitted: the account's Settings default"),
      "second-mortgage-interest-basis": z.enum(["365-360", "30-360"]).optional().describe("Second mortgage interest basis, same values"),
    }).optional().describe("Override your account's saved underwriting assumptions. Omitted keys use the saved assumption; one the account has not set makes the call fail naming it, nothing is substituted."),
    },
  },
  async (params) => {
    const body = {
      deal: {
        "purchase-price": params["purchase-price"],
        units: params.units,
        "monthly-income": params["monthly-income"],
        "property-address": params["property-address"] || "",
        "year-built": params["year-built"],
      },
      assumptions: params.assumptions || null,
      scenario: params.scenario || "current",
    };
    // Never turn an omitted expense figure into 0: the API withholds NOI when it is absent.
    if (typeof params["monthly-expenses"] === "number") body.deal["monthly-expenses"] = params["monthly-expenses"];
    if (params["income-source"]) body.deal["income-source"] = params["income-source"];
    if (params["expense-source"]) body.deal["expense-source"] = params["expense-source"];

    if (params["monthly-capex"] !== undefined) body.deal["monthly-capex"] = params["monthly-capex"];
    const result = await callApi("analyze", body);
    return { content: [{ type: "text", text: formatAnalysisResult(result) }] };
  }
);

// Tool: score_deal
server.registerTool(
  "score_deal",
  {
    title: "Score Multifamily Deal (Quick)",
    description: "Quick-score a multifamily deal on the DFP 0-100 scale. Returns the DFP Score and key metrics. Faster than full analysis — use this for quick screening.",
    annotations: {
      title: "Score Multifamily Deal (Quick)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      "purchase-price": z.number().describe("Asking/purchase price in dollars"),
      units: z.number().int().positive().describe("Number of apartment units (required). Turns your account's CapEx ($/unit/yr) setting into the monthly CapEx reserve."),
    "monthly-capex": z.number().optional().describe("Monthly CapEx reserve in dollars for this deal, used as-is. Omitted: your account's CapEx ($/unit/yr) setting x units / 12."),
      "monthly-income": z.number().describe("Total monthly rental income in dollars"),
      "monthly-expenses": z.number().optional().describe("Total monthly operating expenses in dollars. Omitted: NO expenses are assumed, so NOI and the ratios built on it are withheld, with the reason; nothing is estimated. A typed 0 is a value (zero expenses)."),
      "property-address": z.string().optional().describe("Full street address. Drives the market data behind the DFP Score; without it the market component is understated."),
      "income-source": z.string().optional().describe("Where monthly-income came from, e.g. RentRoll, T12, OM, Screen. Raises the confidence rating on the result."),
      "expense-source": z.string().optional().describe("Where monthly-expenses came from, e.g. T12, OperatingStatement, OM, Screen. Raises the confidence rating on the result."),
      assumptions: z.object({
      "interest-basis": z.enum(["365-360", "30-360"]).optional().describe("First mortgage interest basis. 365-360: interest accrues at rate x 365/360 (commercial / agency convention); 30-360: every month counts as 30 days. Omitted: the account's Settings default"),
      "second-mortgage-interest-basis": z.enum(["365-360", "30-360"]).optional().describe("Second mortgage interest basis, same values"),
      }).optional().describe("Only the interest basis can be overridden on a quick score (it feeds IRR and cash-on-cash); use analyze_deal for other assumptions"),
    },
  },
  async (params) => {
    const body = {
      deal: {
        "purchase-price": params["purchase-price"],
        units: params.units,
        "monthly-income": params["monthly-income"],
        "property-address": params["property-address"] || "",
      },
    };
    if (typeof params["monthly-expenses"] === "number") body.deal["monthly-expenses"] = params["monthly-expenses"];
    if (params.assumptions) body.assumptions = params.assumptions;
    if (params["income-source"]) body.deal["income-source"] = params["income-source"];
    if (params["expense-source"]) body.deal["expense-source"] = params["expense-source"];

    if (params["monthly-capex"] !== undefined) body.deal["monthly-capex"] = params["monthly-capex"];
    const result = await callApi("score", body);
    const d = result.data;
    const s = d["dfp-score"] || {};
    const km = d["key-metrics"] || {};

    let text = `## DFP Score: ${s.score ?? "N/A"}/100 (${s.band?.label ?? "N/A"})\n\n`;
    text += `| Metric | Value |\n|--------|-------|\n`;
    text += `| Cap Rate | ${formatPercent(km["cap-rate"])} |\n`;
    text += `| DSCR | ${km.dscr ?? "N/A"} |\n`;
    text += `| Cash-on-Cash | ${formatPercent(km["cash-on-cash"])} |\n`;
    text += `| NOI | ${formatCurrency(km.noi)} |\n`;

    text += `\n` + capexLine(d["assumptions-used"]);
    return { content: [{ type: "text", text }] };
  }
);

// Tool: reverse_calc
server.registerTool(
  "reverse_calc",
  {
    title: "Reverse-Calculate Max Offer Price",
    description: "Calculate the maximum offer price for a multifamily deal based on target return metrics. Back-solves from your desired cap rate, cash-on-cash, DSCR, and/or IRR to find what you should pay. Use this when someone asks 'what should I offer?' or 'what's the max price?'",
    annotations: {
      title: "Reverse-Calculate Max Offer Price",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
    "monthly-income": z.number().describe("Total monthly rental income in dollars"),
    "monthly-expenses": z.number().optional().describe("Total monthly operating expenses in dollars. Omitted: NO expenses are assumed, so NOI and the ratios built on it are withheld, with the reason; nothing is estimated. A typed 0 is a value (zero expenses)."),
    units: z.number().int().positive().describe("Number of apartment units (required). Turns your account's CapEx ($/unit/yr) setting into the monthly CapEx reserve."),
    "monthly-capex": z.number().optional().describe("Monthly CapEx reserve in dollars for this deal, used as-is. Omitted: your account's CapEx ($/unit/yr) setting x units / 12."),
    scenario: z.enum(["current", "proforma"]).optional().describe("Defaults to current. The two scenarios use your account's saved current and proforma assumptions (proforma is generally more favorable for the same deal). An assumption your account has not set makes the call fail naming it; nothing is substituted. Pass it explicitly when comparing results."),
    targets: z.object({
      "cap-rate": z.number().optional().describe("Target cap rate (e.g., 7 for 7%)"),
      "cash-on-cash": z.number().optional().describe("Target cash-on-cash return (e.g., 8 for 8%)"),
      dscr: z.number().optional().describe("Target DSCR (e.g., 1.25)"),
      irr: z.number().optional().describe("Target IRR (e.g., 15 for 15%)"),
      "price-per-unit": z.number().optional().describe("Maximum price per unit in dollars (e.g., 120000)."),
    }).describe("Target return metrics — provide at least one"),
    assumptions: z.object({
      "down-payment": z.number().optional().describe("Omitted: your account's saved assumption"),
      "interest-rate": z.number().optional().describe("Omitted: your account's saved assumption"),
      "vacancy-rate": z.number().optional().describe("Omitted: your account's saved assumption"),
      "holding-period": z.number().optional().describe("Omitted: your account's saved assumption"),
      "exit-cap-rate": z.number().optional().describe("Omitted: your account's saved assumption"),
      "interest-basis": z.enum(["365-360", "30-360"]).optional().describe("First mortgage interest basis. 365-360: interest accrues at rate x 365/360 (commercial / agency convention); 30-360: every month counts as 30 days. Omitted: the account's Settings default"),
      "second-mortgage-interest-basis": z.enum(["365-360", "30-360"]).optional().describe("Second mortgage interest basis, same values"),
    }).optional().describe("Override your account's saved underwriting assumptions. Omitted keys use the saved assumption; one the account has not set makes the call fail naming it, nothing is substituted."),
    },
  },
  async (params) => {
    const body = {
      deal: {
        "monthly-income": params["monthly-income"],
        units: params.units,
      },
      targets: params.targets,
      assumptions: params.assumptions || null,
      scenario: params.scenario || "current",
    };

    if (typeof params["monthly-expenses"] === "number") body.deal["monthly-expenses"] = params["monthly-expenses"];
    if (params["monthly-capex"] !== undefined) body.deal["monthly-capex"] = params["monthly-capex"];
    const result = await callApi("reverse-calc", body);
    const d = result.data;

    let text = `## Max Offer Price: ${formatCurrency(d["max-offer-price"])}\n\n`;
    text += capexLine(d["assumptions-used"]);
    text += `**Binding constraint: ${d["binding-constraint"]}**\n`;
    if (d["price-per-unit"]) text += `Price per unit: ${formatCurrency(d["price-per-unit"])}\n`;
    text += `\n`;

    text += `| Target Metric | Max Price |\n|---------------|----------|\n`;
    for (const [key, val] of Object.entries(d["max-prices"] || {})) {
      text += `| ${key.replace(/^by[-_]/, "")} | ${val ? formatCurrency(val) : "Unsolvable"} |\n`;
    }

    return { content: [{ type: "text", text }] };
  }
);

// Tool: market_data
server.registerTool(
  "market_data",
  {
    title: "Lookup Property Market Data",
    description: "Look up market intelligence for a property address. Returns flood zone, neighborhood income relative to state median, and job growth rate. Use this when someone asks about a market, neighborhood, or location.",
    annotations: {
      title: "Lookup Property Market Data",
      readOnlyHint: true,
      destructiveHint: false,
      // External sources (FEMA flood zones, Census ACS, BLS job growth)
      // can revise between calls, so results are not idempotent.
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      address: z.string().describe("Full property address including city and state (e.g., '2909 Burgess Dr, Charlotte, NC 28208')"),
      zip: z.string().optional().describe("ZIP code (extracted from address if not provided)"),
    },
  },
  async (params) => {
    const result = await callApi("market", { address: params.address, zip: params.zip || "" });
    const d = result.data;

    let text = `## Market Data: ${d.address}\n\n`;
    text += `| Factor | Value |\n|--------|-------|\n`;
    const fz = d["flood-zone"] || {};
    const ni = d["neighborhood-income"] || {};
    const jg = d["job-growth"] || {};
    text += `| Flood Zone | ${fz["zone-code"] || "Unknown"} (${fz["in-flood-zone"] === true ? "In flood zone" : fz["in-flood-zone"] === false ? "Not in flood zone" : "Unknown"}) |\n`;
    // near-boundary is only true when a hazard zone (A/V) and a non-hazard zone are both nearby, so
    // false/null does not mean "far from an edge". null means "not determined", never false.
    if (fz["near-boundary"] === true) {
      const zones = Array.isArray(fz["nearby-zones"]) && fz["nearby-zones"].length ? ` (nearby zones: ${fz["nearby-zones"].join(", ")})` : "";
      text += `| Flood Boundary | Near a flood-zone boundary${zones}: verify with an elevation certificate before relying on the zone above |\n`;
    }
    text += `| Neighborhood Income vs State Median | ${ni["vs-state-median"] != null ? ni["vs-state-median"] + "%" : "Unknown"} |\n`;
    text += `| Job Growth Rate | ${jg.rate != null ? jg.rate + "%" : "Unknown"} |\n`;

    return { content: [{ type: "text", text }] };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
