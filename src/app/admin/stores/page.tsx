'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Store {
  id: string;
  name: string;
  location: string;
  username: string;
  is_active: boolean;
}

interface NewStore { name: string; location: string; username: string; password: string; }
interface PasswordReset { id: string; value: string; }

export default function ManageStoresPage() {
  const router = useRouter();

  const [stores,         setStores]         = useState<Store[]>([]);
  const [showAddForm,    setShowAddForm]    = useState(false);
  const [newStore,       setNewStore]       = useState<NewStore>({ name:'', location:'', username:'', password:'' });
  const [passwordReset,  setPasswordReset]  = useState<PasswordReset | null>(null);
  const [addLoading,     setAddLoading]     = useState(false);
  const [deleteConfirm,  setDeleteConfirm]  = useState<Store | null>(null);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [error,          setError]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(data => setStores(Array.isArray(data) ? data : []));
  }, []);

  // ── Add store ─────────────────────────────────────────────────────────────
  async function handleAddStore() {
    const { name, location, username, password } = newStore;
    if (!name || !location || !username || !password) {
      setError('All fields are required'); return;
    }
    setError('');
    setAddLoading(true);
    const res  = await fetch('/api/stores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStore)
    });
    const data = await res.json();
    if (res.ok) {
      setStores(s  => [...s, data]);
      setNewStore({ name:'', location:'', username:'', password:'' });
      setShowAddForm(false);
    } else {
      setError(data.error || 'Failed to create store');
    }
    setAddLoading(false);
  }

  // ── Toggle store active/inactive ──────────────────────────────────────────
  async function handleToggle(store: Store) {
    const res = await fetch(`/api/stores/${store.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !store.is_active })
    });
    if (res.ok) {
      setStores(s => s.map(s2 => s2.id === store.id ? { ...s2, is_active: !s2.is_active } : s2));
    }
  }

  // ── Delete store ──────────────────────────────────────────────────────────
  async function handleDeleteStore() {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/stores/${deleteConfirm.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setStores(s => s.filter(s2 => s2.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      setSuccessMsg(`Store "${deleteConfirm.name}" has been permanently deleted.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setError(data.error || 'Failed to delete store');
      setDeleteConfirm(null);
    }
    setDeleteLoading(false);
  }

  // ── Reset password ────────────────────────────────────────────────────────
  async function handleResetPassword() {
    if (!passwordReset || !passwordReset.value.trim()) {
      setError('Password cannot be empty'); return;
    }
    const res = await fetch(`/api/stores/${passwordReset.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordReset.value })
    });
    if (res.ok) {
      setPasswordReset(null);
      setSuccessMsg('Password reset successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to reset password');
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const activeCount   = stores.filter(s => s.is_active).length;
  const inactiveCount = stores.filter(s => !s.is_active).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F2', fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #E8D5A3',
        padding: '1rem 1.75rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        boxShadow: '0 2px 8px rgba(212,175,55,0.08)',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: '#FDFBF3', border: '1px solid #E8D5A3',
            color: '#D4AF37', borderRadius: '8px', padding: '0.35rem 0.85rem',
            cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem'
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#1A1A1A' }}>Manage Stores</h1>
          <div style={{ width: '32px', height: '2px', background: '#D4AF37', marginTop: '3px' }} />
        </div>
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── Success message ──────────────────────────────────────────── */}
        {successMsg && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac',
            color: '#16a34a', borderRadius: '0.5rem',
            padding: '0.75rem 1rem', fontWeight: '600'
          }}>
            ✅ {successMsg}
          </div>
        )}

        {/* ── Top row: title + Add button ──────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#111827', margin: 0 }}>
            All Stores ({stores.length})
          </h2>
          <button
            onClick={() => { setShowAddForm(v => !v); setError(''); }}
            style={{
              background: showAddForm ? '#FDFBF3' : '#D4AF37',
              color: showAddForm ? '#6B6B6B' : '#fff',
              border: showAddForm ? '1px solid #E8D5A3' : 'none',
              borderRadius: '10px',
              padding: '0.55rem 1.25rem', fontWeight: '700',
              cursor: 'pointer', fontSize: '0.9rem'
            }}
          >
            {showAddForm ? '✕ Cancel' : '＋ Add Store'}
          </button>
        </div>

        {/* ── ADD STORE PANEL ──────────────────────────────────────────── */}
        {showAddForm && (
          <Card style={{
            borderRadius: '12px', border: '2px solid #D4AF37',
            background: '#FDFBF3',
            boxShadow: '0 4px 16px rgba(212,175,55,0.12)'
          }}>
            <CardContent style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#1A1A1A' }}>
                Add New Store
              </h3>

              {/* 2-column grid */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.85rem', marginBottom: '1rem'
              }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Store Name *
                  </label>
                  <Input
                    placeholder="e.g. Mumbai Central"
                    value={newStore.name}
                    onChange={e => setNewStore(n => ({ ...n, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Location *
                  </label>
                  <Input
                    placeholder="City or area"
                    value={newStore.location}
                    onChange={e => setNewStore(n => ({ ...n, location: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Username *
                  </label>
                  <Input
                    placeholder="unique login name"
                    value={newStore.username}
                    onChange={e => setNewStore(n => ({ ...n, username: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Password *
                  </label>
                  <Input
                    type="password"
                    placeholder="Set initial password"
                    value={newStore.password}
                    onChange={e => setNewStore(n => ({ ...n, password: e.target.value }))}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <Button
                  onClick={handleAddStore}
                  disabled={addLoading}
                  style={{
                    background: addLoading ? '#86efac' : '#16a34a',
                    color: '#fff', border: 'none', borderRadius: '0.5rem',
                    padding: '0.5rem 1.25rem', fontWeight: '700',
                    cursor: addLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {addLoading ? 'Creating...' : 'Create Store'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowAddForm(false); setError(''); setNewStore({ name:'', location:'', username:'', password:'' }); }}
                  style={{ borderRadius: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  Cancel
                </Button>
              </div>

              {/* Error */}
              {error && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.75rem', fontWeight: '500' }}>
                  ⚠️ {error}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── STORES LIST ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {stores.map(store => (
            <Card
              key={store.id}
              style={{
                background: '#fff', border: '1px solid #E8D5A3',
                borderRadius: '12px', boxShadow: '0 4px 12px rgba(212,175,55,0.08)',
                opacity: store.is_active ? 1 : 0.65, transition: 'opacity 0.2s'
              }}
            >
              <CardContent style={{
                padding: '1rem 1.25rem',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: '1rem',
                flexWrap: 'wrap'
              }}>
                {/* Left — store info */}
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '1rem', color: '#111827' }}>
                      {store.name}
                    </span>
                    {store.is_active ? (
                      <Badge style={{
                        background: '#dcfce7', color: '#16a34a',
                        border: '1px solid #86efac', fontWeight: '600', fontSize: '0.72rem'
                      }}>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" style={{ fontWeight: '600', fontSize: '0.72rem' }}>
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0 }}>
                    📍 {store.location || '—'} &nbsp;•&nbsp; @{store.username}
                  </p>
                </div>

                {/* Right — actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>

                  {passwordReset?.id === store.id ? (
                    /* ── Inline password reset ── */
                    <>
                      <Input
                        type="password"
                        placeholder="New password"
                        value={passwordReset.value}
                        onChange={e => setPasswordReset(p => p ? { ...p, value: e.target.value } : p)}
                        style={{ width: '170px' }}
                      />
                      <button
                        onClick={handleResetPassword}
                        style={{
                          background: '#111827', color: '#fff', border: 'none',
                          borderRadius: '0.4rem', padding: '0.4rem 0.85rem',
                          fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem'
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setPasswordReset(null); setError(''); }}
                        style={{
                          background: '#f3f4f6', color: '#374151',
                          border: '1px solid #d1d5db', borderRadius: '0.4rem',
                          padding: '0.4rem 0.65rem', fontWeight: '700',
                          cursor: 'pointer', fontSize: '0.875rem'
                        }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    /* ── Normal actions ── */
                    <>
                      <button
                        onClick={() => { setPasswordReset({ id: store.id, value: '' }); setError(''); }}
                        style={{
                          background: '#FDFBF3', color: '#D4AF37',
                          border: '1px solid #E8D5A3', borderRadius: '8px',
                          padding: '0.4rem 0.85rem', fontWeight: '600',
                          cursor: 'pointer', fontSize: '0.82rem'
                        }}
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handleToggle(store)}
                        style={{
                          background: store.is_active ? '#fef2f2' : '#f0fdf4',
                          color:      store.is_active ? '#dc2626' : '#16a34a',
                          border:     store.is_active ? '1px solid #fca5a5' : '1px solid #86efac',
                          borderRadius: '0.4rem',
                          padding: '0.4rem 0.85rem', fontWeight: '700',
                          cursor: 'pointer', fontSize: '0.82rem'
                        }}
                      >
                        {store.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm(store); setError(''); }}
                        style={{
                          background: '#fef2f2', color: '#dc2626',
                          border: '1px solid #fca5a5', borderRadius: '0.4rem',
                          padding: '0.4rem 0.85rem', fontWeight: '700',
                          cursor: 'pointer', fontSize: '0.82rem'
                        }}
                      >
                        🗑 Delete
                      </button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Summary line ─────────────────────────────────────────────── */}
        {stores.length > 0 && (
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
            <span style={{ color: '#16a34a', fontWeight: '600' }}>{activeCount} active</span>,&nbsp;
            <span style={{ color: '#9ca3af', fontWeight: '600' }}>{inactiveCount} inactive</span>
          </p>
        )}

      </main>

      {/* ── DELETE CONFIRMATION MODAL ─────────────────────────────────── */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: '1rem'
        }}>
          <div style={{
            background: '#fff', borderRadius: '0.85rem',
            padding: '1.75rem', maxWidth: '420px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              <div>
                <h3 style={{ margin: 0, fontWeight: '800', fontSize: '1.1rem', color: '#111827' }}>Delete Store?</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>This action is permanent and cannot be undone.</p>
              </div>
            </div>
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: '0.5rem', padding: '0.85rem 1rem', marginBottom: '1.25rem'
            }}>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '0.95rem', color: '#111827' }}>
                {deleteConfirm.name}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                📍 {deleteConfirm.location || '—'} &nbsp;•&nbsp; @{deleteConfirm.username}
              </p>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#374151', marginBottom: '1.25rem', lineHeight: '1.5' }}>
              All sales records and data linked to this store will remain in the database, but the store account will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                style={{
                  background: '#f3f4f6', color: '#374151',
                  border: '1px solid #d1d5db', borderRadius: '0.5rem',
                  padding: '0.55rem 1.1rem', fontWeight: '600',
                  cursor: 'pointer', fontSize: '0.875rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteStore}
                disabled={deleteLoading}
                style={{
                  background: deleteLoading ? '#fca5a5' : '#dc2626',
                  color: '#fff', border: 'none', borderRadius: '0.5rem',
                  padding: '0.55rem 1.25rem', fontWeight: '700',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                {deleteLoading ? 'Deleting…' : '🗑 Yes, Delete Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
