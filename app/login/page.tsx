/**
 * Login Page
 * Email/password authentication with Supabase
 * Session is automatically stored in cookies by @supabase/ssr browser client
 */

'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (data.user && data.session) {
        // @supabase/ssr browser client automatically stores session in cookies
        // Show debug info on screen, then redirect after 5 seconds
        const cookies = document.cookie;
        const cookieNames = cookies ? cookies.split(';').map(c => c.trim().split('=')[0]) : ['(none)'];
        const info = [
          `✅ Auth success: ${data.user.email}`,
          `🔑 Token present: ${!!data.session.access_token}`,
          `🍪 Cookies found: ${cookieNames.length}`,
          `📋 Cookie names: ${cookieNames.join(', ')}`,
          `🔗 Redirecting to: ${redirectTo} in 8s...`,
        ].join('\n');
        setDebugInfo(info);
        setLoading(false);
        // Wait 8 seconds so user can screenshot, then redirect
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 8000);
      } else {
        setError('Authentication failed. Please try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[LOGIN] Unexpected error:', err);
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Thirst Metrics Texas</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        {debugInfo && (
          <div style={{ padding: '12px', background: '#e8f5e9', color: '#1b5e20', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {debugInfo}
          </div>
        )}

        {error && (
          <div style={styles.error}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={styles.button}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={styles.footer}>
          Don't have an account?{' '}
          <a href="/signup" style={styles.link}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: 'white',
    borderRadius: '8px',
    padding: '40px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#333',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '32px',
    textAlign: 'center' as const,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '16px',
    transition: 'border-color 0.2s',
  },
  button: {
    padding: '12px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    transition: 'background 0.2s',
    marginTop: '8px',
  },
  error: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '20px',
    fontSize: '14px',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center' as const,
    color: '#666',
    fontSize: '14px',
  },
  link: {
    color: '#667eea',
    fontWeight: '500',
    textDecoration: 'underline',
  },
};
