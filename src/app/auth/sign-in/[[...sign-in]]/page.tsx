'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
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
        minHeight:       '100vh',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        background:      'linear-gradient(135deg, #FDFBF3 0%, #fde68a 30%, #fdba74 70%, #fb923c 100%)',
        padding:         '1rem'
      }}
    >
      <div
        style={{
          background:   '#ffffff',
          borderRadius: '1rem',
          boxShadow:    '0 20px 60px rgba(0,0,0,0.15)',
          padding:      '2.5rem 2rem',
          width:        '100%',
          maxWidth:     '400px'
        }}
      >
        {/* Icon */}
        <div style={{ textAlign: 'center', fontSize: '3rem', marginBottom: '0.5rem' }}>
          🌸
        </div>

        {/* Title */}
        <h1
          style={{
            textAlign:   'center',
            fontSize:    '1.75rem',
            fontWeight:  '700',
            color:       '#1A1A1A',
            marginBottom:'0.25rem'
          }}
        >
          Store Portal
        </h1>

        {/* Subtitle */}
        <p
          style={{
            textAlign:    'center',
            fontSize:     '0.875rem',
            color:        '#6b7280',
            marginBottom: '1.75rem'
          }}
        >
          Sign in to continue
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Error message */}
          {error && (
            <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>
              {error}
            </p>
          )}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={loading}
            style={{
              width:           '100%',
              backgroundColor: loading ? '#D4AF37' : '#D4AF37',
              color:           '#ffffff',
              border:          'none',
              borderRadius:    '0.5rem',
              padding:         '0.65rem',
              fontSize:        '1rem',
              fontWeight:      '600',
              cursor:          loading ? 'not-allowed' : 'pointer',
              marginTop:       '0.5rem'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
