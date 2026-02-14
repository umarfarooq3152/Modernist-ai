
import React, { useState } from 'react';
import { X, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type AuthView = 'login' | 'register' | 'forgot';

const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAuthModalOpen) return null;

  const resetStates = () => {
    setError('');
    setSuccess('');
    setLoading(false);
  };

  const handleSwitchView = (newView: AuthView) => {
    setView(newView);
    resetStates();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetStates();
    setLoading(true);

    try {
      if (view === 'login') {
        await loginWithEmail(email, password);
      } else if (view === 'register') {
        if (!name) throw new Error("Full name is required");
        await registerWithEmail(email, password, name);
      } else if (view === 'forgot') {
        await resetPassword(email);
        setSuccess("Recovery instructions sent to your email.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during archival verification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md" 
        onClick={() => setAuthModalOpen(false)} 
      />
      <div className="relative bg-white dark:bg-neutral-900 w-full max-w-md border border-black dark:border-white/20 p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-500">
        <button 
          onClick={() => setAuthModalOpen(false)}
          className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white dark:text-white dark:hover:bg-white dark:hover:text-black transition-all"
        >
          <X size={20} strokeWidth={1} />
        </button>

        <div className="text-center mb-10">
          <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 dark:text-gray-500 mb-2 font-bold">The Atelier</p>
          <h2 className="font-serif-elegant text-4xl font-bold uppercase tracking-tighter text-black dark:text-white">
            {view === 'login' ? 'Identity' : view === 'register' ? 'Establishment' : 'Recovery'}
          </h2>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 text-[10px] uppercase tracking-widest font-bold">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/50 text-green-700 dark:text-green-400 text-[10px] uppercase tracking-widest font-bold flex items-center">
            <Check size={14} className="mr-2" />
            {success}
          </div>
        )}

        <div className="space-y-6">
          {view !== 'forgot' && (
            <button 
              onClick={loginWithGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-4 border border-black dark:border-white py-4 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all group disabled:opacity-50"
            >
              <div className="w-5 h-5 bg-black dark:bg-white group-hover:bg-white dark:group-hover:bg-black transition-colors rounded-full" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Sync with Google (OAuth)</span>
            </button>
          )}

          {view !== 'forgot' && (
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/10 dark:border-white/10"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-neutral-900 px-4 text-[8px] uppercase tracking-widest text-gray-300 dark:text-gray-600 font-bold">Or</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {view === 'register' && (
              <input 
                required
                type="text" 
                placeholder="FULL NAME" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent text-black dark:text-white transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600"
              />
            )}
            <input 
              required
              type="email" 
              placeholder="EMAIL ADDRESS" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent text-black dark:text-white transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600"
            />
            {view !== 'forgot' && (
              <input 
                required
                type="password" 
                placeholder="PASSWORD" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-b border-black/10 dark:border-white/10 focus:border-black dark:focus:border-white outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent text-black dark:text-white transition-colors placeholder:text-gray-300 dark:placeholder:text-gray-600"
              />
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-black dark:bg-white text-white dark:text-black py-5 text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-white hover:text-black dark:hover:bg-transparent dark:hover:text-white border border-black dark:border-white transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Archiving...' : view === 'login' ? 'Authorize' : view === 'register' ? 'Register' : 'Send Instructions'}</span>
              {!loading && <ArrowRight size={14} />}
            </button>
          </form>

          <div className="flex flex-col space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
            {view === 'login' ? (
              <>
                <button 
                  onClick={() => handleSwitchView('register')}
                  className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-black dark:hover:text-white transition-colors text-center"
                >
                  New to MODERNIST? Establish Account
                </button>
                <button 
                  onClick={() => handleSwitchView('forgot')}
                  className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-black dark:hover:text-white transition-colors text-center"
                >
                  Forgot your credentials?
                </button>
              </>
            ) : (
              <button 
                onClick={() => handleSwitchView('login')}
                className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-black dark:hover:text-white transition-colors text-center"
              >
                Return to Login
              </button>
            )}
            
            <button 
              onClick={() => setAuthModalOpen(false)}
              className="text-[9px] uppercase tracking-[0.2em] text-black dark:text-white font-black hover:opacity-50 transition-opacity text-center"
            >
              Proceed as Guest
            </button>
          </div>
        </div>

        <p className="mt-12 text-[8px] uppercase tracking-widest text-center text-gray-400 dark:text-gray-500 leading-loose">
          By interacting, you enter the MODERNIST archive and agree to our curator terms.
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
