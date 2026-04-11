---
description: How to debug production issues on the ScreenshotsMCP app
---

## Production URLs
- **Web app**: https://web-phi-eight-56.vercel.app
- **API server**: https://screenshotsmcp-api-production.up.railway.app
- **Sign-in**: https://web-phi-eight-56.vercel.app/sign-in

## Debugging steps

### 1. Check the database directly
Use the Neon MCP tools with project ID `royal-brook-92982254`:
```
mcp3_run_sql(projectId: "royal-brook-92982254", sql: "SELECT ...")
```

### 2. Check the live site with browser tools
Use `browser_navigate` to open the site, `smart_login` to sign in, then:
- `browser_evaluate` to run fetch() calls from an authenticated session
- `browser_console_logs` to check for client-side errors
- `browser_network_errors` to check for failed API calls
- `browser_get_text` to read page content

### 3. Check Vercel deployment status
// turbo
```
npx vercel ls 2>&1 | Select-Object -First 10
```

### 4. Check Railway API logs
```
railway logs --tail
```

### 5. Deploy
- **API (Railway)**: `railway up` from repo root
- **Web (Vercel)**: `git push` auto-deploys, or `npx vercel --prod` for manual

## Key environment variables
- `INTERNAL_API_SECRET` — shared secret between web (Vercel) and API (Railway) for playground proxy
- `DATABASE_URL` — Neon Postgres connection string
- Clerk keys for auth on the web app
