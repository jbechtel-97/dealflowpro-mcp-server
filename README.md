# DealFlowPro MCP Server

[![dealflowpro-mcp-server MCP server](https://glama.ai/mcp/servers/jbechtel-97/dealflowpro-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/jbechtel-97/dealflowpro-mcp-server)

Analyze multifamily real estate deals from Claude Code or Claude Desktop. The first real estate underwriting tool in the MCP ecosystem.

DealFlowPro is an AI-powered multifamily deal analysis platform. This MCP server wraps the DealFlowPro REST API, giving AI agents access to institutional-grade underwriting calculations.

## Demo

<img src="https://dealflowpro.io/images/mcp-demo.png" alt="DealFlowPro MCP Server analyzing a 24-unit deal in Claude Code" width="700">

## What You Can Do

Ask Claude naturally and it calls the right tool:

- "Analyze this 24-unit deal in Charlotte — asking $2M, $13.6K/mo rent, $5.5K expenses"
- "Score this deal: 12 units, $1.5M, $9K monthly income"
- "What's the max I should offer on a property with $28.8K/mo rent if I want 8% cash-on-cash?"
- "Is this property in a flood zone? 2909 Burgess Dr, Charlotte, NC"

## Tools

| Tool | Description |
|------|-------------|
| `analyze_deal` | Full deal analysis: cap rate, DSCR, cash-on-cash, IRR, DFP Score (0-100), max offer price, yearly cashflows |
| `score_deal` | Quick screening: DFP Score + key metrics |
| `reverse_calc` | Max offer price from target returns (cap rate, CoC, DSCR, IRR) |
| `market_data` | Flood zone, neighborhood income vs state median, job growth for any address |

## For Institutional AI Teams

DealFlowPro is built to slot into AI eval pipelines and production AI stacks. The MCP server (this package, plus the remote endpoint at `https://dealflowpro.io/mcp`) wraps the same engine as the REST API — schema-strict, idempotent, predictable.

**Auth + scoping.** Every tool call requires a Bearer API key. Calls are scoped to the account that issued the key — no cross-tenant access path. Per-tool audit lines land in your account's `logs/mcp_tool_calls.log` capturing tool name + flattened arg keys (not values) — usage is auditable without exposing deal contents.

**Rate limits per tier.**

| Tier | Daily limit | Monthly | Cost |
|------|------------:|--------:|-----:|
| Trial | 10 requests/day | ~300 | free (7-day) |
| Pay-as-you-go | balance-based | per credits | $1/request |
| Essentials | 50 req/day | ~1,500 | $79/mo |
| Premium | 200 req/day | ~6,000 | $149/mo |
| Enterprise | 1,000 req/day | ~30,000 | $399/mo |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) returned on every response. 429 responses include `Retry-After`.

**Error codes.** Stable, documented at [dealflowpro.io/api/docs/#errors](https://dealflowpro.io/api/docs/) — all errors are JSON `{success: false, error: {code, message}}` shape. Codes: `invalid_input` (400), `invalid_json` (400), `unauthorized` (401), `tier_required` (403), `method_not_allowed` (405), `payload_too_large` (413), `rate_limit_exceeded` (429), `internal_error` (500).

**Tool schemas.** Each MCP tool has a schema-strict input definition. Call `tools/list` against the remote endpoint to get the canonical schemas at runtime; the REST OpenAPI spec covers the same shapes (the four MCP tools map 1:1 to the four REST endpoints).

**Eval harness pattern.** For benchmarking, the recommended pattern: maintain a fixture set of (deal payload → expected metrics) pairs, run each against `score_deal` (lowest cost, ~$0.01/call), assert metrics within tolerance. The endpoint is deterministic — same inputs produce the same outputs.

**Data handling.** Request payloads are processed in memory and not persisted to disk. TLS 1.2+ in transit. Anthropic API calls (when DealFlowPro internally uses Claude for document extraction) flow through DealFlowPro's zero-data-retention Anthropic workspace. Full posture: [dealflowpro.io/security#api-mcp-data-handling](https://dealflowpro.io/security#api-mcp-data-handling).


## Setup

### 1. Get an API Key

Visit [dealflowpro.io/api](https://dealflowpro.io/api) to purchase API credits and get your key instantly.

### 2. Install

**Claude Desktop** — add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dealflowpro": {
      "command": "npx",
      "args": ["-y", "dealflowpro-mcp"],
      "env": {
        "DFP_API_KEY": "dfp_sk_your_key_here"
      }
    }
  }
}
```

**Claude Code** — add from the terminal:

```bash
claude mcp add dealflowpro -e DFP_API_KEY=dfp_sk_your_key_here -- npx -y dealflowpro-mcp
```

### 3. Use It

Just ask Claude about a deal. It automatically picks the right tool.

## Example Output

```
## Deal Analysis Results

**DFP Score: 19/100 (Poor)**

### Key Metrics
| Metric | Value |
|--------|-------|
| Cap Rate | 4.48% |
| DSCR | 0.86 |
| Cash-on-Cash | -1.95% |
| IRR | -12.17% |
| NOI | $89,524 |

### Max Offer Price
**$1,197,476** (binding constraint: cash-on-cash)
```

## API Documentation

Full REST API docs at [dealflowpro.io/api/docs](https://dealflowpro.io/api/docs/)

## Pricing

- **Pay-as-you-go:** $1/API request, starting at $5
- **Essentials:** 50 API requests/day included ($79/mo)
- **Premium:** 200 requests/day + reverse calculator ($149/mo)
- **Enterprise:** 1,000 requests/day ($399/mo)

## Requirements

- Node.js 18+
- DealFlowPro API key

## About DealFlowPro

DealFlowPro automates multifamily underwriting for 2-200 unit properties. Upload a broker email or OM and get a full investment analysis in 10 minutes instead of 2 hours. Used by operators, syndicators, and PE firms to screen deals faster.

[dealflowpro.io](https://dealflowpro.io)

## License

MIT
