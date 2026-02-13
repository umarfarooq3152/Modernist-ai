import { supabase } from './supabase';

/**
 * Quick diagnostic for loading state issues
 * Run in browser console: window.diagnoseProfile()
 */
export async function diagnoseLoadingIssue() {
  console.log('🔍 Diagnosing Profile Loading Issue...\n');

  // Check 1: Authentication
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    console.error('❌ No active session. Please log in.');
    return;
  }
  console.log('✅ Session: Active');
  console.log('   User ID:', session.user.id);
  console.log('   Email:', session.user.email);

  // Check 2: Profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (profileError) {
    console.error('❌ Profile Error:', profileError.message);
    console.error('   Code:', profileError.code);
    
    if (profileError.code === 'PGRST116') {
      console.log('\n📝 Profile not found. Attempting to create...');
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert([{
          id: session.user.id,
          role: 'user',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (createError) {
        console.error('❌ Failed to create profile:', createError.message);
        console.log('\n🔧 Action Required:');
        console.log('   1. Go to Supabase Dashboard → SQL Editor');
        console.log('   2. Run the SQL commands in supabase-setup.sql');
        console.log('   3. This will fix RLS policies');
      } else {
        console.log('✅ Profile created successfully!');
        console.log('   Refresh the page');
      }
    } else if (profileError.message.includes('policy')) {
      console.log('\n🔧 RLS Policy Issue Detected!');
      console.log('   Action Required:');
      console.log('   1. Go to Supabase Dashboard → SQL Editor');
      console.log('   2. Run this command:');
      console.log('   CREATE POLICY "Users can view own profile"');
      console.log('   ON profiles FOR SELECT TO authenticated');
      console.log('   USING (auth.uid() = id);');
      console.log('\n   OR run all policies from supabase-setup.sql file');
    }
    return;
  }

  console.log('✅ Profile: Found');
  console.log('   Data:', profile);

  // Check 3: Can update profile?
  const testData = { last_name: profile.last_name };
  const { error: updateError } = await supabase
    .from('profiles')
    .update(testData)
    .eq('id', session.user.id);

  if (updateError) {
    console.error('❌ Cannot update profile:', updateError.message);
    console.log('\n🔧 Fix: Add UPDATE policy for profiles table');
    console.log('   Run supabase-setup.sql in SQL Editor');
  } else {
    console.log('✅ Profile updates: Working');
  }

  console.log('\n✨ Diagnosis complete!');
  console.log('If profile page still loads forever, clear browser cache and re-login.');
}

// Make it globally accessible
if (typeof window !== 'undefined') {
  (window as any).diagnoseProfile = diagnoseLoadingIssue;
}

/**
 * Test Supabase storage bucket configuration
 * Run this in browser console: window.testStorage()
 */
export async function testStorageBucket() {
  console.log('🧪 Testing Supabase Storage Configuration...\n');

  // Test 1: Check authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ Not authenticated. Please log in first.');
    return;
  }
  console.log('✅ Authentication: OK');
  console.log('   User ID:', user.id);

  // Test 2: List buckets
  try {
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('❌ Failed to list buckets:', bucketsError.message);
      return;
    }
    console.log('✅ Storage access: OK');
    console.log('   Available buckets:', buckets?.map(b => b.name).join(', ') || 'none');

    const avatarBucket = buckets?.find(b => b.name === 'avatars');
    if (!avatarBucket) {
      console.error('❌ Bucket "avatars" not found!');
      console.log('   📝 Action required: Create a bucket named "avatars" in Supabase Dashboard');
      console.log('   📖 See: SUPABASE_STORAGE_SETUP.md');
      return;
    }
    console.log('✅ Bucket "avatars": Found');
    console.log('   Public:', avatarBucket.public ? 'Yes' : 'No');
    
    if (!avatarBucket.public) {
      console.warn('⚠️  Bucket is not public. Public URL access may fail.');
      console.log('   📝 Action required: Make bucket public in Supabase Dashboard');
    }
  } catch (err) {
    console.error('❌ Storage test failed:', err);
    return;
  }

  // Test 3: Try a test upload
  console.log('\n🔄 Testing upload capability...');
  const testFile = new Blob(['test'], { type: 'text/plain' });
  const testPath = `${user.id}/test-${Date.now()}.txt`;
  
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(testPath, testFile);

  if (uploadError) {
    console.error('❌ Upload test failed:', uploadError.message);
    console.log('   Common causes:');
    console.log('   - RLS policies blocking upload');
    console.log('   - Bucket permissions misconfigured');
    console.log('   📖 See: SUPABASE_STORAGE_SETUP.md');
    return;
  }
  console.log('✅ Upload test: OK');

  // Test 4: Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(testPath);

  if (!publicUrl) {
    console.error('❌ Failed to get public URL');
    return;
  }
  console.log('✅ Public URL generation: OK');
  console.log('   Test URL:', publicUrl);

  // Test 5: Clean up test file
  await supabase.storage.from('avatars').remove([testPath]);
  console.log('✅ Cleanup: OK');

  console.log('\n✨ All tests passed! Avatar upload should work correctly.');
}

/**
 * Test profile table access
 */
export async function testProfileAccess() {
  console.log('🧪 Testing Profile Table Access...\n');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ Not authenticated. Please log in first.');
    return;
  }

  // Test reading profile
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (readError) {
    console.error('❌ Failed to read profile:', readError.message);
    return;
  }
  console.log('✅ Profile read: OK');
  console.log('   Profile data:', profile);

  // Test updating profile
  const testUpdate = { 
    avatar_url: `https://test.com/test-${Date.now()}.jpg`,
    picture_url: `https://test.com/test-${Date.now()}.jpg`
  };
  
  const { error: updateError } = await supabase
    .from('profiles')
    .update(testUpdate)
    .eq('id', user.id);

  if (updateError) {
    console.error('❌ Failed to update profile:', updateError.message);
    return;
  }
  console.log('✅ Profile update: OK');

  // Revert test update
  const { error: revertError } = await supabase
    .from('profiles')
    .update({ 
      avatar_url: profile.avatar_url,
      picture_url: profile.picture_url
    })
    .eq('id', user.id);

  if (revertError) {
    console.warn('⚠️  Failed to revert test update:', revertError.message);
  } else {
    console.log('✅ Cleanup: OK');
  }

  console.log('\n✨ Profile access tests passed!');
}

// Make all test functions globally accessible in browser console
if (typeof window !== 'undefined') {
  (window as any).diagnoseProfile = diagnoseLoadingIssue;
  (window as any).testStorage = testStorageBucket;
  (window as any).testProfile = testProfileAccess;
  
  console.log('🛠️ Supabase diagnostic tools loaded!');
  console.log('   diagnoseProfile() - Check loading issues');
  console.log('   testStorage() - Test avatar uploads');
  console.log('   testProfile() - Test profile access');
  console.log('   clearSupabaseCache() - Clear all cached data');
}
