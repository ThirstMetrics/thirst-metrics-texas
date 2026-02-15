# Claude Code Session - Thirst Metrics Texas

## Project Overview
**App:** Thirst Metrics Texas - Sales CRM for beverage distribution
**Stack:** Next.js 14 (App Router), TypeScript, Supabase (Auth + Storage + DB), DuckDB (analytics), Mapbox (mobile maps)
**Repo:** `C:\thirst-metrics-texas` (local) | GitHub: ThirstMetrics/thirst-metrics-texas

## Server Details
- **Host:** 167.71.242.157 (Cloudways)
- **SSH User:** master_nrbudqgaus
- **App Path:** ~/applications/gnhezcjyuk/public_html
- **Domain:** thirstmetrics.com
- **SSH Key:** Configured (no password prompts)

## Session Rules

### 1. Local-First Development
- **ALWAYS test locally before deploying to production**
- Run `npm run dev` locally and verify fixes work
- Only push to git and deploy after local verification
- Add build timestamp to UI so user can verify correct build is live

### 2. Debug Protocol
- **On first error:** Ask user to open DevTools → Network + Console tabs
- **On second error:** Use Claude Chrome MCP to inspect page directly if available
- **On third failed fix:** STOP coding. Launch research agent to search:
  - GitHub Issues for the library
  - Stack Overflow
  - Reddit r/nextjs, r/supabase
  - Official docs
- **Never brute-force** more than 3 attempts without research

### 3. Context Management
- **Session scope:** Focus on ONE feature area per session
- **When context gets heavy:** Generate HANDOFF.md summary before ending
- **Multi-bug situations:** Spin up parallel agents for independent issues
- Keep sessions focused - don't let context window fill with failed attempts

### 4. Parallel Agents
Use Task tool to launch parallel agents when:
- Multiple independent bugs exist
- Research needed while coding continues
- Exploring multiple areas of codebase

Agent types available:
- `Explore` - Fast codebase search
- `Plan` - Architecture decisions
- `Bash` - Command execution
- `general-purpose` - Research and multi-step tasks

### 5. SSH Commands
SSH key is configured. For server commands:
```bash
ssh master_nrbudqgaus@167.71.242.157 "command here"
```

To restart Next.js server:
```bash
ssh master_nrbudqgaus@167.71.242.157 "pkill -9 -f 'node.*next' && cd ~/applications/gnhezcjyuk/public_html && source ~/.nvm/nvm.sh && nohup npm start > /tmp/next.log 2>&1 &"
```

### 6. Build Verification
Always add a visible build timestamp. In `app/layout.tsx` or footer:
```typescript
// Add to layout or visible component
const BUILD_TIME = new Date().toISOString();
console.log('[BUILD]', BUILD_TIME);
// Or render: <span style={{fontSize: '10px', opacity: 0.5}}>{BUILD_TIME}</span>
```

### 7. Deployment Checklist
1. ✅ Test locally with `npm run dev`
2. ✅ Verify fix works in browser
3. ✅ Commit with clear message
4. ✅ Push to GitHub
5. ✅ SSH to server: `git pull && npm run build`
6. ✅ Restart server: `pkill -9 -f 'node.*next' && npm start`
7. ✅ Verify build timestamp changed on live site

---

## Session Handoffs

Three focused sessions available in `/handoffs/`:

| Session | File | Focus |
|---------|------|-------|
| 1 | `SESSION-1-photo-upload.md` | Fix photo upload 500 error |
| 2 | `SESSION-2-mobile-map.md` | Fix mobile map + non-geocoded customers |
| 3 | `SESSION-3-auth-login.md` | Fix mobile login loop |

**To start a session:** Copy contents of `CLAUDE_SESSION_PROMPT.md` + the relevant `SESSION-X-*.md` file as your first message.

---

## Key Files Reference

| Feature | Files |
|---------|-------|
| Photo Upload | `components/activity-form.tsx`, `app/api/photos/route.ts` |
| Mobile Map | `components/mobile-customer-view.tsx`, `components/customer-map.tsx` |
| Auth/Login | `app/login/page.tsx`, `middleware.ts`, `lib/supabase/server.ts` |
| Activities | `app/api/activities/route.ts`, `components/activity-form.tsx` |
| OCR | `app/api/ocr/route.ts`, `lib/ocr/tesseract-server.ts` |
| Customers API | `app/api/customers/route.ts`, `app/api/customers/coordinates/route.ts` |

---

## Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_APP_URL=
```
