# Claude Code Session: Authentication & Login Flow

## Quick Start
```bash
cd C:\thirst-metrics-texas
npm run dev
```
Test at: http://localhost:3000/login

---

## Project Context
**App:** Thirst Metrics Texas - Sales CRM for beverage distribution
**Stack:** Next.js 14, TypeScript, Supabase Auth (cookie-based sessions)
**Repo:** `C:\thirst-metrics-texas`

## Server (only deploy after local verification)
- **Host:** 167.71.242.157 | **User:** master_nrbudqgaus
- **SSH:** `ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157`
- **App Path:** ~/applications/gnhezcjyuk/public_html

---

## Session Rules
1. **Test locally first** - `npm run dev` before any deployment
2. **On 3rd failed fix** - STOP and research (GitHub issues, Stack Overflow, Reddit)
3. **Ask for DevTools** - Request Network/Console output immediately on errors
4. **Add build timestamp** - So user can verify correct build is live

---

## CURRENT STATE

### Desktop Login: WORKING
After server restart, desktop login works correctly.

### Mobile Login: LOOPING
User reports login loop on mobile - may be related to:
1. CPU-pegged server process (now killed)
2. Stale JS chunks being served
3. Cookie handling differences on mobile

---

## Auth Flow Architecture

```
1. User submits email/password on /login
2. supabase.auth.signInWithPassword() called (client-side)
3. On success, POST to /api/auth/sync with tokens
4. /api/auth/sync sets HTTP-only cookies
5. Redirect to /dashboard via window.location.href
6. middleware.ts checks cookies, allows/denies access
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app/login/page.tsx` | Login form, Supabase auth call, cookie sync |
| `app/api/auth/sync/route.ts` | Sets session cookies from tokens |
| `middleware.ts` | Protects routes, checks session cookies |
| `lib/supabase/client.ts` | Browser Supabase client |
| `lib/supabase/server.ts` | Server Supabase client (reads cookies) |

---

## Recent Fix Applied

**Issue:** `useSearchParams()` must be wrapped in Suspense for Next.js 14 static generation

**File:** `app/login/page.tsx`
```typescript
function LoginForm() {
  const searchParams = useSearchParams(); // This needs Suspense
  // ... form logic
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
```

---

## Debugging Mobile Login Loop

1. **Clear mobile browser cache/cookies completely**
2. **Open mobile DevTools** (Chrome remote debugging or Safari Web Inspector)
3. **Check Console for errors** during login attempt
4. **Check Network tab:**
   - Does `/api/auth/sync` return 200?
   - Are `Set-Cookie` headers present in response?
   - Is redirect happening to correct URL?
5. **Check Application tab** → Cookies - are session cookies being set?

### Common Issues:

**Stale JS chunks:**
- Browser requesting old chunk hashes that don't exist
- Fix: Hard refresh, clear cache, or restart server with fresh build

**Cookie not setting on mobile:**
- SameSite/Secure attributes may differ
- Check if HTTPS is required for cookies

**Middleware redirect loop:**
- middleware.ts might be redirecting to /login even after auth
- Add logging to middleware to trace decisions

---

## Add Logging for Debug

In `middleware.ts`:
```typescript
console.log('[Middleware]', {
  path: request.nextUrl.pathname,
  hasSession: !!session,
  cookies: request.cookies.getAll().map(c => c.name)
});
```

In `app/login/page.tsx` (already has extensive logging with `[LOGIN]` prefix)

---

## Verification Steps

1. **Start local:** `npm run dev`
2. **Test desktop:** Login → should redirect to /dashboard
3. **Test mobile emulation:** Same flow
4. **Check cookies are set** in DevTools → Application → Cookies
5. **Logout and login again** - should work without loop

---

## Deploy Command (only after local works)
```powershell
git add . && git commit -m "Fix auth flow" && git push
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "cd ~/applications/gnhezcjyuk/public_html && git pull && source ~/.nvm/nvm.sh && npm run build && pkill -9 -f 'node.*next'; nohup npm start > /tmp/next.log 2>&1 &"
```

---

## Server Process Note
The server had a CPU-pegged process that was killed. If login issues persist after deploying a fresh build, it was likely the stale process serving old code.
