import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const PasswordReset: React.FC = () => {
  const { recoveryTokens, loading, updatePasswordAfterRecovery, setAuthModalOpen } = useAuth();
  const { addToast } = useStore();
  const navigate = useNavigate();
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if no recovery tokens
  useEffect(() => {
    const hash = window.location.hash;
    
    if (!loading && !hash.includes('access_token') && !recoveryTokens) {
      // No recovery tokens, redirect to home
      console.log('No recovery tokens, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [loading, recoveryTokens, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match.', 'error');
      return;
    }

    if (newPassword.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }

    if (!recoveryTokens) {
      addToast('Recovery session expired. Please request a new password reset.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('Starting password update...');
      
      await updatePasswordAfterRecovery(newPassword);
      
      console.log('Password updated successfully, redirecting to home...');
      
      addToast('Password reset successfully! Please log in with your new password.', 'success');
      
      // Redirect to home page (user is NOT logged in)
      setTimeout(() => {
        // Clean redirect - removes recovery tokens from URL
        window.location.replace(window.location.origin + '/#/');
      }, 1500);
    } catch (err: any) {
      const errorMsg = err?.message || 'Password reset failed.';
      console.error('Password reset error:', err);
      addToast(errorMsg, 'error');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-8">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 animate-pulse">
          Verifying recovery link...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white border border-black p-10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 border border-black mb-6">
            <Shield size={32} strokeWidth={1} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 mb-2 font-bold">The Atelier</p>
          <h1 className="font-serif-elegant text-4xl font-bold uppercase tracking-tighter">
            Recovery
          </h1>
          <p className="text-[9px] uppercase tracking-widest text-gray-500 mt-4">
            Set your new password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            required
            type="password"
            placeholder="NEW PASSWORD"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border-b border-black/10 focus:border-black outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent transition-colors placeholder:text-gray-300"
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          
          <input
            required
            type="password"
            placeholder="CONFIRM NEW PASSWORD"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border-b border-black/10 focus:border-black outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent transition-colors placeholder:text-gray-300"
            autoComplete="new-password"
            disabled={isSubmitting}
          />

          <button 
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-black text-white py-5 text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-white hover:text-black border border-black transition-all flex items-center justify-center space-x-2 mt-8 disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Updating...' : 'Reset Password'}</span>
            {!isSubmitting && <ArrowRight size={14} />}
          </button>
        </form>

        <p className="mt-12 text-[8px] uppercase tracking-widest text-center text-gray-400 leading-loose">
          After resetting your password, you will need to log in with your new credentials.
        </p>
      </div>
    </div>
  );
};

export default PasswordReset;
