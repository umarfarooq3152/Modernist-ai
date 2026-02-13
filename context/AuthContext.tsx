
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User, Session } from '@supabase/supabase-js';

export interface PatronProfile {
  id: string;
  role: string;
  avatar_url: string | null;
  saved_address: string | null;
  saved_city: string | null;
  saved_postal: string | null;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: PatronProfile | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
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

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Profile retrieval failed:", err);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      setSession(initialSession);
      const currentUser = initialSession?.user ?? null;
      setUser(currentUser);
      if (currentUser) await fetchProfile(currentUser.id);
      setLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
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
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const logout = async () => {
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
    
    // Path: public/${userId}/avatar.png for uniqueness
    const fileExt = file.name.split('.').pop();
    const filePath = `public/${user.id}/avatar-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { 
        upsert: true,
        cacheControl: '3600',
        contentType: file.type
      });

    if (uploadError) {
      console.error("Storage upload failed:", uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Persist to profiles table picture_url/avatar_url column
    await updateProfile({ avatar_url: publicUrl });
    return publicUrl;
  };

  return (
    <AuthContext.Provider value={{ 
      user, session, profile, loading, loginWithGoogle, registerWithEmail,
      loginWithEmail, resetPassword, logout, updateProfile, uploadAvatar,
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
