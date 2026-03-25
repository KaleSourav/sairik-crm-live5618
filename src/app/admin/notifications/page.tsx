'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dispute {
  id: string;
  product_id: string;
  product_name: string;
  store_id: string;
  store_name: string;
  store_response: 'has_stock';
  store_response_message: string | null;
  store_quantity_remaining: number | null;
  store_responded_at: string | null;
  admin_decision: null;
  created_at: string;
}

interface StockRequest {
  id: string;
  product_name: string;
  product_id: string;
  store_name: string;
  status: 'pending' | 'accepted' | 'rejected';
  request_message?: string;
  admin_message?: string;
  requested_at: string;
  resolved_at?: string;
}

type Tab = 'disputes' | 'stock_requests';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminNotificationsPage() {
  const router = useRouter();

  const [disputes,      setDisputes]      = useState<Dispute[]>([]);
  const [stockRequests, setStockRequests] = useState<StockRequest[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<Tab>('disputes');
  const [processingId,  setProcessingId]  = useState<string | null>(null);
  const [decisionMsg,   setDecisionMsg]   = useState<Record<string, string>>({});
  const [toast,         setToast]         = useState('');
  const [toastError,    setToastError]    = useState('');
  // Track resolved disputes to keep them visible as resolved cards
  const [resolvedDisputes, setResolvedDisputes] = useState<
    { id: string; store_name: string; product_name: string; decision: 'allow_selling' | 'keep_blocked'; message: string | null }[]
  >([]);

  function showToast(msg: string, error = false) {
    if (error) { setToastError(msg); setTimeout(() => setToastError(''), 4000); }
    else       { setToast(msg);      setTimeout(() => setToast(''), 4000); }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [disputeRes, stockRes] = await Promise.all([
      fetch('/api/store-notifications/admin'),
      fetch('/api/stock-requests'),
    ]);

    if (disputeRes.ok) {
      const d = await disputeRes.json();
      setDisputes(Array.isArray(d.disputes) ? d.disputes : []);
    }
    if (stockRes.ok) {
      const d = await stockRes.json();
      setStockRequests(Array.isArray(d) ? d.filter((r: StockRequest) => r.status === 'pending') : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Dispute decision ──────────────────────────────────────────────────────
  async function handleDecision(
    dispute: Dispute,
    decision: 'allow_selling' | 'keep_blocked'
  ) {
    setProcessingId(dispute.id);
    const res = await fetch('/api/store-notifications/admin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification_id: dispute.id,
        decision,
        admin_decision_message: decisionMsg[dispute.id]?.trim() || undefined,
      }),
    });

    if (res.ok) {
      setDisputes(prev => prev.filter(d => d.id !== dispute.id));
      setResolvedDisputes(prev => [...prev, {
        id: dispute.id,
        store_name: dispute.store_name,
        product_name: dispute.product_name,
        decision,
        message: decisionMsg[dispute.id]?.trim() || null,
      }]);
      if (decision === 'allow_selling') {
        showToast(`✅ ${dispute.store_name} can continue selling ${dispute.product_name}`);
      } else {
        showToast(`🚫 ${dispute.product_name} remains blocked for ${dispute.store_name}`);
      }
    } else {
      showToast('Failed to save decision', true);
    }
    setProcessingId(null);
  }

  // ── Stock request accept/reject ───────────────────────────────────────────
  async function handleStockRequestDecision(
    reqId: string,
    decision: 'accepted' | 'rejected',
    adminMessage?: string
  ) {
    setProcessingId(reqId);
    const res = await fetch(`/api/stock-requests/${reqId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: decision, admin_message: adminMessage }),
    });
    if (res.ok) {
      setStockRequests(prev => prev.filter(r => r.id !== reqId));
      showToast(decision === 'accepted' ? '✅ Request accepted' : '✅ Request rejected');
    } else {
      showToast('Failed to update request', true);
    }
    setProcessingId(null);
  }

  // ── Styles helpers ────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1.1rem',
    border: active ? 'none' : '1px solid #E8D5A3',
    background: active ? '#D4AF37' : '#fff',
    color: active ? '#fff' : '#6B6B6B',
    borderRadius: '10px',
    fontWeight: '700', fontSize: '0.85rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
    position: 'relative' as const,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F2', fontFamily: 'Inter, sans-serif' }}>
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{
        background: '#fff', padding: '1rem 1.75rem',
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
          <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#1A1A1A' }}>
            🔔 Notifications &amp; Disputes
          </h1>
          {(disputes.length > 0 || stockRequests.length > 0) && (
            <span style={{
              background: '#dc2626', color: '#fff',
              borderRadius: '999px', padding: '0.15rem 0.65rem',
              fontSize: '0.75rem', fontWeight: '800'
            }}>
              {disputes.length + stockRequests.length} pending
            </span>
          )}
        </div>
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      <main style={{ padding: '1.5rem', maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── TABS ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>

          {/* Disputes tab */}
          <button style={tabStyle(activeTab === 'disputes')} onClick={() => setActiveTab('disputes')}>
            📦 Stock Disputes ({disputes.length})
            {disputes.length > 0 && (
              <span style={{
                background: '#D4AF37', color: '#fff',
                borderRadius: '50%', width: '0.55rem', height: '0.55rem',
                display: 'inline-block', flexShrink: 0
              }} />
            )}
          </button>

          {/* Stock requests tab */}
          <button style={tabStyle(activeTab === 'stock_requests')} onClick={() => setActiveTab('stock_requests')}>
            🏪 OOS Requests ({stockRequests.length})
            {stockRequests.length > 0 && (
              <span style={{
                background: '#f59e0b', color: '#fff',
                borderRadius: '50%', width: '0.55rem', height: '0.55rem',
                display: 'inline-block', flexShrink: 0
              }} />
            )}
          </button>

        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>Loading…</p>
        ) : (

          <>
            {/* ══ DISPUTES TAB ══════════════════════════════════════════════ */}
            {activeTab === 'disputes' && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Section header */}
                <div>
                  <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '800', color: '#111827' }}>
                    Stores claiming they have stock
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                    These stores responded to your global OOS with stock availability
                  </p>
                </div>

                {disputes.length === 0 && resolvedDisputes.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '4rem 2rem',
                    background: '#fff', borderRadius: '0.75rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
                    <p style={{ fontWeight: '700', fontSize: '1.05rem', color: '#374151', margin: '0 0 0.4rem' }}>
                      No pending disputes
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0 }}>
                      All stores have confirmed their OOS status.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ── Pending disputes ─────────────────────────────── */}
                    {disputes.map(d => {
                      const isProcessing = processingId === d.id;
                      return (
                        <div key={d.id} style={{
                          background: '#fff', borderRadius: '0.8rem',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                          border: '1px solid #fde68a',
                          overflow: 'hidden'
                        }}>
                          {/* Card top: store name, product, time, badge */}
                          <div style={{ background: '#fffbeb', padding: '0.85rem 1.2rem', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: '800', fontSize: '1.05rem', color: '#1A1A1A' }}>
                                {d.store_name}
                              </p>
                              <p style={{ margin: '0.1rem 0 0', fontSize: '0.875rem', color: '#374151', fontWeight: '600' }}>
                                {d.product_name}
                              </p>
                              {d.store_responded_at && (
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                                  Responded {timeAgo(d.store_responded_at)}
                                </p>
                              )}
                            </div>
                            <span style={{
                              background: '#FDFBF3', color: '#1A1A1A',
                              border: '1px solid #fde68a', borderRadius: '999px',
                              padding: '0.22rem 0.75rem', fontSize: '0.75rem', fontWeight: '800',
                              whiteSpace: 'nowrap', flexShrink: 0
                            }}>
                              ⏳ Awaiting Your Decision
                            </span>
                          </div>

                          <div style={{ padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

                            {/* Store response summary */}
                            <div style={{ background: '#fef9ec', border: '1px solid #fde68a', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                              <p style={{ margin: '0 0 0.4rem', fontWeight: '800', fontSize: '0.875rem', color: '#1A1A1A' }}>
                                📦 Store says they have stock:
                              </p>
                              {d.store_quantity_remaining != null && (
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.875rem', color: '#374151' }}>
                                  <strong>Quantity:</strong> {d.store_quantity_remaining} unit{d.store_quantity_remaining !== 1 ? 's' : ''}
                                </p>
                              )}
                              {d.store_response_message && (
                                <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.45rem', padding: '0.55rem 0.8rem', fontSize: '0.85rem', color: '#4b5563', marginTop: '0.25rem' }}>
                                  <strong>Store details:</strong> {d.store_response_message}
                                </div>
                              )}
                            </div>

                            {/* Admin message input */}
                            <div>
                              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                                Optional message to store:
                              </label>
                              <textarea
                                value={decisionMsg[d.id] ?? ''}
                                onChange={e => setDecisionMsg(prev => ({ ...prev, [d.id]: e.target.value }))}
                                placeholder="e.g. Please hold the stock, we will collect"
                                rows={2}
                                disabled={isProcessing}
                                style={{
                                  width: '100%', boxSizing: 'border-box',
                                  border: '1px solid #d1d5db', borderRadius: '0.45rem',
                                  padding: '0.5rem 0.75rem', fontSize: '0.875rem',
                                  resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                                  opacity: isProcessing ? 0.6 : 1
                                }}
                              />
                            </div>

                            {/* Decision buttons */}
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>

                              {/* Allow selling */}
                              <div style={{ flex: '1 1 200px' }}>
                                <button
                                  onClick={() => handleDecision(d, 'allow_selling')}
                                  disabled={isProcessing}
                                  style={{
                                    width: '100%', background: isProcessing ? '#d1fae5' : '#16a34a',
                                    color: '#fff', border: 'none', borderRadius: '0.5rem',
                                    padding: '0.6rem 1rem', fontWeight: '800',
                                    fontSize: '0.875rem', cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    opacity: isProcessing ? 0.7 : 1, transition: 'opacity 0.15s'
                                  }}
                                >
                                  {isProcessing ? '⏳ Processing…' : '✅ Allow This Store to Keep Selling'}
                                </button>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                                  Product will be unblocked for {d.store_name} only
                                </p>
                              </div>

                              {/* Keep blocked */}
                              <div style={{ flex: '1 1 200px' }}>
                                <button
                                  onClick={() => handleDecision(d, 'keep_blocked')}
                                  disabled={isProcessing}
                                  style={{
                                    width: '100%', background: '#fff',
                                    color: '#dc2626', border: '2px solid #fca5a5',
                                    borderRadius: '0.5rem', padding: '0.6rem 1rem',
                                    fontWeight: '800', fontSize: '0.875rem',
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    opacity: isProcessing ? 0.7 : 1, transition: 'opacity 0.15s'
                                  }}
                                >
                                  {isProcessing ? '⏳ Processing…' : '❌ Keep Product Blocked'}
                                </button>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                                  Product stays out of stock for {d.store_name}
                                </p>
                              </div>

                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Resolved disputes (this session) ─────────────── */}
                    {resolvedDisputes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', fontWeight: '600' }}>
                          Resolved this session
                        </p>
                        {resolvedDisputes.map(r => (
                          <div key={r.id} style={{
                            background: r.decision === 'allow_selling' ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${r.decision === 'allow_selling' ? '#bbf7d0' : '#fca5a5'}`,
                            borderRadius: '0.6rem', padding: '0.75rem 1rem',
                            display: 'flex', flexDirection: 'column', gap: '0.25rem'
                          }}>
                            <p style={{ margin: 0, fontWeight: '800', fontSize: '0.88rem', color: r.decision === 'allow_selling' ? '#166534' : '#991b1b' }}>
                              {r.decision === 'allow_selling' ? '✅' : '❌'} {r.store_name} — {r.product_name}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                              {r.decision === 'allow_selling' ? 'Allowed to keep selling' : 'Kept blocked'}
                              {r.message ? ` · Note: ${r.message}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* ══ STOCK REQUESTS TAB ════════════════════════════════════════ */}
            {activeTab === 'stock_requests' && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                <div>
                  <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: '800', color: '#111827' }}>
                    Pending OOS Requests from Stores
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                    Stores requesting to mark a product out of stock
                  </p>
                </div>

                {stockRequests.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '4rem 2rem',
                    background: '#fff', borderRadius: '0.75rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
                    <p style={{ fontWeight: '700', fontSize: '1.05rem', color: '#374151', margin: '0 0 0.4rem' }}>
                      No pending OOS requests
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0 }}>
                      All store OOS requests have been resolved.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {stockRequests.map(req => {
                      const isProcessing = processingId === req.id;
                      return (
                        <div key={req.id} style={{
                          background: '#fff', borderRadius: '0.75rem',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                          border: '1px solid #fde68a', overflow: 'hidden'
                        }}>
                          {/* Top row */}
                          <div style={{ padding: '0.85rem 1.2rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: '#111827' }}>
                                {req.product_name}
                              </p>
                              <p style={{ margin: '0.1rem 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
                                {req.store_name} · {formatDate(req.requested_at)}
                              </p>
                            </div>
                            <span style={{ background: '#FDFBF3', color: '#1A1A1A', border: '1px solid #fde68a', borderRadius: '999px', padding: '0.22rem 0.75rem', fontSize: '0.75rem', fontWeight: '800', whiteSpace: 'nowrap' }}>
                              ⏳ Pending
                            </span>
                          </div>

                          <div style={{ padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {req.request_message && (
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280', fontStyle: 'italic' }}>
                                Store note: &ldquo;{req.request_message}&rdquo;
                              </p>
                            )}
                            {/* Admin message for this request */}
                            <textarea
                              placeholder="Optional reply to store…"
                              value={decisionMsg[req.id] ?? ''}
                              onChange={e => setDecisionMsg(prev => ({ ...prev, [req.id]: e.target.value }))}
                              rows={2}
                              disabled={isProcessing}
                              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: '0.45rem', padding: '0.45rem 0.65rem', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleStockRequestDecision(req.id, 'accepted', decisionMsg[req.id])}
                                disabled={isProcessing}
                                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '0.45rem', padding: '0.45rem 1.1rem', fontWeight: '700', fontSize: '0.875rem', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.6 : 1 }}
                              >
                                {isProcessing ? '⏳…' : '✅ Accept — Mark OOS'}
                              </button>
                              <button
                                onClick={() => handleStockRequestDecision(req.id, 'rejected', decisionMsg[req.id])}
                                disabled={isProcessing}
                                style={{ background: '#fff', color: '#dc2626', border: '2px solid #fca5a5', borderRadius: '0.45rem', padding: '0.45rem 1.1rem', fontWeight: '700', fontSize: '0.875rem', cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.6 : 1 }}
                              >
                                {isProcessing ? '⏳…' : '❌ Reject'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* ── TOASTS ──────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.88rem', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 3000, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
      {toastError && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.88rem', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 3000, whiteSpace: 'nowrap' }}>
          ⚠️ {toastError}
        </div>
      )}
    </div>
  );
}
