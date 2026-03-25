'use client';

import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StockRequest {
  id: string;
  product_name: string;
  product_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  request_message?: string;
  admin_message?: string;
  requested_at: string;
  resolved_at?: string;
}

interface GlobalNotif {
  id: string;
  product_id: string;
  product_name: string;
  store_name: string;
  type: 'global_oos_alert' | 're_enabled';
  is_read_by_store: boolean;
  // admin note attached to the OOS action
  globally_oos_message?: string | null;
  // store response
  store_response: 'confirmed_oos' | 'has_stock' | null;
  store_response_message?: string | null;
  store_quantity_remaining?: number | null;
  store_responded_at?: string | null;
  // admin decision on dispute
  admin_decision: 'allow_selling' | 'keep_blocked' | null;
  admin_decision_message?: string | null;
  admin_decided_at?: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ status }: { status: StockRequest['status'] }) {
  const map = {
    pending:  { label: '⏳ Pending',  bg: '#FDFBF3', color: '#1A1A1A', border: '#fde68a' },
    accepted: { label: '✅ Accepted', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
    rejected: { label: '❌ Rejected', bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  };
  const s = map[status];
  return (
    <span style={{
      display: 'inline-block', padding: '0.2rem 0.7rem',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, borderRadius: '999px',
      fontSize: '0.78rem', fontWeight: '700'
    }}>{s.label}</span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StoreNotificationsPage() {
  const router = useRouter();

  const [requests,      setRequests]      = useState<StockRequest[]>([]);
  const [globalNotifs,  setGlobalNotifs]  = useState<GlobalNotif[]>([]);
  const [loading,       setLoading]       = useState(true);

  // Per-notification form state for "We Have Stock" expansion
  const [expandedId,    setExpandedId]    = useState<string | null>(null);
  const [stockQty,      setStockQty]      = useState('');
  const [stockMsg,      setStockMsg]      = useState('');
  const [submitting,    setSubmitting]    = useState<string | null>(null); // notification id being submitted
  const [toast,         setToast]         = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const loadAll = useCallback(async () => {
    const [stockRes, globalRes] = await Promise.all([
      fetch('/api/stock-requests'),
      fetch('/api/store-notifications'),
    ]);

    if (stockRes.ok) {
      const d = await stockRes.json();
      setRequests(Array.isArray(d) ? d : []);
    }

    if (globalRes.ok) {
      const d = await globalRes.json();
      const notifs: GlobalNotif[] = Array.isArray(d.notifications) ? d.notifications : [];
      setGlobalNotifs(notifs);

      // PART C: auto-mark all unread as read when page opens
      const unreadIds = notifs.filter(n => !n.is_read_by_store).map(n => n.id);
      if (unreadIds.length > 0) {
        // Mark each unread one (fire-and-forget, no need to await)
        unreadIds.forEach(id => {
          fetch('/api/store-notifications', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification_id: id, mark_read: true }),
          }).catch(() => {/* silent */});
        });
        // Optimistically update local state so badge clears instantly
        setGlobalNotifs(prev => prev.map(n =>
          unreadIds.includes(n.id) ? { ...n, is_read_by_store: true } : n
        ));
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Response handlers ─────────────────────────────────────────────────────

  async function handleConfirmOos(notifId: string) {
    setSubmitting(notifId);
    const res = await fetch('/api/store-notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_id: notifId, response: 'confirmed_oos', mark_read: true }),
    });
    if (res.ok) {
      setGlobalNotifs(prev => prev.map(n =>
        n.id === notifId ? { ...n, store_response: 'confirmed_oos', is_read_by_store: true } : n
      ));
      showToast('✅ Response sent — confirmed out of stock');
    }
    setSubmitting(null);
  }

  async function handleSendHasStock(notifId: string) {
    try {
      const qty = parseInt(stockQty);
      if (!qty || qty < 1) { showToast('⚠️ Please enter a valid quantity'); return; }
      setSubmitting(notifId);

      console.log('Sending has_stock for:', notifId);
      console.log('Quantity:', qty);
      console.log('Message:', stockMsg);

      const res = await fetch('/api/store-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: notifId,
          response: 'has_stock',
          store_quantity_remaining: qty || 0,
          store_response: stockMsg.trim() || null,
          mark_all_read: false
        })
      });

      console.log('Response status:', res.status);
      
      const text = await res.text();
      console.log('Response text:', text);
      
      if (!res.ok) {
        console.error('API error:', text);
        alert('Failed: ' + text);
        setSubmitting(null);
        return;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch(e) {
        console.error('Could not parse response as JSON:', text);
      }

      console.log('Success:', data);
      
      setGlobalNotifs(prev => prev.map(n =>
        n.id === notifId
          ? { ...n, store_response: 'has_stock', store_quantity_remaining: qty, store_response_message: stockMsg.trim() || null, is_read_by_store: true }
          : n
      ));
      
      showToast('📦 Response sent — admin will review');
      setExpandedId(null);
      setStockQty('');
      setStockMsg('');
      setSubmitting(null);
      
    } catch (err: any) {
      console.error('Network error:', err.message);
      alert('Network error: ' + err.message);
      setSubmitting(null);
    }
  }

  const unreadCount = globalNotifs.filter(n => !n.is_read_by_store).length;

  // ── OOS alert card renderer ───────────────────────────────────────────────
  function renderOosAlert(n: GlobalNotif) {
    const isSubmittingThis = submitting === n.id;
    const isExpanded = expandedId === n.id;

    // ── State: not yet responded ──────────────────────────────────────────
      if (n.store_response === null) {
      return (
        <Card key={n.id} style={{
          background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', 
          boxShadow: '0 4px 12px rgba(220,38,38,0.12)',
          borderLeft: '5px solid #dc2626'
        }}>
          <CardContent style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Header */}
            <div>
              <p style={{ margin: '0 0 0.2rem', fontWeight: '800', fontSize: '0.95rem', color: '#991b1b' }}>
                ⛔ Product Marked Out of Stock
              </p>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151', fontWeight: '600' }}>
                <strong>{n.product_name}</strong> has been marked out of stock across all stores by the admin.
              </p>
            </div>

            {/* Admin reason */}
            {n.globally_oos_message && (
              <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.45rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#6b7280' }}>
                <strong>Admin reason:</strong> {n.globally_oos_message}
              </div>
            )}

            <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151', fontWeight: '600' }}>
              Do you have this product in stock?
            </p>

            {/* Response buttons */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleConfirmOos(n.id)}
                disabled={isSubmittingThis}
                style={{
                  background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db',
                  borderRadius: '0.45rem', padding: '0.45rem 1rem', fontWeight: '700',
                  fontSize: '0.85rem', cursor: isSubmittingThis ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingThis ? 0.6 : 1
                }}
              >
                {isSubmittingThis && !isExpanded ? '⏳ Sending…' : '✅ We Are Out of Stock'}
              </button>

              <button
                onClick={() => {
                  if (isExpanded) {
                    setExpandedId(null); setStockQty(''); setStockMsg('');
                  } else {
                    setExpandedId(n.id); setStockQty(''); setStockMsg('');
                  }
                }}
                style={{
                  background: isExpanded ? '#FDFBF3' : '#D4AF37', color: isExpanded ? '#1A1A1A' : '#fff',
                  border: isExpanded ? '1px solid #fde68a' : 'none',
                  borderRadius: '0.45rem', padding: '0.45rem 1rem', fontWeight: '700',
                  fontSize: '0.85rem', cursor: 'pointer'
                }}
              >
                {isExpanded ? '✕ Cancel' : '📦 We Have Stock'}
              </button>
            </div>

            {/* Expanded form: We Have Stock */}
            {isExpanded && (
              <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '0.55rem', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Quantity remaining: <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number" min={1} value={stockQty}
                    onChange={e => setStockQty(e.target.value)}
                    placeholder="e.g. 8"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '0.4rem', padding: '0.45rem 0.65rem', fontSize: '0.875rem', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                    Details for admin:
                  </label>
                  <textarea
                    value={stockMsg}
                    onChange={e => setStockMsg(e.target.value)}
                    rows={2}
                    placeholder="e.g. We have 5 units of 30ml and 3 units of 50ml remaining"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '0.4rem', padding: '0.45rem 0.65rem', fontSize: '0.875rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSendHasStock(n.id)}
                    disabled={isSubmittingThis}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '0.45rem', padding: '0.45rem 1.1rem', fontWeight: '700', fontSize: '0.85rem', cursor: isSubmittingThis ? 'not-allowed' : 'pointer', opacity: isSubmittingThis ? 0.6 : 1 }}
                  >
                    {isSubmittingThis ? '⏳ Sending…' : 'Send to Admin'}
                  </button>
                  <button
                    onClick={() => { setExpandedId(null); setStockQty(''); setStockMsg(''); }}
                    style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '0.45rem', padding: '0.45rem 0.85rem', fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <p style={{ margin: 0, fontSize: '0.73rem', color: '#9ca3af' }}>Received {timeAgo(n.created_at)}</p>
          </CardContent>
        </Card>
      );
    }

    // ── State: confirmed OOS ──────────────────────────────────────────────
    if (n.store_response === 'confirmed_oos') {
      return (
        <Card key={n.id} style={{ borderRadius: '0.75rem', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: '5px solid #9ca3af', background: '#f9fafb' }}>
          <CardContent style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.9rem', color: '#374151' }}>
              ✅ You confirmed out of stock for <strong>{n.product_name}</strong>
            </p>
            {n.store_responded_at && (
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>
                Responded {timeAgo(n.store_responded_at)}
              </p>
            )}
          </CardContent>
        </Card>
      );
    }

    // ── State: has_stock — awaiting admin decision ─────────────────────────
    if (n.store_response === 'has_stock' && !n.admin_decision) {
      return (
        <Card key={n.id} style={{ borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: '5px solid #f59e0b', background: '#fffbeb' }}>
          <CardContent style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.9rem', color: '#1A1A1A' }}>
              ⏳ Response sent — Awaiting admin decision
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151' }}>
              You reported <strong>{n.store_quantity_remaining}</strong> unit{(n.store_quantity_remaining ?? 0) !== 1 ? 's' : ''} remaining for <strong>{n.product_name}</strong>
            </p>
            {n.store_response_message && (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280', fontStyle: 'italic' }}>
                Your note: {n.store_response_message}
              </p>
            )}
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#D4AF37', fontWeight: '600' }}>
              Admin is reviewing your response.
            </p>
            <p style={{ margin: 0, fontSize: '0.73rem', color: '#9ca3af' }}>
              Responded {n.store_responded_at ? timeAgo(n.store_responded_at) : 'recently'}
            </p>
          </CardContent>
        </Card>
      );
    }

    // ── State: admin decided → allow_selling ─────────────────────────────
      if (n.admin_decision === 'allow_selling') {
      return (
        <Card key={n.id} style={{ 
          background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', 
          boxShadow: '0 4px 12px rgba(212,175,55,0.08)', borderLeft: '5px solid #16a34a' 
        }}>
          <CardContent style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.95rem', color: '#166534' }}>
              ✅ Admin approved — You can continue selling
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151' }}>
              <strong>{n.product_name}</strong> is unblocked for your store.
            </p>
            {n.admin_decision_message && (
              <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: '0.4rem', padding: '0.45rem 0.75rem', fontSize: '0.82rem', color: '#166534' }}>
                <strong>Admin note:</strong> {n.admin_decision_message}
              </div>
            )}
            <p style={{ margin: 0, fontSize: '0.73rem', color: '#9ca3af' }}>
              Decided {n.admin_decided_at ? timeAgo(n.admin_decided_at) : 'recently'}
            </p>
          </CardContent>
        </Card>
      );
    }

    // ── State: admin decided → keep_blocked ──────────────────────────────
    if (n.admin_decision === 'keep_blocked') {
      return (
        <Card key={n.id} style={{ borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: '5px solid #dc2626', background: '#fef2f2' }}>
          <CardContent style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.95rem', color: '#991b1b' }}>
              ❌ Admin decision — Product remains blocked
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#374151' }}>
              <strong>{n.product_name}</strong> remains out of stock for your store.
            </p>
            {n.admin_decision_message && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.4rem', padding: '0.45rem 0.75rem', fontSize: '0.82rem', color: '#991b1b' }}>
                <strong>Admin note:</strong> {n.admin_decision_message}
              </div>
            )}
            <p style={{ margin: 0, fontSize: '0.73rem', color: '#9ca3af' }}>
              Decided {n.admin_decided_at ? timeAgo(n.admin_decided_at) : 'recently'}
            </p>
          </CardContent>
        </Card>
      );
    }

    // Fallback (should not happen)
    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F2', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header style={{
        background: '#fff', padding: '1rem 1.5rem',
        borderBottom: '1px solid #E8D5A3',
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
        >← Back</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#1A1A1A' }}>📬 Notifications</h1>
          {unreadCount > 0 && (
            <span style={{
              background: '#dc2626', color: '#fff',
              borderRadius: '999px', padding: '0.15rem 0.6rem',
              fontSize: '0.75rem', fontWeight: '800'
            }}>{unreadCount} unread</span>
          )}
        </div>
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      <main style={{ padding: '1.25rem', maxWidth: '700px', margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Loading…</p>
        ) : (
          <>
            {/* ══ GLOBAL OOS ANNOUNCEMENTS ════════════════════════════════ */}
            {globalNotifs.length > 0 && (
              <section>
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '800', color: '#374151' }}>
                  📢 Global Announcements
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {globalNotifs.map(n => {
                    // Re-enabled notifications (always a simple green card)
                    if (n.type === 're_enabled') {
                      return (
                        <Card key={n.id} style={{
                          borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                          borderLeft: '5px solid #16a34a', background: '#f0fdf4'
                        }}>
                          <CardContent style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.95rem', color: '#166534' }}>
                              ✅ Product Available Again
                            </p>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>
                              <strong>{n.product_name}</strong> is now available in all stores.
                            </p>
                            <p style={{ margin: 0, fontSize: '0.73rem', color: '#9ca3af' }}>
                              {timeAgo(n.created_at)}
                            </p>
                          </CardContent>
                        </Card>
                      );
                    }

                    // OOS alert — complex state machine
                    return renderOosAlert(n);
                  })}
                </div>
              </section>
            )}

            {/* ══ STOCK REQUEST RESPONSES ══════════════════════════════════ */}
            <section>
              {globalNotifs.length > 0 && (
                <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '800', color: '#374151' }}>
                  📤 Your Stock Requests
                </h2>
              )}
              {requests.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '4rem 2rem',
                  color: '#9ca3af', background: '#fff',
                  borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📭</div>
                  <p style={{ fontWeight: '600', fontSize: '1rem', color: '#6b7280' }}>No notifications yet</p>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    Use &ldquo;Mark OOS&rdquo; in Sales History to request out-of-stock notices.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {requests.map(req => (
                    <Card key={req.id} style={{
                      borderRadius: '0.75rem',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                      borderLeft: req.status === 'accepted' ? '4px solid #16a34a'
                                : req.status === 'rejected' ? '4px solid #dc2626'
                                : '4px solid #f59e0b'
                    }}>
                      <CardContent style={{ padding: '1rem 1.25rem' }}>
                        {/* Row 1: product name + badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.35rem' }}>
                          <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: '#111827' }}>
                            {req.product_name}
                          </p>
                          <StatusBadge status={req.status} />
                        </div>

                        {/* Row 2: date */}
                        <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                          Requested: {formatDate(req.requested_at)}
                          {req.resolved_at && ` · Resolved: ${formatDate(req.resolved_at)}`}
                        </p>

                        {/* Row 3: your message */}
                        {req.request_message && (
                          <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: '#6b7280' }}>
                            Your note: <em>{req.request_message}</em>
                          </p>
                        )}

                        {/* Row 4: outcome */}
                        {req.status === 'accepted' && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.45rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#166534', fontWeight: '600' }}>
                            ✅ Product marked out of stock in your store.
                          </div>
                        )}
                        {req.status === 'rejected' && (
                          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '0.45rem', padding: '0.5rem 0.75rem', fontSize: '0.82rem', color: '#991b1b' }}>
                            {req.admin_message
                              ? <><strong>Admin says:</strong> {req.admin_message}</>
                              : 'Request rejected. Product still available.'}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: '#fff', padding: '0.65rem 1.4rem',
          borderRadius: '999px', fontWeight: '700', fontSize: '0.88rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 3000, whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
