'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { downloadInvoicePDF, printInvoice, sendWhatsApp } from '@/lib/invoice-generator';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; }

interface Variant {
  id:      string;
  size_ml: number;
  price:   number;
}

interface Product {
  id:               string;
  name:             string;
  mrp:              number;
  category_id:      string;
  product_variants: Variant[];
}

interface SelectedVariant {
  variant_id: string;
  size_ml:    number;
  price:      number;
  quantity:   number;
  discount:   number;
}

interface CartItem {
  product_id:      string;
  product_name:    string;
  category_name:   string;
  variant_id:      string;
  size_ml:         number;
  mrp:             number;
  quantity:        number;
  discount_amount: number;
  final_price:     number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt    = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString('en-IN');

// ── Component ──────────────────────────────────────────────────────────────────
export default function NewSalePage() {
  const router = useRouter();

  // Customer
  const [customerName,  setCustomerName]  = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Catalogue
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [products,        setProducts]        = useState<Product[]>([]);
  const [selectedCatId,   setSelectedCatId]   = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSearch,   setProductSearch]   = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Variant selection (multi-select)
  const [selectedVariants, setSelectedVariants] = useState<Record<string, SelectedVariant>>({});

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Overall discount
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(0);
  const [overallDiscountAmount,  setOverallDiscountAmount]  = useState<number>(0);

  // Submit
  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [successItems, setSuccessItems] = useState<CartItem[]>([]);

  // Invoice
  const [invoiceData,    setInvoiceData]    = useState<any>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [saleIds,        setSaleIds]        = useState<string[]>([]);

  // User (for store name in WhatsApp)
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(d => { if (d) setUser(d); });
  }, []);

  // ── Block status (global OOS + store OOS combined) ──────────────────────
  const [blockedProducts, setBlockedProducts] = useState<Set<string>>(new Set());
  const [oosClickedId,    setOosClickedId]    = useState<string | null>(null);

  function isBlocked(productId: string) { return blockedProducts.has(productId); }

  async function fetchBlockedStatus() {
    try {
      const res  = await fetch('/api/stock-status');
      if (res.ok) {
        const data = await res.json();
        // blocked_products is already the union of global OOS + store OOS (minus exemptions)
        const ids: string[] = Array.isArray(data.blocked_products)
          ? data.blocked_products.map((p: { product_id: string }) => p.product_id)
          : [];
        setBlockedProducts(new Set(ids));
      }
    } catch { /* silent */ }
  }

  // ── Fetch categories + block status on mount ─────────────────────────────
  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(setCategories);
    fetchBlockedStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch products when category changes ──────────────────────────────────────
  useEffect(() => {
    if (!selectedCatId) { setProducts([]); return; }
    setSelectedProduct(null);
    setSelectedVariants({});
    setProductSearch('');
    setLoadingProducts(true);
    fetch(`/api/products?category_id=${selectedCatId}`)
      .then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : []))
      .finally(() => setLoadingProducts(false));
  }, [selectedCatId]);


  // ── Computed ──────────────────────────────────────────────────────────────────
  const filteredProducts = productSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  const selectedVariantList = Object.values(selectedVariants);
  const variantSubtotal = selectedVariantList.reduce(
    (s, v) => s + (v.price - v.discount) * v.quantity, 0
  );
  const hasSelectedVariants = selectedVariantList.length > 0;

  // Cart aggregates
  const cartTotal     = cartItems.reduce((s, i) => s + i.final_price, 0);
  const cartQtyTotal  = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartDiscTotal = cartItems.reduce((s, i) => s + i.discount_amount, 0);
  const uniqueProducts = cartItems.reduce<string[]>(
    (acc, i) => acc.includes(i.product_id) ? acc : [...acc, i.product_id], []
  ).length;

  // Overall discount breakdown
  const cartSubtotal = cartTotal; // already after per-item discounts
  const cartMRPTotal = cartItems.reduce((s, i) => s + (i.mrp * (i.quantity || 1)), 0);
  const totalItemDiscounts = cartMRPTotal - cartSubtotal;
  const calculatedOverallDiscount = overallDiscountPercent > 0
    ? Math.round((cartSubtotal * overallDiscountPercent) / 100)
    : 0;
  const grandFinalTotal = cartSubtotal - calculatedOverallDiscount;

  // Sync overallDiscountAmount whenever inputs change
  useEffect(() => {
    setOverallDiscountAmount(calculatedOverallDiscount);
  }, [overallDiscountPercent, cartSubtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group cart by product
  const cartByProduct = cartItems.reduce<Record<string, CartItem[]>>((acc, item) => {
    if (!acc[item.product_id]) acc[item.product_id] = [];
    acc[item.product_id].push(item);
    return acc;
  }, {});

  // ── Variant toggle / update ───────────────────────────────────────────────────
  function toggleVariant(v: Variant) {
    setSelectedVariants(prev => {
      if (prev[v.id]) {
        const next = { ...prev };
        delete next[v.id];
        return next;
      }
      return { ...prev, [v.id]: { variant_id: v.id, size_ml: v.size_ml, price: v.price, quantity: 1, discount: 0 } };
    });
  }

  function updateVariantField(variantId: string, field: 'quantity' | 'discount', value: number) {
    setSelectedVariants(prev => ({
      ...prev,
      [variantId]: { ...prev[variantId], [field]: Math.max(0, value) }
    }));
  }

  // ── Add all selected variants to cart ─────────────────────────────────────────
  function addToCart() {
    if (!selectedProduct || !hasSelectedVariants) return;
    const catName = categories.find(c => c.id === selectedCatId)?.name ?? '';
    const newItems: CartItem[] = selectedVariantList.map(sv => ({
      product_id:      selectedProduct.id,
      product_name:    selectedProduct.name,
      category_name:   catName,
      variant_id:      sv.variant_id,
      size_ml:         sv.size_ml,
      mrp:             sv.price,
      quantity:        Math.max(1, sv.quantity),
      discount_amount: sv.discount * Math.max(1, sv.quantity),
      final_price:     (sv.price - sv.discount) * Math.max(1, sv.quantity)
    }));
    setCartItems(prev => [...prev, ...newItems]);
    setSelectedProduct(null);
    setSelectedVariants({});
    setProductSearch('');
  }

  function removeFromCart(idx: number) {
    setCartItems(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) { alert('Please enter customer name'); return; }
    if (cartItems.length === 0) { alert('Cart is empty'); return; }

    setSubmitting(true);
    try {
      const totalFinalBeforeOverall = cartItems.reduce((sum, item) => sum + item.final_price, 0);

      const results = await Promise.all(
        cartItems.map(item => {
          // Save PER-ITEM discount only — do NOT distribute overall discount here.
          // overall_discount_percent is stored as a separate field on each record.
          const itemOnlyDiscount = item.discount_amount || 0;

          return fetch('/api/sales', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_name:            customerName,
              customer_phone:           customerPhone,
              customer_email:           customerEmail,
              product_id:               item.product_id,
              product_name:             item.product_name,
              category_name:            item.category_name,
              variant_id:               item.variant_id,
              size_ml:                  item.size_ml,
              mrp_at_sale:              item.mrp,
              quantity:                 item.quantity,
              discount_amount:          itemOnlyDiscount,
              final_price:              item.final_price,   // after item discounts only
              overall_discount_percent: overallDiscountPercent || 0
            })
          });
        })
      );

      if (results.every(r => r.ok)) {
        setSuccessItems([...cartItems]);

        // Parse IDs from the already-resolved responses
        // Note: we can't re-read Response bodies, so we re-fetch sales by date
        const today = new Date().toISOString().split('T')[0];
        const salesRes = await fetch(`/api/sales?from=${today}&to=${today}`);
        if (salesRes.ok) {
          const recentSales = await salesRes.json();
          if (Array.isArray(recentSales)) {
            // Match by customer name + product — get the IDs of this transaction
            const ids = recentSales
              .filter((s: any) => s.customer_name === customerName)
              .map((s: any) => s.id)
              .slice(0, cartItems.length);
            setSaleIds(ids);

            // Auto-generate invoice
            if (ids.length > 0) {
              setInvoiceLoading(true);
              try {
                const invoiceRes = await fetch('/api/invoice', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sale_ids: ids })
                });
                if (invoiceRes.ok) {
                  const invData = await invoiceRes.json();
                  setInvoiceData({
                    ...invData,
                    customer_name:            customerName,
                    customer_phone:           customerPhone,
                    customer_email:           customerEmail,
                    overall_discount_percent: overallDiscountPercent
                  });
                }
              } catch { /* invoice generation failed — not critical */ }
              setInvoiceLoading(false);
            }
          }
        }

        setSuccess(true);
        setCartItems([]);
        // Do NOT reset overallDiscountPercent here — success screen reads it for grand total
        fetchBlockedStatus();
      } else {
        const failed = results.filter(r => !r.ok).length;
        alert(`${failed} of ${cartItems.length} item(s) failed. Please try again.`);
      }
    } catch {
      alert('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUCCESS SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (success) {
    // Recalculate directly — do NOT rely on overallDiscountAmount state (may be stale)
    const successSubtotal    = successItems.reduce((s, i) => s + i.final_price, 0);
    const successOverallDisc = overallDiscountPercent > 0
      ? Math.round(successSubtotal * overallDiscountPercent / 100)
      : 0;
    const successGrandTotal  = successSubtotal - successOverallDisc;

    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FDFBF3 0%, #fff 60%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
      }}>
        <div style={{
          background: '#fff', borderRadius: '24px',
          boxShadow: '0 8px 40px rgba(212,175,55,0.15)',
          border: '1px solid #fde68a',
          maxWidth: '440px', width: '100%', padding: '2rem 2rem 1.5rem',
          textAlign: 'center'
        }}>
          {/* Check icon */}
          <div style={{
            width: '72px', height: '72px', background: '#f0fdf4',
            borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2.2rem'
          }}>✅</div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#1f2937', margin: '0 0 0.25rem' }}>
            Sale Complete!
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0 0 1.25rem' }}>
            {successItems.length} product line{successItems.length !== 1 ? 's' : ''} recorded successfully
          </p>

          {/* Invoice number badge */}
          {invoiceData?.invoice_number && (
            <div style={{
              background: '#FDFBF3', border: '1px solid #fde68a',
              borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1rem'
            }}>
              <p style={{ fontSize: '0.65rem', color: '#D4AF37', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.2rem', fontWeight: '700' }}>
                Invoice Number
              </p>
              <p style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1A1A1A', margin: 0 }}>
                {invoiceData.invoice_number}
              </p>
            </div>
          )}

          {/* Grand total */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.2rem' }}>
              Grand Total
            </p>
            <p style={{ fontSize: '2rem', fontWeight: '800', color: '#16a34a', margin: 0 }}>
              ₹{successGrandTotal.toLocaleString('en-IN')}
            </p>
            {successOverallDisc > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.2rem 0 0' }}>
                incl. {overallDiscountPercent}% overall discount — saved ₹{successOverallDisc.toLocaleString('en-IN')}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {invoiceLoading ? (
            <div style={{ color: '#D4AF37', fontSize: '0.9rem', padding: '1rem', marginBottom: '0.75rem' }}>
              ⏳ Generating invoice...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>

              {/* Download PDF */}
              <button
                onClick={() => { if (invoiceData) downloadInvoicePDF(invoiceData); }}
                disabled={!invoiceData}
                style={{
                  width: '100%', padding: '0.75rem',
                  background: invoiceData ? 'linear-gradient(90deg, #D4AF37, #D4AF37)' : '#e5e7eb',
                  color: invoiceData ? '#fff' : '#9ca3af',
                  border: 'none', borderRadius: '12px',
                  fontWeight: '700', fontSize: '0.95rem',
                  cursor: invoiceData ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s'
                }}
              >
                📄 Download Invoice PDF
              </button>

              {/* Print */}
              <button
                onClick={() => { if (invoiceData) printInvoice(invoiceData); }}
                disabled={!invoiceData}
                style={{
                  width: '100%', padding: '0.75rem',
                  background: '#fff', color: '#1A1A1A',
                  border: '2px solid #fde68a', borderRadius: '12px',
                  fontWeight: '700', fontSize: '0.95rem',
                  cursor: invoiceData ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s'
                }}
              >
                🖨️ Print Invoice
              </button>

              {/* WhatsApp — only if phone available */}
              {customerPhone && (
                <button
                  onClick={() => {
                    sendWhatsApp(
                      customerPhone,
                      invoiceData?.invoice_number || 'N/A',
                      customerName,
                      successGrandTotal,
                      user?.store_name || 'SAIRIK'
                    );
                  }}
                  style={{
                    width: '100%', padding: '0.75rem',
                    background: '#25D366', color: '#fff',
                    border: 'none', borderRadius: '12px',
                    fontWeight: '700', fontSize: '0.95rem',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  💬 Send on WhatsApp
                </button>
              )}
            </div>
          )}

          {/* Dashboard link */}
          <button
            onClick={() => router.push('/store/dashboard')}
            style={{
              background: 'none', border: 'none',
              color: '#9ca3af', fontSize: '0.85rem',
              cursor: 'pointer', textDecoration: 'underline'
            }}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN FORM
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: '#fafaf5', paddingBottom: '4rem' }}>

      {/* ── STICKY HEADER ── */}
      <header style={{
        background: 'linear-gradient(90deg,#1A1A1A,#D4AF37)', color: '#fff',
        padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)', position: 'sticky', top: 0, zIndex: 50
      }}>
        <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', cursor: 'pointer', fontWeight: '600' }}>← Back</button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>New Sale</h1>
        {cartItems.length > 0 && (
          <span style={{ marginLeft: 'auto', background: '#fff', color: '#D4AF37', borderRadius: '999px', padding: '0.2rem 0.9rem', fontSize: '0.85rem', fontWeight: '700' }}>
            🛒 {cartItems.length} line{cartItems.length !== 1 ? 's' : ''} · ₹{fmtInt(Math.round(cartTotal))}
          </span>
        )}
      </header>

      <main style={{ padding: '1.25rem', maxWidth: '660px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 1 — Customer Details
          ══════════════════════════════════════════════════════════════ */}
          <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)' }}>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '1rem', fontWeight: '800', color: '#1A1A1A' }}>👤 Customer Details</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <Label htmlFor="cname">Customer Name *</Label>
                <Input id="cname" placeholder="Full name" value={customerName}
                  onChange={e => setCustomerName(e.target.value)} required style={{ marginTop: '0.3rem', background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <Label htmlFor="cphone" style={{ color: '#1A1A1A', fontWeight: '600' }}>Phone (optional)</Label>
                  <Input id="cphone" type="tel" placeholder="Mobile number" value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)} style={{ marginTop: '0.3rem', background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
                </div>
                <div>
                  <Label htmlFor="cemail" style={{ color: '#1A1A1A', fontWeight: '600' }}>Email (optional)</Label>
                  <Input id="cemail" type="email" placeholder="email@example.com" value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)} style={{ marginTop: '0.3rem', background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2 — Product & Variant Picker
          ══════════════════════════════════════════════════════════════ */}
          <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)' }}>
            <CardHeader style={{ paddingBottom: '0.5rem' }}>
              <CardTitle style={{ fontSize: '1rem', fontWeight: '800', color: '#1A1A1A' }}>🛍️ Add Product to Cart</CardTitle>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Category */}
              <div>
                <Label style={{ color: '#1A1A1A', fontWeight: '600' }}>Category</Label>
                <Select onValueChange={val => setSelectedCatId(val)}>
                  <SelectTrigger style={{ marginTop: '0.3rem', background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent style={{ background: '#fff', borderColor: '#E8D5A3' }}>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-[#1A1A1A]">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product list / search */}
              {selectedCatId && !selectedProduct && (
                <div>
                  <Label style={{ color: '#1A1A1A', fontWeight: '600' }}>Search Product</Label>
                  <Input type="text" placeholder="Type to filter…"
                    value={productSearch} onChange={e => setProductSearch(e.target.value)}
                    autoComplete="off" style={{ marginTop: '0.3rem', background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
                  <div style={{ marginTop: '0.4rem', border: '1px solid #e5e7eb', borderRadius: '0.6rem', maxHeight: '220px', overflowY: 'auto', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
                    {loadingProducts ? (
                      <div style={{ padding: '1.2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>Loading products…</div>
                    ) : filteredProducts.length === 0 ? (
                      <div style={{ padding: '1.2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                        {productSearch ? 'No products match your search' : 'No products in this category'}
                      </div>
                    ) : filteredProducts.map((p, i) => {
                      const blocked = isBlocked(p.id);

                      const rowBg   = blocked ? '#fef2f2' : '#fff';
                      const hoverBg = blocked ? '#fee2e2' : '#fef9ec';

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (blocked) { setOosClickedId(p.id); return; }
                            setOosClickedId(null);
                            setSelectedProduct(p);
                            setSelectedVariants({});
                          }}
                          style={{
                            display: 'flex', flexDirection: 'column',
                            padding: '0.65rem 1rem',
                            cursor: blocked ? 'not-allowed' : 'pointer',
                            borderBottom: i < filteredProducts.length - 1 ? '1px solid #f3f4f6' : 'none',
                            transition: 'background 0.1s',
                            background: rowBg,
                          }}
                          onMouseEnter={e => {
                            if (!blocked) e.currentTarget.style.background = hoverBg;
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = rowBg;
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{
                              fontWeight: '600', fontSize: '0.875rem',
                              color: blocked ? '#9ca3af' : '#111827'
                            }}>{p.name}</span>

                            {/* Badge */}
                            {blocked ? (
                              <span style={{
                                fontSize: '0.72rem', fontWeight: '800',
                                color: '#dc2626', background: '#fef2f2',
                                border: '1px solid #fca5a5',
                                borderRadius: '999px', padding: '0.1rem 0.6rem',
                                flexShrink: 0
                              }}>⛔ Out of Stock</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>
                                {p.product_variants?.length ?? 0} size{(p.product_variants?.length ?? 0) !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          {/* Message shown on click if blocked */}
                          {blocked && oosClickedId === p.id && (
                            <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#dc2626', fontWeight: '500' }}>
                              ⛔ Currently unavailable. Contact super admin to restock.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!loadingProducts && products.length > 0 && (
                    <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.25rem', textAlign: 'right' }}>
                      {filteredProducts.length} of {products.length} product{products.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}

              {/* ── Variant selection (shown after product chosen) ── */}
              {selectedProduct && (
                <div>
                  {/* Product badge + deselect */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: '#1A1A1A' }}>
                      Select Size & Quantity for <span style={{ color: '#D4AF37' }}>{selectedProduct.name}</span>
                    </p>
                    <button type="button"
                      onClick={() => { setSelectedProduct(null); setSelectedVariants({}); }}
                      style={{ background: '#fee2e2', border: 'none', borderRadius: '8px', padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800', color: '#dc2626' }}>
                      ✕ Change product
                    </button>
                  </div>

                  {/* CHANGE 3: OOS guard — if selected product is blocked, show red banner */}
                  {isBlocked(selectedProduct.id) ? (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fca5a5',
                      borderRadius: '0.6rem', padding: '1rem 1.1rem',
                      textAlign: 'center'
                    }}>
                      <p style={{ margin: '0 0 0.75rem', fontWeight: '700', color: '#dc2626', fontSize: '0.95rem' }}>
                        ⛔ This product is currently out of stock
                      </p>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: '#6b7280' }}>
                        Contact super admin to restock this product.
                      </p>
                      <button type="button"
                        onClick={() => { setSelectedProduct(null); setSelectedVariants({}); }}
                        style={{
                          background: '#fee2e2', border: 'none', borderRadius: '0.4rem',
                          padding: '0.35rem 1rem', cursor: 'pointer',
                          fontSize: '0.82rem', fontWeight: '700', color: '#dc2626'
                        }}>✕ Change Product</button>
                    </div>
                  ) : (
                    /* Variants section */
                    <>
                      {(!selectedProduct.product_variants || selectedProduct.product_variants.length === 0) ? (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No sizes available for this product.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
                      {selectedProduct.product_variants.map(v => {
                        const sv = selectedVariants[v.id];
                        const isSelected = !!sv;
                        const itemSubtotal = sv ? (sv.price - sv.discount) * sv.quantity : 0;
                        return (
                          <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {/* Card */}
                            <div onClick={() => toggleVariant(v)} style={{
                              border: isSelected ? '2px solid #D4AF37' : '1px solid #E8D5A3',
                              borderRadius: '12px', padding: '0.75rem 0.6rem', cursor: 'pointer',
                              background: isSelected ? '#FDFBF3' : '#fff',
                              textAlign: 'center', transition: 'all 0.15s', position: 'relative',
                              boxShadow: isSelected ? '0 4px 12px rgba(212,175,55,0.15)' : 'none'
                            }}>
                              {isSelected && (
                                <span style={{ position: 'absolute', top: '0.35rem', right: '0.4rem', background: '#D4AF37', color: '#fff', borderRadius: '50%', width: '1.1rem', height: '1.1rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}>✓</span>
                              )}
                              <p style={{ fontWeight: '800', fontSize: '1.1rem', color: '#1A1A1A', margin: '0 0 0.2rem' }}>{v.size_ml} ml</p>
                              <p style={{ fontWeight: '700', fontSize: '0.9rem', color: '#6B6B6B', margin: 0 }}>₹{fmtInt(v.price)}</p>
                              <p style={{ fontSize: '0.7rem', color: isSelected ? '#D4AF37' : '#9CA3AF', marginTop: '0.35rem', fontWeight: '800' }}>
                                {isSelected ? '✓ Selected' : 'Tap to select'}
                              </p>
                            </div>

                            {/* Expanded controls when selected */}
                            {isSelected && sv && (
                              <div style={{ background: '#FDFBF3', border: '1px solid #E8D5A3', borderRadius: '8px', padding: '0.8rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {/* Quantity */}
                                <div>
                                  <p style={{ fontSize: '0.65rem', color: '#9CA3AF', margin: '0 0 0.3rem', fontWeight: '700', textTransform: 'uppercase' }}>Qty</p>
                                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E8D5A3', borderRadius: '6px', overflow: 'hidden' }}>
                                    <button type="button" onClick={() => updateVariantField(v.id, 'quantity', sv.quantity - 1)}
                                      style={{ width: '2rem', height: '2rem', background: '#fff', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '1.1rem', color: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                    <input type="number" min={1} value={sv.quantity}
                                      onChange={e => updateVariantField(v.id, 'quantity', parseInt(e.target.value) || 1)}
                                      style={{ width: '2.5rem', textAlign: 'center', border: 'none', borderLeft: '1px solid #E8D5A3', borderRight: '1px solid #E8D5A3', fontSize: '0.85rem', fontWeight: '800', color: '#1A1A1A', outline: 'none', background: '#fff', height: '2rem' }} />
                                    <button type="button" onClick={() => updateVariantField(v.id, 'quantity', sv.quantity + 1)}
                                      style={{ width: '2rem', height: '2rem', background: '#fff', border: 'none', cursor: 'pointer', fontWeight: '800', fontSize: '1.1rem', color: '#D4AF37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                  </div>
                                </div>
                                {/* Discount */}
                                <div>
                                  <p style={{ fontSize: '0.65rem', color: '#9CA3AF', margin: '0 0 0.3rem', fontWeight: '700', textTransform: 'uppercase' }}>Disc/item ₹</p>
                                  <input type="number" min={0} max={v.price} value={sv.discount}
                                    onChange={e => updateVariantField(v.id, 'discount', Number(e.target.value))}
                                    style={{ width: '100%', border: '1px solid #E8D5A3', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.85rem', fontWeight: '800', color: '#1A1A1A', outline: 'none', background: '#fff', height: '2rem' }} />
                                </div>
                                {/* Subtotal */}
                                <p style={{ margin: 0, fontWeight: '700', color: '#16a34a', fontSize: '0.8rem', textAlign: 'right' }}>
                                  = ₹{fmt(itemSubtotal)}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected sizes subtotal */}
                  {hasSelectedVariants && (
                    <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.9rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '600' }}>
                        Selected sizes subtotal ({selectedVariantList.length} size{selectedVariantList.length !== 1 ? 's' : ''})
                      </span>
                      <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '1rem' }}>₹{fmt(variantSubtotal)}</span>
                    </div>
                  )}

                  {/* Add to cart */}
                  <button type="button" onClick={addToCart} disabled={!hasSelectedVariants}
                    style={{
                      marginTop: '0.85rem', width: '100%', padding: '0.75rem',
                      background: hasSelectedVariants ? 'linear-gradient(90deg,#D4AF37,#D4AF37)' : '#e5e7eb',
                      color: hasSelectedVariants ? '#fff' : '#9ca3af',
                      border: 'none', borderRadius: '0.6rem',
                      fontSize: '1rem', fontWeight: '700',
                      cursor: hasSelectedVariants ? 'pointer' : 'not-allowed',
                      boxShadow: hasSelectedVariants ? '0 2px 6px rgba(180,83,9,0.25)' : 'none',
                      transition: 'all 0.15s'
                    }}>
                    {hasSelectedVariants
                      ? `Add ${selectedProduct.name} to Cart (${selectedVariantList.length} size${selectedVariantList.length !== 1 ? 's' : ''})`
                      : 'Select at least one size'}
                   </button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — Cart Summary
          ══════════════════════════════════════════════════════════════ */}
          {cartItems.length > 0 && (
            <Card style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(212,175,55,0.12)', border: '2px solid #D4AF37' }}>
              <CardHeader style={{ paddingBottom: '0.4rem' }}>
                <CardTitle style={{ fontSize: '1rem', fontWeight: '800', color: '#1A1A1A' }}>
                  🛒 Cart ({cartItems.length} line{cartItems.length !== 1 ? 's' : ''})
                </CardTitle>
              </CardHeader>
              <CardContent style={{ paddingTop: '0.25rem' }}>

                {/* Grouped by product */}
                {Object.entries(cartByProduct).map(([productId, items]) => {
                  const productSubtotal = items.reduce((s, i) => s + i.final_price, 0);
                  return (
                    <div key={productId} style={{ marginBottom: '1rem', background: '#fafaf5', border: '1px solid #e5e7eb', borderRadius: '0.6rem', overflow: 'hidden' }}>
                      {/* Product group header */}
                      <div style={{ background: '#f3f4f6', padding: '0.45rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.875rem', color: '#111827', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {items[0].product_name}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{items[0].category_name}</span>
                      </div>
                      {/* Variant rows */}
                      {items.map((item, idx) => {
                        const globalIdx = cartItems.indexOf(item);
                        return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderBottom: idx < items.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                            <span style={{ fontSize: '0.8rem', color: '#374151', minWidth: '45px', fontWeight: '600' }}>{item.size_ml}ml</span>
                            <span style={{ fontSize: '0.78rem', color: '#6b7280', flex: 1 }}>× {item.quantity} @ ₹{fmtInt(item.mrp)}</span>
                            {item.discount_amount > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>−₹{fmtInt(item.discount_amount)}</span>
                            )}
                            <span style={{ fontWeight: '700', color: '#16a34a', fontSize: '0.875rem', minWidth: '70px', textAlign: 'right' }}>₹{fmt(item.final_price)}</span>
                            <button type="button" onClick={() => removeFromCart(globalIdx)}
                              style={{ background: '#fee2e2', border: 'none', borderRadius: '50%', width: '1.4rem', height: '1.4rem', cursor: 'pointer', color: '#dc2626', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                          </div>
                        );
                      })}
                      {/* Product subtotal */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.4rem 0.85rem', background: '#f9fafb', borderTop: '1px dashed #e5e7eb' }}>
                        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Product subtotal:&nbsp;</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#374151' }}>₹{fmt(productSubtotal)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Grand total + Overall Discount */}
                <div style={{ borderTop: '2px dashed #fbbf24', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.875rem' }}>

                  {/* MRP total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                    <span>Total MRP</span>
                    <span style={{ fontWeight: '600', color: '#374151' }}>₹{fmtInt(Math.round(cartMRPTotal))}</span>
                  </div>

                  {/* Per-item discounts */}
                  {totalItemDiscounts > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                      <span>Item Discounts</span>
                      <span style={{ fontWeight: '600' }}>− ₹{fmtInt(Math.round(totalItemDiscounts))}</span>
                    </div>
                  )}

                  {/* Stats row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                    <span>Products / Qty</span>
                    <span style={{ fontWeight: '600', color: '#374151' }}>{uniqueProducts} / {cartQtyTotal}</span>
                  </div>

                  {/* Subtotal after item discounts */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.35rem', borderTop: '1px solid #e5e7eb', color: '#374151', fontWeight: '600' }}>
                    <span>Subtotal</span>
                    <span>₹{fmtInt(Math.round(cartSubtotal))}</span>
                  </div>

                  {/* ── OVERALL DISCOUNT SECTION ── */}
                  <div style={{ background: '#FDFBF3', border: '1px solid #fde68a', borderRadius: '12px', padding: '1rem', marginTop: '0.25rem' }}>
                    <p style={{ fontSize: '0.65rem', color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700', margin: '0 0 0.75rem' }}>
                      Overall Discount on Subtotal
                    </p>

                    {/* Input + quick buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={overallDiscountPercent || ''}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            if (val >= 0 && val <= 100) setOverallDiscountPercent(val);
                          }}
                          placeholder="0"
                          style={{
                            width: '100%', border: '1px solid #D4AF37', borderRadius: '8px',
                            padding: '0.45rem 2rem 0.45rem 0.75rem', textAlign: 'center',
                            fontSize: '1.1rem', fontWeight: '800', color: '#1A1A1A',
                            background: '#fff', outline: 'none', boxSizing: 'border-box'
                          }}
                        />
                        <span style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#D4AF37', fontWeight: '800', fontSize: '1rem', pointerEvents: 'none' }}>%</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {[5, 10, 15, 20].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setOverallDiscountPercent(overallDiscountPercent === pct ? 0 : pct)}
                            style={{
                              padding: '0.4rem 0.5rem', borderRadius: '8px',
                              border: `1px solid ${overallDiscountPercent === pct ? '#D4AF37' : '#fde68a'}`,
                              background: overallDiscountPercent === pct ? '#D4AF37' : '#fff',
                              color: overallDiscountPercent === pct ? '#fff' : '#1A1A1A',
                              fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Calculated amount */}
                    {overallDiscountPercent > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: '#1A1A1A' }}>{overallDiscountPercent}% of ₹{fmtInt(Math.round(cartSubtotal))}</span>
                          <span style={{ color: '#dc2626', fontWeight: '700' }}>− ₹{fmtInt(calculatedOverallDiscount)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOverallDiscountPercent(0)}
                          style={{ background: 'none', border: 'none', color: '#D4AF37', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline', marginTop: '0.3rem', padding: 0 }}
                        >
                          Clear overall discount
                        </button>
                      </>
                    )}
                  </div>

                  {/* Grand final total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #111827', paddingTop: '0.75rem', marginTop: '0.1rem' }}>
                    <span style={{ fontWeight: '800', color: '#111827', fontSize: '1rem' }}>Grand Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '800', color: '#16a34a', fontSize: '1.35rem', lineHeight: 1 }}>₹{fmtInt(Math.round(grandFinalTotal))}</div>
                      {overallDiscountPercent > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af', textDecoration: 'line-through', marginTop: '0.15rem' }}>₹{fmtInt(Math.round(cartSubtotal))}</div>
                      )}
                    </div>
                  </div>

                  {/* Total savings */}
                  {(totalItemDiscounts + calculatedOverallDiscount) > 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.5rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: '600' }}>🎉 Total Savings</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#16a34a' }}>₹{fmtInt(Math.round(totalItemDiscounts + calculatedOverallDiscount))}</span>
                    </div>
                  )}

                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4 — Submit
          ══════════════════════════════════════════════════════════════ */}
          <Button type="submit"
            disabled={submitting || cartItems.length === 0 || !customerName.trim()}
            style={{
              width: '100%', padding: '0.95rem',
              fontSize: '1.05rem', fontWeight: '700',
              background: (!submitting && cartItems.length > 0 && customerName.trim())
                ? 'linear-gradient(90deg,#16a34a,#15803d)' : '#d6d3d1',
              color: (!submitting && cartItems.length > 0 && customerName.trim()) ? '#fff' : '#78716c',
              border: 'none', borderRadius: '0.6rem',
              cursor: (!submitting && cartItems.length > 0 && customerName.trim()) ? 'pointer' : 'not-allowed',
              boxShadow: (!submitting && cartItems.length > 0 && customerName.trim())
                ? '0 2px 8px rgba(22,163,74,0.3)' : 'none',
              transition: 'all 0.15s'
            }}>
            {submitting ? 'Processing…' : cartItems.length === 0 ? 'Add products to cart first' : 'Complete Sale ✓'}
          </Button>

        </form>
      </main>
    </div>
  );
}
