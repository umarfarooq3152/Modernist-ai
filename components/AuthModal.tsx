
import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, Check, Loader2, ChevronRight, Lock, Sparkles, Mail, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

type AuthStage = 'identity' | 'verification' | 'onboarding' | 'forgot_password';

const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [stage, setStage] = useState<AuthStage>('identity');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isAuthModalOpen) {
      setStage('identity');
      setError('');
      setSuccess('');
      setLoading(false);
      setIsRegistering(false);
      // Auto-focus email after animation
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAuthModalOpen]);

  const validateEmail = (e: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  };

  const handleStageOneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Identity required.");
      return;
    }
    if (!validateEmail(email)) {
      setError("Enter a valid correspondence address.");
      return;
    }

    setError('');
    // "Fake" check to simulate enterprise lookup feel
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 600)); // 600ms artificial delay for "processing" feel
    setLoading(false);

    setStage('verification');
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (stage === 'forgot_password') {
        await resetPassword(email);
        setSuccess("Recovery protocol initiated. Check your inbox.");
        return;
      }

      if (isRegistering) {
        if (!name) throw new Error("Full name required for archival entry.");
        await registerWithEmail(email, password, name);
        // AuthContext handles closing, but we might want to show success first?
        // Usually Supabase auto-logs in, so modal will close via effect if user changes
      } else {
        try {
          await loginWithEmail(email, password);
        } catch (err: any) {
          // Behavioral Psychology: If login fails, maybe they need to register? 
          // But strict enterprise usually just says "Invalid".
          // Let's offer registration if error implies user not found, 
          // OR simply show error. 
          // Supabase "Invalid login credentials" covers both wrong password and user not found often.

          if (err.message.includes("Invalid login credentials")) {
            // If we want to be smart, we could switch to 'onboarding' if we think they don't exist?
            // But for security we shouldn't reveal existence.
            // Just show error.
            throw new Error("Identity verification failed. Check credentials.");
          }
          throw err;
        }
      }
    } catch (err: any) {
      setError(err.message || "Authentication rejected.");
    } finally {
      setLoading(false);
    }
  };

  const switchToRegister = () => {
    setError('');
    setIsRegistering(true);
    setStage('onboarding'); // Need name for registration
  };

  const switchToLogin = () => {
    setError('');
    setIsRegistering(false);
    setStage('verification');
  };

  if (!isAuthModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop with heavy blur for focus */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={() => setAuthModalOpen(false)}
      />

      {/* Main Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="relative bg-white dark:bg-[#050505] w-full max-w-lg overflow-hidden shadow-2xl border border-white/10 flex flex-col"
      >
        {/* Progress Bar (Subtle top loader) */}
        {loading && (
          <motion.div
            className="absolute top-0 left-0 right-0 h-[2px] bg-black dark:bg-white z-50 origin-left"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        <button
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-6 right-6 z-20 p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <X size={20} strokeWidth={1.5} />
        </button>

        <div className="p-10 md:p-14 flex flex-col min-h-[500px] justify-between">
          {/* Header Section */}
          <div>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-black dark:bg-white rounded-full"></span>
                The Atelier Archive
              </p>
              <h2 className="font-serif-elegant text-4xl md:text-5xl font-medium tracking-tight text-black dark:text-white mb-2">
                {stage === 'identity' ? 'Identify' :
                  stage === 'verification' ? (isRegistering ? 'Establish' : 'Verify') :
                    stage === 'onboarding' ? 'Establish' : 'Recover'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-light tracking-wide">
                {stage === 'identity' ? 'Enter your correspondence address to proceed.' :
                  stage === 'verification' ? 'Secure your session with your passkey.' :
                    stage === 'onboarding' ? 'Create your permanent curator profile.' :
                      'Reset your access credentials.'}
              </p>
            </motion.div>
          </div>

          {/* ERROR DISPLAY */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="py-2 flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-medium tracking-wide">
                  <span className="w-1 h-4 bg-red-500"></span>
                  {error}
                </div>
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="py-2 flex items-center gap-2 text-green-600 dark:text-green-400 text-xs font-medium tracking-wide">
                  <Check size={14} />
                  {success}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FORM AREA */}
          <div className="flex-grow flex flex-col justify-center py-8">
            <AnimatePresence mode="wait">
              {stage === 'identity' && (
                <motion.form
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleStageOneSubmit}
                  className="space-y-8"
                >
                  <div className="group relative">
                    <Mail className="absolute left-0 top-3 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" size={18} strokeWidth={1.5} />
                    <input
                      ref={inputRef}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="EMAIL ADDRESS"
                      className="w-full pl-8 py-3 bg-transparent border-b border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white outline-none text-base tracking-widest font-light transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700 placeholder:text-xs"
                      autoComplete="email"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <button
                      type="submit"
                      className="w-full bg-black dark:bg-white text-white dark:text-black py-4 flex items-center justify-center gap-3 hover:bg-gray-900 dark:hover:bg-gray-100 transition-all active:scale-[0.99]"
                    >
                      <span className="text-xs uppercase tracking-[0.3em] font-bold">Continue</span>
                      <ArrowRight size={14} />
                    </button>

                    <div className="text-center">
                      <span className="text-[9px] uppercase tracking-widest text-gray-400">or connect via</span>
                    </div>

                    <button
                      type="button"
                      onClick={loginWithGoogle}
                      className="w-full border border-gray-200 dark:border-gray-800 py-4 flex items-center justify-center gap-3 hover:border-black dark:hover:border-white transition-all bg-transparent group"
                    >
                      <svg className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all opacity-60 group-hover:opacity-100" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" fill="#EA4335" />
                      </svg>
                      <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-gray-500 group-hover:text-black dark:group-hover:text-white transition-colors">Google</span>
                    </button>

                    <div className="pt-4 border-t border-gray-100 dark:border-white/5 mt-2">
                      <button
                        type="button"
                        onClick={switchToRegister}
                        className="w-full text-[9px] uppercase tracking-widest text-gray-500 hover:text-black dark:hover:text-white transition-colors flex items-center justify-center gap-2 group"
                      >
                        <span>New to the Archive?</span>
                        <span className="font-bold underline decoration-transparent group-hover:decoration-current transition-all">Establish Identity</span>
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}

              {(stage === 'verification' || stage === 'onboarding' || stage === 'forgot_password') && (
                <motion.form
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleFinalSubmit}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between text-xs text-black dark:text-white border-b border-black/10 dark:border-white/10 pb-4 mb-6">
                    <span className="flex items-center gap-2 opacity-60">
                      <Check size={12} />
                      {email}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStage('identity')}
                      className="uppercase tracking-widest text-[9px] font-bold underline decoration-transparent hover:decoration-current transition-all"
                    >
                      Change
                    </button>
                  </div>

                  {stage === 'onboarding' && (
                    <div className="group relative">
                      <span className="absolute left-0 top-3 text-gray-400 text-[10px] uppercase font-bold tracking-widest">Name</span>
                      <input
                        type="text"
                        value={name}
                        autoFocus
                        onChange={(e) => setName(e.target.value)}
                        placeholder="FULL NAME"
                        className="w-full pl-16 py-3 bg-transparent border-b border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white outline-none text-base tracking-widest font-light transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700 placeholder:text-xs"
                      />
                    </div>
                  )}

                  {stage !== 'forgot_password' && (
                    <div className="group relative">
                      <Lock className="absolute left-0 top-3 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" size={18} strokeWidth={1.5} />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="PASSWORD"
                        autoFocus={!isRegistering} /* Focus password if not registering (name focused there) */
                        className="w-full pl-8 py-3 bg-transparent border-b border-gray-200 dark:border-gray-800 focus:border-black dark:focus:border-white outline-none text-base tracking-widest font-light transition-all placeholder:text-gray-300 dark:placeholder:text-gray-700 placeholder:text-xs"
                      />
                    </div>
                  )}

                  {stage === 'verification' && (
                    <div className="flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => setStage('forgot_password')}
                        className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}

                  {stage === 'verification' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-3 bg-gray-50 dark:bg-white/5 border-l-2 border-black dark:border-white text-[10px] leading-relaxed text-gray-600 dark:text-gray-400"
                    >
                      <span className="font-bold">New Curator?</span> We will attempt to verify your credentials. If you are new, you may need to <button type="button" onClick={switchToRegister} className="underline font-bold text-black dark:text-white">establish an account</button>.
                    </motion.div>
                  )}

                  {stage === 'onboarding' && (
                    <div className="p-3 bg-gray-50 dark:bg-white/5 border-l-2 border-black dark:border-white text-[10px] leading-relaxed text-gray-600 dark:text-gray-400">
                      <span className="font-bold">Returning?</span> <button type="button" onClick={switchToLogin} className="underline font-bold text-black dark:text-white">Log in here</button> if you already have an archive.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-black dark:bg-white text-white dark:text-black py-4 flex items-center justify-center gap-3 hover:bg-gray-900 dark:hover:bg-gray-100 transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <span className="text-xs uppercase tracking-[0.3em] font-bold">
                      {loading ? 'Processing...' :
                        stage === 'forgot_password' ? 'Send Reset Link' :
                          isRegistering ? 'Initialize Archive' : 'Access Archive'}
                    </span>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* Footer / Psychology Microcopy */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <div className="flex justify-center items-center gap-2 text-[8px] uppercase tracking-[0.2em] text-gray-400 mb-2">
              <Sparkles size={8} />
              <span>Secure Encryption Active</span>
            </div>
            <p className="text-[8px] uppercase tracking-widest text-gray-300 dark:text-gray-600 leading-relaxed max-w-xs mx-auto">
              By entering the archive, you accept the curation protocols and Terms of Service.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthModal;
