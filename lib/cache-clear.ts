// Clear all cached Supabase data
// Run in browser console: clearSupabaseCache()

export function clearSupabaseCache() {
  console.log('🧹 Clearing Supabase cache...');
  
  // Clear localStorage
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes('supabase') || key?.includes('sb-')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log('  ✅ Removed:', key);
  });
  
  // Clear sessionStorage
  const sessionKeysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.includes('supabase') || key?.includes('sb-')) {
      sessionKeysToRemove.push(key);
    }
  }
  
  sessionKeysToRemove.forEach(key => {
    sessionStorage.removeItem(key);
    console.log('  ✅ Removed:', key);
  });
  
  console.log(`\n✨ Cleared ${keysToRemove.length + sessionKeysToRemove.length} cached items`);
  console.log('🔄 Refresh the page now (Ctrl+Shift+R)');
}

// Auto-expose to window
if (typeof window !== 'undefined') {
  (window as any).clearSupabaseCache = clearSupabaseCache;
}
