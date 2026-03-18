import React, { useState } from 'react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, googleProvider } from '../../infrastructure/firebase/firebaseConfig';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain' || err.message.includes('Origin not allowed')) {
        setError('Origin not allowed. Please add this app\'s URL to the Authorized Domains in your Firebase Console (Authentication > Settings > Authorized domains).');
      } else {
        setError(err.message);
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans notebook-paper relative">
      <div className="absolute inset-y-0 left-8 notebook-line hidden sm:block"></div>
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="h-14 w-14 bg-stone-800 rounded-2xl flex items-center justify-center shadow-md">
            <Lock className="h-7 w-7 text-stone-50" />
          </div>
        </div>
        <h2 className="mt-8 text-center text-4xl font-serif font-semibold text-stone-900 tracking-tight">
          Privacy Chat
        </h2>
        <p className="mt-3 text-center text-sm text-stone-600 font-medium tracking-wide uppercase">
          End-to-end encrypted, local-first messaging
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white/90 backdrop-blur-sm py-10 px-6 shadow-xl sm:rounded-3xl sm:px-12 border border-stone-200">
          <form className="space-y-6" onSubmit={handleEmailAuth}>
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Email address</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                icon={<Mail className="h-5 w-5 text-stone-400" />}
                className="bg-white border-stone-200 focus:border-stone-400 focus:ring-stone-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-1.5 uppercase tracking-wider">Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                icon={<Lock className="h-5 w-5 text-stone-400" />}
                className="bg-white border-stone-200 focus:border-stone-400 focus:ring-stone-400"
              />
            </div>

            {error && <p className="text-sm text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}

            <Button type="submit" className="w-full bg-stone-800 hover:bg-stone-900 text-white py-2.5 text-base shadow-sm">
              {isRegistering ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-stone-500 font-medium">Or continue with</span>
              </div>
            </div>

            <div className="mt-8">
              <Button
                variant="outline"
                onClick={handleGoogleSignIn}
                className="w-full border-stone-200 text-stone-700 hover:bg-stone-50 py-2.5"
              >
                <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                </svg>
                Google
              </Button>
            </div>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors"
            >
              {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
