'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', full_name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await auth.register(form.email, form.full_name, form.password);
      localStorage.setItem('kb_access_token', data.access_token);
      localStorage.setItem('kb_refresh_token', data.refresh_token);
      router.push('/library');
    } catch (err: any) {
      setError('Registration failed. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  }, [form, router]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(39,215,161,0.1) 0%, transparent 70%), #0B1020',
      padding: '24px',
    }}>
      <div className="fade-rise" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '52px', height: '52px', borderRadius: '15px',
            background: 'linear-gradient(135deg, #5B8CFF, #27D7A1)', marginBottom: '14px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '4px' }}>Create your account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Start building your second brain</p>
        </div>

        <div className="glass-card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {(['full_name', 'email', 'password'] as const).map(k => (
              <div key={k}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {k === 'full_name' ? 'Full name' : k.charAt(0).toUpperCase() + k.slice(1)}
                </label>
                <input id={`register-${k}`} type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
                  value={form[k]} onChange={set(k)}
                  className="input" placeholder={k === 'full_name' ? 'Jane Doe' : k === 'email' ? 'you@example.com' : '••••••••'}
                  required minLength={k === 'password' ? 8 : undefined} />
              </div>
            ))}

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,93,115,0.1)', border: '1px solid rgba(255,93,115,0.25)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}
            <button id="register-submit" type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: 'center', marginTop: '4px' }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}<Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
