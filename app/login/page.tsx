/**
 * Login Page
 * Email/password authentication with Supabase
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug: Check Supabase client initialization
  useEffect(() => {
    console.log('[LOGIN] Component mounted');
    console.log('[LOGIN] Supabase client:', supabase);
    console.log('[LOGIN] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    // Check current session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[LOGIN] Current session:', session);
      console.log('[LOGIN] Session error:', error);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    console.log('[LOGIN] Starting login process');
    console.log('[LOGIN] Email:', email);
    console.log('[LOGIN] Redirect to:', redirectTo);

    try {
      console.log('[LOGIN] Calling supabase.auth.signInWithPassword...');
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[LOGIN] Sign in response received');
      console.log('[LOGIN] Error:', signInError);
      console.log('[LOGIN] Data:', data);
      console.log('[LOGIN] User:', data?.user);
      console.log('[LOGIN] Session:', data?.session);

      if (signInError) {
        console.log('[LOGIN] Sign in error detected:', signInError.message);
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (data.user && data.session) {
        console.log('[LOGIN] User authenticated successfully');
        console.log('[LOGIN] User ID:', data.user.id);
        console.log('[LOGIN] User email:', data.user.email);
        console.log('[LOGIN] Session exists:', !!data.session);
        console.log('[LOGIN] Session token:', data.session.access_token ? 'Present' : 'Missing');
        
        // Verify session is set in Supabase client
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        console.log('[LOGIN] Current session after login:', currentSession ? 'Present' : 'Missing');
        
        if (!currentSession) {
          console.error('[LOGIN] Session not set after login!');
          setError('Session not established. Please try again.');
          setLoading(false);
          return;
        }
        
        // Sync session to cookies for middleware access
        console.log('[LOGIN] Syncing session to cookies...');
        try {
          const syncResponse = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token,
            }),
          });
          
          if (!syncResponse.ok) {
            console.error('[LOGIN] Failed to sync session to cookies');
          } else {
            console.log('[LOGIN] Session synced to cookies successfully');
          }
        } catch (syncError) {
          console.error('[LOGIN] Error syncing session:', syncError);
        }
        
        // Set loading to false before redirect
        setLoading(false);
        
        // Wait a moment to ensure cookies are set
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('[LOGIN] Redirecting to:', redirectTo);
        
        // Use window.location for full page reload to ensure cookies are sent with request
        // This ensures middleware can read the session cookies
        window.location.href = redirectTo;
        console.log('[LOGIN] window.location.href set to:', redirectTo);
      } else {
        console.log('[LOGIN] No user in response data');
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
