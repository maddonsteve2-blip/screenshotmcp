# Agent skills

A **skill** is a `SKILL.md` (plus optional workflow files) that teaches an AI agent *how* to use a set of tools. deepsyte skills live under `~/.agents/skills/<name>/`.

**Included out of the box**

- `deepsyte` — the core skill with 46+ tools, plus packaged workflows for sitewide performance audits and WorkOS AuthKit signup flows

**Browse, preview, install**

1. Open the sidebar (`deepsyte` activity bar icon)
2. Expand **Available Skills**
3. Click a skill to preview the full `SKILL.md` in a WebView
4. Click **Install skill** to write it to `~/.agents/skills/<name>/`

**Author your own**

Run `deepsyte: Create New Skill` — it scaffolds a fresh `SKILL.md` with the front-matter template and opens it ready to edit.
