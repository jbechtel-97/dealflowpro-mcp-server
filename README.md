# DealFlowPro MCP Server

[![dealflowpro-mcp-server MCP server](https://glama.ai/mcp/servers/jbechtel-97/dealflowpro-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/jbechtel-97/dealflowpro-mcp-server)

Analyze multifamily real estate deals from Claude Code or Claude Desktop. The first real estate underwriting tool in the MCP ecosystem.

DealFlowPro is an AI-powered multifamily deal analysis platform. This MCP server wraps the DealFlowPro REST API, giving AI agents access to institutional-grade underwriting calculations.

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
