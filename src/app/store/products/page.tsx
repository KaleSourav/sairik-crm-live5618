'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StoreProductsPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [outOfStockProducts, setOutOfStockProducts] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showOosDialog, setShowOosDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [oosMessage, setOosMessage] = useState('');
  const [oosLoading, setOosLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // 1. Auth check
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) { router.push('/login'); return; }
        const meData = await meRes.json();
        setUser(meData);

        // 2. Fetch products
        const prodsRes = await fetch('/api/products');
        if (prodsRes.ok) {
          const prodsData = await prodsRes.json();
          setProducts(Array.isArray(prodsData) ? prodsData.map((p: any) => ({
            ...p,
            category_name: p.categories?.name || p.category_name || ''
          })) : []);
        }

        // 3. Fetch categories
        const catsRes = await fetch('/api/categories');
        if (catsRes.ok) {
          const catsData = await catsRes.json();
          setCategories(Array.isArray(catsData) ? catsData : []);
        }

        // 4. Fetch pending OOS requests
        const reqsRes = await fetch('/api/stock-requests');
        if (reqsRes.ok) {
          const reqs = await reqsRes.json();
          if (Array.isArray(reqs)) setPendingRequests(reqs);
        }

        // 5. Fetch globally blocked products
        const statusRes = await fetch('/api/stock-status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (Array.isArray(statusData)) {
            const blockedIds = new Set<string>(
              statusData
                .filter((s: any) => s.is_globally_oos)
                .map((s: any) => s.id)
            );
            setOutOfStockProducts(blockedIds);
          }
        }
      } catch (e) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const filteredProducts = products
    .filter(p => !selectedCategory || p.category_name === selectedCategory)
    .filter(p => !searchText || p.name.toLowerCase().includes(searchText.toLowerCase()));

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isPending(product_id: string): boolean {
    return pendingRequests.some(
      r => r.product_id === product_id && r.status === 'pending'
    );
  }

  function isOOS(product_id: string): boolean {
    return outOfStockProducts.has(product_id);
  }

  function handleMarkOOS(product: any) {
    setSelectedProduct(product);
    setOosMessage('');
    setErrorMsg('');
    setShowOosDialog(true);
  }

  async function submitOOSRequest() {
    if (!selectedProduct) return;
    setOosLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/stock-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          request_message: oosMessage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Optimistically update pending list
        setPendingRequests(prev => [
          ...prev,
          { product_id: selectedProduct.id, status: 'pending' },
        ]);
        setShowOosDialog(false);
        setSelectedProduct(null);
        setOosMessage('');
        setSuccessMsg('Request sent to super admin ✅');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg(data.error || 'Failed to send request');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    }
    setOosLoading(false);
  }

  const pendingCount = pendingRequests.filter(r => r.status === 'pending').length;

  // ── Loading State ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#FAFAFA', fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid #fde68a',
            borderTopColor: '#D4AF37', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem'
          }} />
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Loading products...
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .product-card { background: #fff; border: 1px solid #f3f4f6; border-radius: 12px; padding: 1.25rem; transition: all 0.2s; }
        .product-card:hover { border-color: #fde68a; box-shadow: 0 4px 16px rgba(212,175,55,0.12); transform: translateY(-1px); }
        .filter-btn { padding: 0.35rem 0.85rem; border-radius: 999px; border: 1px solid #E8D5A3; background: #fff; color: #6B6B6B; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
        .filter-btn.active { background: #D4AF37; color: #fff; border-color: #D4AF37; }
        .filter-btn:hover:not(.active) { background: #FDFBF3; border-color: #D4AF37; color: #D4AF37; }
        .oos-btn { padding: 0.4rem 0.9rem; border-radius: 8px; border: 1px solid #E8D5A3; color: #D4AF37; background: #FDFBF3; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.15s; }
        .oos-btn:hover { background: #fff; border-color: #D4AF37; }
        .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; animation: fadeIn 0.2s ease-out; }
      `}</style>

      {/* ── SUCCESS TOAST ── */}
      {successMsg && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          background: '#16a34a', color: '#fff', padding: '0.65rem 1.5rem',
          borderRadius: '999px', fontWeight: '700', fontSize: '0.9rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 2000, whiteSpace: 'nowrap',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {successMsg}
        </div>
      )}

      {/* ── OOS DIALOG ── */}
      {showOosDialog && selectedProduct && (
        <div className="dialog-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setShowOosDialog(false); } }}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '1.75rem',
            width: '100%', maxWidth: '460px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)'
          }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem', fontWeight: '800', color: '#111827' }}>
              📦 Report Out of Stock
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Product: <strong style={{ color: '#D4AF37' }}>{selectedProduct.name}</strong>
            </p>

            <div style={{
              background: '#FDFBF3', border: '1px solid #fde68a', borderRadius: '8px',
              padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#1A1A1A'
            }}>
              This will send a request to the super admin. Your store will be blocked from selling
              this product once the admin approves.
            </div>

            <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
              Message to admin (optional)
            </label>
            <textarea
              value={oosMessage}
              onChange={e => setOosMessage(e.target.value)}
              placeholder="e.g. Last unit sold this morning, need restock urgently"
              rows={4}
              style={{
                width: '100%', border: '1px solid #d1d5db', borderRadius: '8px',
                padding: '0.6rem 0.85rem', fontSize: '0.875rem', resize: 'vertical',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                marginBottom: '0.75rem', lineHeight: 1.5
              }}
              onFocus={e => (e.target.style.borderColor = '#D4AF37')}
              onBlur={e => (e.target.style.borderColor = '#d1d5db')}
            />

            {errorMsg && (
              <p style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '0.75rem', fontWeight: '500' }}>
                ⚠️ {errorMsg}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowOosDialog(false); setErrorMsg(''); }}
                style={{
                  padding: '0.55rem 1.1rem', border: '1px solid #d1d5db',
                  borderRadius: '8px', background: '#fff', color: '#374151',
                  fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitOOSRequest}
                disabled={oosLoading}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: oosLoading ? '#C9A84C' : '#D4AF37',
                  border: 'none', borderRadius: '8px', color: '#fff',
                  fontWeight: '700', fontSize: '0.875rem',
                  cursor: oosLoading ? 'not-allowed' : 'pointer', transition: 'all 0.15s'
                }}
              >
                {oosLoading ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{
        background: '#fff', padding: '1rem 1.5rem',
        borderBottom: '1px solid #E8D5A3',
        display: 'flex', alignItems: 'center', gap: '1rem',
        boxShadow: '0 2px 8px rgba(212,175,55,0.08)',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <button
          onClick={() => router.push('/store/dashboard')}
          style={{
            background: '#FDFBF3', border: '1px solid #E8D5A3',
            color: '#D4AF37', borderRadius: '8px', padding: '0.35rem 0.85rem',
            cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem'
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#1A1A1A', lineHeight: 1.2 }}>
            Products Catalog
          </h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9CA3AF', letterSpacing: '0.05em' }}>
            All available products · {user?.store_name || 'Store'}
          </p>
        </div>
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      {/* ── BREADCRUMB ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #f3f4f6',
        padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        fontSize: '0.8rem', fontWeight: '500'
      }}>
        <button
          onClick={() => router.push('/store/dashboard')}
          style={{
            background: 'none', border: 'none', color: '#D4AF37',
            fontWeight: '600', cursor: 'pointer', padding: 0,
            fontSize: '0.8rem', textDecoration: 'underline', textUnderlineOffset: '2px'
          }}
        >
          Dashboard
        </button>
        <span style={{ color: '#d1d5db' }}>→</span>
        <span style={{ color: '#9ca3af' }}>Products</span>
      </div>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>

        {/* ── STATS CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Total Products
            </p>
            <p style={{ margin: 0, fontSize: '2rem', fontWeight: '800', color: '#1f2937', lineHeight: 1 }}>
              {products.length}
            </p>
          </div>
          <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Out of Stock
            </p>
            <p style={{ margin: 0, fontSize: '2rem', fontWeight: '800', color: '#dc2626', lineHeight: 1 }}>
              {outOfStockProducts.size}
            </p>
          </div>
          <div style={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '1.1rem 1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', fontWeight: '600', color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Pending Requests
            </p>
            <p style={{ margin: 0, fontSize: '2rem', fontWeight: '800', color: '#D4AF37', lineHeight: 1 }}>
              {pendingCount}
            </p>
          </div>
        </div>

        {/* ── FILTER ROW ── */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search products..."
            style={{
              flex: '1 1 260px', padding: '0.6rem 1rem', border: '1px solid #e5e7eb',
              borderRadius: '8px', fontSize: '0.875rem', outline: 'none',
              fontFamily: 'inherit', background: '#fff', color: '#1f2937',
              transition: 'border-color 0.15s', minWidth: '200px'
            }}
            onFocus={e => (e.target.style.borderColor = '#D4AF37')}
            onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
          />

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flex: '2 1 400px' }}>
            <button
              className={`filter-btn${selectedCategory === '' ? ' active' : ''}`}
              onClick={() => setSelectedCategory('')}
            >
              All
            </button>
            {categories.map((cat: any) => (
              <button
                key={cat.id}
                className={`filter-btn${selectedCategory === cat.name ? ' active' : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat.name ? '' : cat.name)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── PRODUCTS GRID ── */}
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem 1rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <p style={{ fontSize: '1rem', fontWeight: '600', color: '#6b7280', marginBottom: '0.5rem' }}>
              {searchText ? `No products matching "${searchText}"` : 'No products found'}
            </p>
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                style={{
                  background: 'none', border: 'none', color: '#D4AF37',
                  fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {filteredProducts.map((product: any) => {
              const oos = isOOS(product.id);
              const pending = isPending(product.id);
              const variants: any[] = product.variants || [];

              return (
                <div key={product.id} className="product-card">
                  {/* Top Row: Name + Category */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <h3 style={{
                      margin: '0 0 0.2rem', fontSize: '0.95rem',
                      fontWeight: '700', color: '#1f2937', lineHeight: 1.3
                    }}>
                      {product.name}
                    </h3>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {product.category_name || 'Uncategorized'}
                    </span>
                  </div>

                  {/* Middle Row: Variant Pills */}
                  {variants.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
                      {variants.map((v: any, i: number) => (
                        <span key={i} style={{
                          background: '#FDFBF3', color: '#1A1A1A',
                          border: '1px solid #fde68a', borderRadius: '999px',
                          padding: '0.2rem 0.6rem', fontSize: '0.72rem', fontWeight: '600'
                        }}>
                          {v.size_ml}ml — ₹{v.price}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bottom Row: Status + Action */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                    {/* Status Badge */}
                    {oos ? (
                      <span style={{
                        background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
                        borderRadius: '999px', padding: '0.25rem 0.75rem',
                        fontSize: '0.75rem', fontWeight: '600'
                      }}>
                        ⛔ Out of Stock
                      </span>
                    ) : pending ? (
                      <span style={{
                        background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa',
                        borderRadius: '999px', padding: '0.25rem 0.75rem',
                        fontSize: '0.75rem', fontWeight: '600'
                      }}>
                        ⏳ Request Pending
                      </span>
                    ) : (
                      <span style={{
                        background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                        borderRadius: '999px', padding: '0.25rem 0.75rem',
                        fontSize: '0.75rem', fontWeight: '600'
                      }}>
                        ✓ Available
                      </span>
                    )}

                    {/* Action Button */}
                    {oos ? (
                      <button disabled style={{
                        padding: '0.4rem 0.9rem', borderRadius: '8px',
                        border: '1px solid #e5e7eb', background: '#f9fafb',
                        color: '#9ca3af', fontSize: '0.78rem', fontWeight: '600',
                        cursor: 'not-allowed'
                      }}>
                        OOS Marked
                      </button>
                    ) : pending ? (
                      <button disabled style={{
                        padding: '0.4rem 0.9rem', borderRadius: '8px',
                        border: '1px solid #e5e7eb', background: '#f9fafb',
                        color: '#9ca3af', fontSize: '0.78rem', fontWeight: '600',
                        cursor: 'not-allowed'
                      }}>
                        Request Sent
                      </button>
                    ) : (
                      <button
                        className="oos-btn"
                        onClick={() => handleMarkOOS(product)}
                      >
                        Mark OOS
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
