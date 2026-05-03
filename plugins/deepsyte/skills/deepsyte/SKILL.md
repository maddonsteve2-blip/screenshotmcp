---
name: deepsyte
description: Use DeepSyte MCP tools for screenshots, browser automation, website audits, visual verification, and authenticated web testing.
---

# DeepSyte

Use DeepSyte when the user wants Codex to capture screenshots, automate a browser, run a site audit, verify visual changes, or inspect a live web page through the DeepSyte MCP server.

Authentication is required during setup. If Codex reports that DeepSyte needs authentication, follow the Codex auth prompt or run `codex mcp login deepsyte`, then sign in at `https://deepsyte.com`. Raw API keys cannot authorize MCP access.

Do not bypass DeepSyte authentication with raw Playwright, browser automation, local screenshots, or a local CLI browser fallback. If the `mcp__deepsyte` tools are not mounted and `deepsyte whoami` is not authenticated with a website-issued session, stop and report that DeepSyte is not connected.

Prefer targeted checks. For large sites or audits, keep the page set narrow unless the user explicitly asks for a full crawl.
