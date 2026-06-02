import { useState } from 'react';
import { signIn } from '../lib/useAuth.js';
import RonnocoLogo from './RonnocoLogo.jsx';

/**
 * LoginScreen — minimal centered sign-in card.
 *
 * v30: stripped to just the logo + email/password form. No two-panel
 * marketing layout, no welcome copy, no footnote. The product is an
 * internal tool; once you're past this screen you know exactly where
 * you are, so the login page doesn't need to sell the product to you.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page-50 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo header */}
        <div className="flex justify-center mb-8">
          <RonnocoLogo variant="on-light" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-page-200 rounded-lg shadow-card p-6 md:p-8"
          autoComplete="on"
        >
          <label className="block mb-5">
            <span className="block text-xs uppercase tracking-wider text-slate-600 mb-2 font-medium">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-page-200 rounded
                         focus:bg-white focus:border-navy-500 focus:outline-none
                         focus:ring-2 focus:ring-navy-500/10
                         transition-colors text-slate-900"
              placeholder="you@ronnoco.com"
            />
          </label>

          <label className="block mb-6">
            <span className="block text-xs uppercase tracking-wider text-slate-600 mb-2 font-medium">
              Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-page-200 rounded
                         focus:bg-white focus:border-navy-500 focus:outline-none
                         focus:ring-2 focus:ring-navy-500/10
                         transition-colors text-slate-900"
            />
          </label>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-navy-900 text-chalk-50 font-medium tracking-wide
                       hover:bg-navy-800 active:bg-navy-700 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       rounded"
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>
      </div>
    </div>
  );
}
