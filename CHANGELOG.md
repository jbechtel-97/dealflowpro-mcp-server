# Changelog

All notable changes to this project will be documented in this file.

## [1.1.1] - 2025-05-25

### Fixed
- Server version in MCP handshake now matches package.json
- Header comment lists all 4 tools and both environment variables
- API: removed unused `property_address` from reverse-calc endpoint (data minimization)

### Changed
- Added Glama badge to README
- Fixed reverse_calc example prompt in README to include required monthly_income

## [1.0.1] - 2025-05-21

### Added
- `market_data` tool — flood zone, neighborhood income, job growth for any address
- Smithery registry support (`smithery.yaml`)
- MCP Registry support (`server.json` with `mcpName`)
- Dockerfile for Glama introspection checks
- `.well-known/mcp/server-card.json` for Smithery scanning

## [1.0.0] - 2025-05-20

### Added
- Initial release
- `analyze_deal` tool — full multifamily deal analysis with DFP Score, cap rate, DSCR, cash-on-cash, IRR, max offer price, and yearly cashflows
- `score_deal` tool — quick screening with DFP Score and verdict (Quick Review / Lead Underwriting / Closed Leads)
- `reverse_calc` tool — back-solve max offer price from target return metrics
- Formatted markdown output for all tools
- Published to npm as `dealflowpro-mcp`
