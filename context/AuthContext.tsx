import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

export interface PatronProfile {
  id: string;
  role: string;
  avatar_url: string | null;
  picture_url: string | null;
  saved_address: string | null;
  saved_city: string | null;
  saved_postal: string | null;
  first_name: string | null;
  last_name: string | null;
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: PatronProfile | null;
  loading: boolean;
  recoveryTokens: { access: string; refresh: string } | null;
  loginWithGoogle: () => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updatePasswordAfterRecovery: (newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<PatronProfile>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  isAuthModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PatronProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const recoverySessionSet = React.useRef(false);
  const isUpdatingRecoveryPassword = React.useRef(false);
  const [recoveryTokens, setRecoveryTokens] = useState<{ access: string; refresh: string } | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      // Race against 5s timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );

      // Add timestamp to prevent caching issues
      const { data, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        timeoutPromise
      ]) as any;

      if (error) {
        // Profile doesn't exist - create one
        if (error.code === 'PGRST116') {
          console.log('Profile not found, creating new profile with user data...');

          // Get current user data from auth.users to populate profile
          const { data: { user: authUser } } = await supabase.auth.getUser();

          // Extract name and email from user metadata
          let firstName = null;
          let lastName = null;
          let email = authUser?.email || null;

          if (authUser?.user_metadata) {
            // For Google OAuth: full_name, avatar_url, picture
            // For email signup: full_name, display_name
            const fullName = authUser.user_metadata.full_name || authUser.user_metadata.display_name || '';
            const nameParts = fullName.trim().split(' ');

            if (nameParts.length > 0) {
              firstName = nameParts[0];
              if (nameParts.length > 1) {
                lastName = nameParts.slice(1).join(' ');
              }
            }
          }

          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: userId,
                role: 'user',
                email: email,
                first_name: firstName,
                last_name: lastName,
                picture_url: authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture || null
              }
            ])
            .select()
            .single();

          if (insertError) {
            console.error('Failed to create profile:', insertError);
            console.log('Profile creation failed. Please run FIX_PROFILES_TABLE.sql in Supabase SQL Editor.');
            // Set empty profile to prevent infinite loading
            setProfile({ id: userId, role: 'user', email, first_name: firstName, last_name: lastName } as PatronProfile);
          } else {
            console.log('Profile created successfully:', newProfile);
            setProfile(newProfile);
          }
        } else {
          console.error('Profile fetch error:', error);
          // Set empty profile to prevent infinite loading
          setProfile({ id: userId, role: 'user' } as PatronProfile);
        }
      } else if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Profile retrieval failed:", err);
      // Set empty profile to prevent infinite loading
      setProfile({ id: userId, role: 'user' } as PatronProfile);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const hash = window.location.hash;
        const search = window.location.search;

        console.log('Checking session - Hash:', hash.substring(0, 50), 'Search:', search.substring(0, 50));

        // Handle password recovery tokens ONLY (don't login user)
        if (hash.includes('access_token') && hash.includes('type=recovery')) {
          console.log('Recovery tokens detected - storing for password reset only');

          if (recoverySessionSet.current) {
            console.log('Recovery tokens already processed, skipping...');
            setLoading(false);
            return;
          }

          recoverySessionSet.current = true;

          const tokenStart = hash.indexOf('access_token');
          if (tokenStart > 0) {
            const paramsString = hash.substring(tokenStart);
            const params = new URLSearchParams(paramsString);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
              console.log('Storing recovery tokens (NOT logging in)...');
              setRecoveryTokens({ access: accessToken, refresh: refreshToken });

              if (isMounted) {
                setLoading(false);
              }
              return;
            }
          }
        }

        // OAuth login or normal session check
        if (search.includes('access_token') || hash.includes('access_token')) {
          console.log('OAuth callback detected - Supabase will auto-establish session');
        }

        // Get session (automatically handles OAuth tokens from URL)
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        console.log('Session check result:', !!initialSession, initialSession?.user?.email);

        if (initialSession) {
          console.log('Session found! Setting user and fetching profile...');
        } else {
          console.log('No active session');
        }

        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          await fetchProfile(currentUser.id);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Session check failed:', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // Ignore auth state changes during password recovery update
      if (isUpdatingRecoveryPassword.current) {
        console.log('Ignoring auth state change during password recovery:', event);
        return;
      }

      console.log('Auth state change event:', event, 'Session exists:', !!session, 'User:', session?.user?.email);

      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        console.log('User authenticated:', currentUser.email);
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });
    if (error) {
      console.error('Google OAuth error:', error);
      throw error;
    }
    setAuthModalOpen(false);
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name, display_name: name } }
    });
    if (error) throw error;
    setAuthModalOpen(false);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    setAuthModalOpen(false);
  };

  const resetPassword = async (email: string) => {
    // Get the current origin dynamically (works for both dev and production)
    const redirectUrl = `${window.location.origin}/#/password-reset`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) throw error;
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user?.email) throw new Error('User not authenticated');

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (signInError) {
      throw new Error('Current password is incorrect');
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) throw updateError;
  };

  const updatePasswordAfterRecovery = async (newPassword: string) => {
    if (!recoveryTokens) {
      throw new Error('No recovery tokens found. Please request a new password reset link.');
    }

    console.log('Updating password with recovery tokens (NO LOGIN)...');

    // Set flag to prevent auth state changes from logging user in
    isUpdatingRecoveryPassword.current = true;

    try {
      // Create a temporary session just for the password update
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: recoveryTokens.access,
        refresh_token: recoveryTokens.refresh
      });

      if (sessionError || !sessionData.session) {
        console.error('Failed to create temporary session:', sessionError);
        throw new Error('Recovery session expired. Please request a new password reset link.');
      }

      console.log('Temporary session created, updating password...');

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        throw updateError;
      }

      console.log('Password updated successfully! Signing out...');

      // Sign out immediately - DON'T keep user logged in
      await supabase.auth.signOut();

      console.log('Signed out successfully');

    } catch (error: any) {
      console.error('Exception during password update:', error);
      throw error;
    } finally {
      // Reset flag and clear recovery tokens
      isUpdatingRecoveryPassword.current = false;
      setRecoveryTokens(null);
      recoverySessionSet.current = false;
    }
  };

  const logout = async () => {
    // Reset recovery session flag and clear tokens
    recoverySessionSet.current = false;
    setRecoveryTokens(null);

    // Clear any recovery tokens from URL
    if (window.location.hash.includes('access_token')) {
      window.location.hash = '/';
    }

    await supabase.auth.signOut();
  };

  const updateProfile = async (updates: Partial<PatronProfile>) => {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);
    if (error) {
      console.error("Database update rejected:", error);
      throw error;
    }
    await fetchProfile(user.id);
  };

  const uploadAvatar = async (file: File) => {
    if (!user) throw new Error('Identity verification required for portrait sync.');

    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed.');
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image must be smaller than 5MB.');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `portrait-${Date.now()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    // Delete old avatar if exists (ignore errors)
    if (profile?.avatar_url) {
      try {
        const oldFilePath = profile.avatar_url.split('/').slice(-2).join('/');
        await supabase.storage.from('avatars').remove([oldFilePath]);
      } catch (err) {
        console.warn('Could not delete old avatar:', err);
      }
    }

    // Upload new avatar
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type
      });

    if (uploadError) {
      console.error("Storage upload failed:", uploadError);

      // Provide specific error messages for common RLS issues
      if (uploadError.message.includes('policy')) {
        throw new Error('Permission denied. Please check storage bucket policies (RLS). See SUPABASE_STORAGE_SETUP.md');
      }

      throw new Error(uploadError.message || 'Upload failed. Please check storage bucket configuration.');
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('Failed to retrieve public URL. Ensure the bucket is public.');
    }

    // Update profile with new avatar URL
    await updateProfile({
      avatar_url: publicUrl,
      picture_url: publicUrl
    });

    return publicUrl;
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading, recoveryTokens, loginWithGoogle, registerWithEmail,
      loginWithEmail, resetPassword, changePassword, updatePasswordAfterRecovery, logout, updateProfile, uploadAvatar,
      isAuthModalOpen, setAuthModalOpen, refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};