'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router   = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.role === 'superadmin') {
          router.push('/admin');
        } else if (data.role === 'store') {
          router.push('/store/dashboard');
        }
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     'linear-gradient(135deg, #FDFBF3 0%, #F5E6B2 60%, #E8D5A3 100%)',
        padding:        '1rem',
        fontFamily:     'Inter, sans-serif'
      }}
    >
      <div
        style={{
          background:   '#ffffff',
          borderRadius: '24px',
          boxShadow:    '0 20px 60px rgba(212,175,55,0.18)',
          border:       '1px solid #E8D5A3',
          padding:      '2.75rem 2.5rem',
          width:        '100%',
          maxWidth:     '460px'
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1.25rem' }}>
          <img
            src="/sairik-logo.jpg"
            alt="SAIRIK"
            style={{ height: '220px', width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            textAlign:    'center',
            fontSize:     '1.75rem',
            fontWeight:   '800',
            color:        '#1A1A1A',
            marginBottom: '0.3rem'
          }}
        >
          Store Portal
        </h1>

        {/* Subtitle */}
        <p
          style={{
            textAlign:    'center',
            fontSize:     '0.875rem',
            color:        '#9CA3AF',
            marginBottom: '2rem'
          }}
        >
          Sign in to continue
        </p>

        {/* Gold line accent */}
        <div style={{ width: '40px', height: '2px', background: '#D4AF37', margin: '0 auto 1.75rem' }} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="username"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: '#6B6B6B', marginBottom: '0.4rem' }}
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid #E8D5A3', borderRadius: '12px',
                padding: '0.65rem 1rem', background: '#fff',
                color: '#1A1A1A', fontSize: '0.95rem',
                outline: 'none', transition: 'border-color 0.2s'
              }}
              onFocus={e => (e.target.style.borderColor = '#D4AF37')}
              onBlur={e  => (e.target.style.borderColor = '#E8D5A3')}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: '#6B6B6B', marginBottom: '0.4rem' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid #E8D5A3', borderRadius: '12px',
                padding: '0.65rem 1rem', background: '#fff',
                color: '#1A1A1A', fontSize: '0.95rem',
                outline: 'none', transition: 'border-color 0.2s'
              }}
              onFocus={e => (e.target.style.borderColor = '#D4AF37')}
              onBlur={e  => (e.target.style.borderColor = '#E8D5A3')}
            />
          </div>

          {/* Error — keep red */}
          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width:           '100%',
              background:      loading ? '#C9A84C' : '#D4AF37',
              color:           '#fff',
              border:          'none',
              borderRadius:    '12px',
              padding:         '0.75rem',
              fontSize:        '1rem',
              fontWeight:      '700',
              letterSpacing:   '0.05em',
              cursor:          loading ? 'not-allowed' : 'pointer',
              marginTop:       '0.5rem',
              transition:      'background 0.2s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
