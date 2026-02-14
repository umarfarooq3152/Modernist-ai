
-- Fix RLS Infinite Recursion & Deadlocks

-- 1. Products: Allow public read access without ANY conditions
-- (This fixes the main hanging issue where product fetch waits for auth)
DROP POLICY IF EXISTS "Enable read access for all users" ON products;
DROP POLICY IF EXISTS "Public Read" ON products;

CREATE POLICY "Public Read"
ON products FOR SELECT
TO public
USING (true);

-- 2. Profiles: Simplify to basic owner check
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Public profiles are viewable by everyone"
ON profiles FOR SELECT
TO public
USING (true);

CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- 3. Storage: Ensure public access to product images
-- (Sometimes hanging is due to storage policy checks)
/* Note: Storage policies are handled in storage.objects, not here, 
   but ensuring products are public usually fixes the main app load. */
