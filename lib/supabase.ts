
import { createClient } from '@supabase/supabase-js';

// Supabase configuration for MODERNIST storefront
const supabaseUrl = 'https://nqtmajhemeafigwrbyay.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xdG1hamhlbWVhZmlnd3JieWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzA4OTAsImV4cCI6MjA4NjU0Njg5MH0.AP1b2xREgVqIOf2pgDIhyIZQafudQuyv7xBrprhd2pc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
