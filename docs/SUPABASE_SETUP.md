# Supabase Project Setup Instructions

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in to your account
3. Click **"New Project"**
4. Fill in the project details:
   - **Name**: `thirst-metrics-texas` (or your preferred name)
   - **Database Password**: Generate a strong password (save this securely)
   - **Region**: Choose closest to your users (e.g., `US East` or `US West`)
   - **Pricing Plan**: Free tier is sufficient for beta
5. Click **"Create new project"**
6. Wait 2-3 minutes for project initialization

## Step 2: Get API Keys

1. Once project is ready, go to **Settings** → **API**
2. Copy the following values to your `.env.local` file:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Step 3: Set Up Storage Bucket

1. Go to **Storage** in the Supabase dashboard
2. Click **"New bucket"**
3. Create bucket with these settings:
   - **Name**: `activity-photos`
   - **Public bucket**: ✅ **Checked** (photos need to be accessible)
   - **File size limit**: 1 MB (photos are compressed client-side to 500KB)
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`
4. Click **"Create bucket"**

## Step 4: Configure Storage Policies (RLS)

1. Go to **Storage** → **Policies** → `activity-photos`
2. Click **"New Policy"**
3. Create a policy for **INSERT** (upload):
   - **Policy name**: `Allow authenticated users to upload photos`
   - **Allowed operation**: `INSERT`
   - **Policy definition**:
     ```sql
     (bucket_id = 'activity-photos'::text) AND (auth.role() = 'authenticated'::text)
     ```
4. Create a policy for **SELECT** (read):
   - **Policy name**: `Allow authenticated users to read photos`
   - **Allowed operation**: `SELECT`
   - **Policy definition**:
     ```sql
     (bucket_id = 'activity-photos'::text) AND (auth.role() = 'authenticated'::text)
     ```
5. Create a policy for **DELETE** (optional, for cleanup):
   - **Policy name**: `Allow users to delete their own photos`
   - **Allowed operation**: `DELETE`
   - **Policy definition**:
     ```sql
     (bucket_id = 'activity-photos'::text) AND (auth.role() = 'authenticated'::text)
     ```

## Step 5: Run Database Schema

1. Go to **SQL Editor** in Supabase dashboard
2. Open `docs/schema.sql` from this project
3. Copy the entire PostgreSQL schema section (lines for PostgreSQL tables only)
4. Paste into SQL Editor
5. Click **"Run"** or press `Ctrl+Enter`
6. Verify all tables were created:
   - Go to **Table Editor**
   - You should see: `users`, `territories`, `sales_activities`, `activity_photos`, `goals`, `customer_priorities`

## Step 6: Set Up Row Level Security (RLS)

After creating tables, enable RLS on sensitive tables:

### Enable RLS on all tables:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_priorities ENABLE ROW LEVEL SECURITY;
```

### Create RLS Policies

**Users table** - Users can only see/update their own record:
```sql
-- Users can read their own record
CREATE POLICY "Users can read own record"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own record
CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

**Sales Activities** - Users can only see/modify their own activities:
```sql
-- Users can read their own activities
CREATE POLICY "Users can read own activities"
  ON sales_activities FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own activities
CREATE POLICY "Users can insert own activities"
  ON sales_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own activities
CREATE POLICY "Users can update own activities"
  ON sales_activities FOR UPDATE
  USING (auth.uid() = user_id);

-- Managers and admins can read all activities
CREATE POLICY "Managers can read all activities"
  ON sales_activities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('manager', 'admin')
    )
  );
```

**Activity Photos** - Users can only access photos for their own activities:
```sql
-- Users can read photos for their own activities
CREATE POLICY "Users can read own activity photos"
  ON activity_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sales_activities
      WHERE sales_activities.id = activity_photos.activity_id
      AND sales_activities.user_id = auth.uid()
    )
  );

-- Users can upload photos for their own activities
CREATE POLICY "Users can insert own activity photos"
  ON activity_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales_activities
      WHERE sales_activities.id = activity_photos.activity_id
      AND sales_activities.user_id = auth.uid()
    )
  );
```

**Goals** - Users can only see/modify their own goals:
```sql
-- Users can read their own goals
CREATE POLICY "Users can read own goals"
  ON goals FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own goals
CREATE POLICY "Users can insert own goals"
  ON goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own goals
CREATE POLICY "Users can update own goals"
  ON goals FOR UPDATE
  USING (auth.uid() = user_id);
```

**Customer Priorities** - All authenticated users can read (this is computed data):
```sql
-- All authenticated users can read priorities
CREATE POLICY "Authenticated users can read priorities"
  ON customer_priorities FOR SELECT
  USING (auth.role() = 'authenticated');
```

## Step 7: Configure Authentication

1. Go to **Authentication** → **Settings**
2. Configure email settings:
   - **Site URL**: Your production URL (or `http://localhost:3000` for development)
   - **Redirect URLs**: Add your app URLs
3. (Optional) Configure email templates for signup/password reset

## Step 8: Verify Setup

Run these queries in SQL Editor to verify:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check indexes were created
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## Next Steps

1. Update `.env.local` with your Supabase credentials
2. Run ingestion scripts to load data
3. Test authentication in your Next.js app

## Troubleshooting

**Issue**: "relation does not exist" errors
- **Solution**: Make sure you ran the schema.sql file completely

**Issue**: RLS blocking all queries
- **Solution**: Check that policies are created correctly and user is authenticated

**Issue**: Storage upload fails
- **Solution**: Verify bucket exists, is public, and policies allow INSERT

**Issue**: Can't see other users' data as manager
- **Solution**: Check manager role is set correctly in `users` table
