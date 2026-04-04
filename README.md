# ScreenshotsMCP

Screenshot API + MCP server SaaS. Capture any URL via REST or AI agent tool call.

## Stack

| Service | Purpose |
|---|---|
| **Railway** | `apps/api` — Express + Playwright + MCP server |
| **Vercel** | `apps/web` — Next.js 14 dashboard + landing page |
| **Neon** | PostgreSQL database (Drizzle ORM) |
| **Cloudflare R2** | Screenshot image storage + CDN |
| **Clerk** | Authentication |
| **Stripe** | Billing (Free / Starter $9 / Pro $29) |

## Project Structure

```
screenshotsmcp/
├── apps/
│   ├── api/          # Express + Playwright + MCP server → Railway
│   └── web/          # Next.js 14 + Clerk + shadcn/ui → Vercel
├── packages/
│   ├── db/           # Drizzle schema + Neon client
│   └── types/        # Shared TypeScript types
```

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```
Fill in Clerk, Neon, R2, and Stripe credentials.

### 3. Run database migrations
```bash
cd packages/db
npx drizzle-kit migrate
```

### 4. Dev mode
```bash
npm run dev
```

## API Usage

### REST
```bash
# Take a screenshot
curl -X POST https://api.screenshotsmcp.com/v1/screenshot \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": false}'

# Poll for result
curl https://api.screenshotsmcp.com/v1/screenshot/<id> \
  -H "Authorization: Bearer sk_live_..."
```

### MCP (Claude Desktop / Cursor / Windsurf)
Add to your MCP config:
```json
{
  "mcpServers": {
    "screenshotsmcp": {
      "url": "https://api.screenshotsmcp.com/mcp",
      "headers": { "x-api-key": "sk_live_..." }
    }
  }
}
```

## Deploy

### API → Railway
1. Connect repo, select `apps/api`
2. Set build command: `npm run build --workspace=apps/api`
3. Set start command: `node apps/api/dist/index.js`
4. Add environment variables from `apps/api/.env.example`
5. Add Redis add-on

### Web → Vercel
1. Import repo, set root to `apps/web`
2. Framework: Next.js
3. Add environment variables from `apps/web/.env.example`

### Database → Neon
1. Create project at neon.tech
2. Copy connection string to `DATABASE_URL`
3. Run `npm run db:migrate`

### Storage → Cloudflare R2
1. Create R2 bucket named `screenshotsmcp`
2. Create API token with R2 read/write
3. Set a custom domain for public access
