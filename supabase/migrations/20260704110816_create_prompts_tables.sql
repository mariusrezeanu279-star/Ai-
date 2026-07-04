/*
# Create Prompts Tables for Prompt Alchemist

1. New Tables
- `saved_prompts` - Stores user-saved optimized prompts
  - `id` (uuid, primary key)
  - `original_prompt` (text, not null) - The user's original input
  - `optimized_prompt` (text, not null) - The AI-enhanced prompt
  - `ai_model` (text, not null) - Target AI model (grok, midjourney, etc.)
  - `mode` (text, not null) - stealth or bold
  - `video_quality` (text) - 420p or 720p
  - `duration` (integer) - 5, 10, or 15 seconds
  - `image_count` (text) - auto, 4, 8, or 12
  - `user_label` (text) - Optional user-provided label
  - `is_favorite` (boolean, default false) - Bookmark flag
  - `created_at` (timestamp)

- `community_prompts` - Community-contributed successful prompt templates
  - `id` (uuid, primary key)
  - `original_prompt` (text, not null)
  - `optimized_prompt` (text, not null)
  - `ai_model` (text, not null)
  - `mode` (text, not null)
  - `success_rate` (integer) - Estimated success percentage
  - `upvotes` (integer, default 0) - Community rating
  - `contributor_name` (text) - Optional contributor attribution
  - `created_at` (timestamp)

2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD because the data is intentionally shared/public (single-tenant app).
*/

CREATE TABLE IF NOT EXISTS saved_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_prompt text NOT NULL,
  optimized_prompt text NOT NULL,
  ai_model text NOT NULL,
  mode text NOT NULL DEFAULT 'stealth',
  video_quality text DEFAULT '720p',
  duration integer DEFAULT 10,
  image_count text DEFAULT 'auto',
  user_label text,
  is_favorite boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_prompt text NOT NULL,
  optimized_prompt text NOT NULL,
  ai_model text NOT NULL,
  mode text NOT NULL DEFAULT 'stealth',
  success_rate integer DEFAULT 90,
  upvotes integer DEFAULT 0,
  contributor_name text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_prompts_model ON saved_prompts(ai_model);
CREATE INDEX IF NOT EXISTS idx_saved_prompts_created ON saved_prompts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_prompts_model ON community_prompts(ai_model);
CREATE INDEX IF NOT EXISTS idx_community_prompts_upvotes ON community_prompts(upvotes DESC);

ALTER TABLE saved_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_saved_prompts" ON saved_prompts;
CREATE POLICY "anon_select_saved_prompts" ON saved_prompts FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_saved_prompts" ON saved_prompts;
CREATE POLICY "anon_insert_saved_prompts" ON saved_prompts FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_saved_prompts" ON saved_prompts;
CREATE POLICY "anon_update_saved_prompts" ON saved_prompts FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_saved_prompts" ON saved_prompts;
CREATE POLICY "anon_delete_saved_prompts" ON saved_prompts FOR DELETE
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_community_prompts" ON community_prompts;
CREATE POLICY "anon_select_community_prompts" ON community_prompts FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_community_prompts" ON community_prompts;
CREATE POLICY "anon_insert_community_prompts" ON community_prompts FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_community_prompts" ON community_prompts;
CREATE POLICY "anon_update_community_prompts" ON community_prompts FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_community_prompts" ON community_prompts;
CREATE POLICY "anon_delete_community_prompts" ON community_prompts FOR DELETE
TO anon, authenticated USING (true);