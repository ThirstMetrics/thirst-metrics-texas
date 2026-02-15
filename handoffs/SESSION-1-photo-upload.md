# Claude Code Session: Photo Upload Fix

## Quick Start
```bash
cd C:\thirst-metrics-texas
npm run dev
```
Test at: http://localhost:3000

---

## Project Context
**App:** Thirst Metrics Texas - Sales CRM for beverage distribution
**Stack:** Next.js 14, TypeScript, Supabase (Auth + Storage + DB), DuckDB
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

## THE ISSUE: Photo Upload 500 Error

**Error:** `"Unexpected end of multipart data"`

**Symptoms:**
- User selects photo, form submits
- `/api/photos` returns 500
- `activity_photos` table is EMPTY
- `activity-photos` storage bucket is EMPTY

**Root Cause Identified:**
`browser-image-compression` returns a `Blob`, not a `File`. When appending Blob to FormData, it lacks proper filename/content-type metadata, causing multipart parser to fail.

**Fix Applied (needs local verification):**

File: `components/activity-form.tsx` lines ~250-265
```typescript
const compressed = await imageCompression(file, {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
});
// Convert Blob to File with proper metadata
const compressedFile = new File(
  [compressed],
  file.name.replace(/\.[^.]+$/, '.jpg'),
  { type: 'image/jpeg', lastModified: Date.now() }
);
newPhotos.push({ file: compressedFile, type: selectedPhotoType });
```

---

## Key Files

| File | Purpose |
|------|---------|
| `components/activity-form.tsx` | Photo selection, compression, FormData creation |
| `app/api/photos/route.ts` | Server endpoint - receives FormData, uploads to Supabase |
| `lib/supabase/server.ts` | Service client with SUPABASE_SERVICE_ROLE_KEY |

---

## Verification Steps

1. **Start local dev server:** `npm run dev`
2. **Login** at http://localhost:3000/login
3. **Go to any customer** → Click "Log Activity"
4. **Attach a photo** and submit
5. **Check DevTools Network tab:**
   - `/api/photos` should return 200
   - Response should include `photo_url`
6. **Check Supabase:**
   - `activity_photos` table should have new row
   - `activity-photos` bucket should have file

---

## If Still Broken

Check these in order:

1. **Console errors in browser?** - Share them
2. **Network tab - what's the actual 500 response body?**
3. **Is SUPABASE_SERVICE_ROLE_KEY in `.env.local`?**
4. **Try uploading a small PNG instead of JPEG**
5. **Add logging to `app/api/photos/route.ts`:**
```typescript
console.log('[Photos API] Received file:', file?.name, file?.size, file?.type);
```

---

## Deploy Command (only after local works)
```powershell
git add . && git commit -m "Fix photo upload" && git push
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "cd ~/applications/gnhezcjyuk/public_html && git pull && source ~/.nvm/nvm.sh && npm run build && pkill -9 -f 'node.*next'; nohup npm start > /tmp/next.log 2>&1 &"
```
