'use client';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; }
interface Variant  { id: string; size_ml: number | null; size_label: string | null; price: number; }
interface Product  { id: string; name: string; mrp: number; category_id: string; category_name: string; product_variants: Variant[]; is_globally_oos?: boolean; globally_oos_at?: string | null; globally_oos_message?: string | null; globally_oos_effective_at?: string | null; }
interface RawProduct { id: string; name: string; mrp: number; category_id: string; categories?: { name: string } | null; category_name?: string; product_variants?: Variant[]; }
interface Form     { name: string; category_id: string; }
interface DraftVariant { size_label: string; price: string; } // for add-form draft

// Perfume defaults shown as info
const PERFUME_DEFAULTS = [
  { label: '15ml', price: '₹300' },
  { label: '30ml', price: '₹550' },
  { label: '50ml', price: '₹750' },
  { label: '100ml', price: '₹1,300' },
];

export default function ProductCatalogPage() {
  const router = useRouter();

  const [products,      setProducts]      = useState<Product[]>([]);
  const [categories,    setCategories]    = useState<Category[]>([]);
  const [form,          setForm]          = useState<Form>({ name: '', category_id: '' });
  const [activeFilter,  setActiveFilter]  = useState('');
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [successMsg,    setSuccessMsg]    = useState('');

  // ── Category management ───────────────────────────────────────────────────
  const [catOpen,       setCatOpen]       = useState(false);
  const [newCatName,    setNewCatName]    = useState('');
  const [catError,      setCatError]      = useState('');
  const [catSuccess,    setCatSuccess]    = useState('');
  const [deletingCatId,     setDeletingCatId]     = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchText,    setSearchText]    = useState('');

  // ── "Add product" variant builder ─────────────────────────────────────────
  const [newVariants,      setNewVariants]      = useState<DraftVariant[]>([]);
  const [variantDraft,     setVariantDraft]     = useState<DraftVariant>({ size_label: '', price: '' });

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editProduct,   setEditProduct]   = useState<Product | null>(null);
  const [editName,      setEditName]      = useState('');
  const [editVariants,  setEditVariants]  = useState<Variant[]>([]);
  const [editNewDraft,  setEditNewDraft]  = useState<DraftVariant>({ size_label: '', price: '' });
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState('');
  const [deletedVarIds, setDeletedVarIds] = useState<string[]>([]);

  // ── Global OOS ────────────────────────────────────────────────────────────
  const [oosDialog,        setOosDialog]        = useState<{ product: Product; mode: 'mark' | 'reenable' } | null>(null);
  const [oosMessage,       setOosMessage]       = useState('');
  const [oosProcessingId,  setOosProcessingId]  = useState<string | null>(null);
  const [activeStoreCount, setActiveStoreCount] = useState(0);
  const [toast,            setToast]            = useState('');
  const [toastError,       setToastError]       = useState('');
  const [showOosOnly,      setShowOosOnly]      = useState(false);
  // Separate authoritative set from API, not derived from product.is_globally_oos
  const [globalOosSet,     setGlobalOosSet]     = useState<Set<string>>(new Set());
  const [globalOosMap,     setGlobalOosMap]     = useState<Record<string, { name: string; message: string | null }>>({});
  const [disputeCount,     setDisputeCount]     = useState(0);

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/stores').then(r => r.json()),
      fetch('/api/products/global-oos/status').then(r => r.ok ? r.json() : []),
      fetch('/api/store-notifications/admin').then(r => r.ok ? r.json() : { dispute_count: 0 }),
    ]).then(([cats, rawProds, stores, oosStatus, disputeData]: [
      Category[], RawProduct[], { is_active: boolean }[],
      { product_id: string; product_name: string; globally_oos_message: string | null }[],
      { dispute_count: number }
    ]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      const normalised: Product[] = (Array.isArray(rawProds) ? rawProds : []).map(p => ({
        ...p,
        category_name:    p.category_name ?? p.categories?.name ?? '',
        product_variants: p.product_variants ?? [],
      }));
      setProducts(normalised);
      setActiveStoreCount(Array.isArray(stores) ? stores.filter(s => s.is_active).length : 0);
      // Build global OOS set from dedicated status endpoint (source of truth)
      const oosArr = Array.isArray(oosStatus) ? oosStatus : [];
      setGlobalOosSet(new Set(oosArr.map(e => e.product_id)));
      const oosMapNew: Record<string, { name: string; message: string | null }> = {};
      oosArr.forEach(e => { oosMapNew[e.product_id] = { name: e.product_name, message: e.globally_oos_message }; });
      setGlobalOosMap(oosMapNew);
      setDisputeCount(disputeData?.dispute_count ?? 0);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isPerfumeCat = (catId: string) =>
    categories.find(c => c.id === catId)?.name?.toLowerCase() === 'perfume';

  const variantLabel = (v: Variant) =>
    v.size_label ? v.size_label : v.size_ml ? `${v.size_ml}ml` : '—';

  // ── Add product ───────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!form.name.trim() || !form.category_id) {
      setError('Please fill in all fields'); return;
    }
    const isPerf = isPerfumeCat(form.category_id);
    if (!isPerf && newVariants.length === 0) {
      setError('Add at least one size variant'); return;
    }
    setError('');

    const variantsPayload = isPerf
      ? undefined
      : newVariants.map(v => ({ size_label: v.size_label, size_ml: null, price: parseFloat(v.price) }));

    const res  = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name.trim(), category_id: form.category_id, variants: variantsPayload })
    });
    const data = await res.json();
    if (res.ok) {
      const cat = categories.find(c => c.id === form.category_id);
      setProducts(p => [...p, { ...data, category_name: cat?.name ?? '', product_variants: data.product_variants ?? [] }]);
      setForm({ name: '', category_id: '' });
      setNewVariants([]);
      setVariantDraft({ size_label: '', price: '' });
      setSuccessMsg('Product added!');
      setTimeout(() => setSuccessMsg(''), 2500);
    } else {
      setError(data.error || 'Failed to add product');
    }
  }

  // ── Variant builder for add-form ──────────────────────────────────────────
  function addDraftVariant() {
    if (!variantDraft.size_label.trim() || !variantDraft.price) return;
    setNewVariants(v => [...v, variantDraft]);
    setVariantDraft({ size_label: '', price: '' });
  }
  function removeDraftVariant(i: number) {
    setNewVariants(v => v.filter((_, idx) => idx !== i));
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  async function handleAddCategory() {
    setCatError('');
    if (!newCatName.trim()) { setCatError('Category name cannot be empty'); return; }
    const res  = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCatName.trim() }) });
    const data = await res.json();
    if (res.ok) {
      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCatName('');
      setCatSuccess('Category added!');
      setTimeout(() => setCatSuccess(''), 2500);
    } else { setCatError(data.error || 'Failed to add category'); }
  }

  async function handleDeleteCategory(id: string) {
    setDeletingCatId(id);
    const res  = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setCategories(prev => prev.filter(c => c.id !== id));
      if (activeFilter === id) setActiveFilter('');
      setCatSuccess('Category deleted!');
      setTimeout(() => setCatSuccess(''), 2500);
    } else { setCatError(data.error || 'Failed to delete category'); }
    setDeletingCatId(null);
  }

  // ── Delete product ─────────────────────────────────────────────────────────
  async function handleDeleteProduct(product: Product) {
    if (!confirm(`Delete "${product.name}"? This will also remove all its variants.`)) return;
    setDeletingProductId(product.id);
    const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
    if (res.ok) {
      setProducts(ps => ps.filter(p => p.id !== product.id));
      setSuccessMsg(`"${product.name}" deleted.`);
      setTimeout(() => setSuccessMsg(''), 2500);
    } else {
      const d = await res.json();
      alert(d.error || 'Failed to delete product');
    }
    setDeletingProductId(null);
  }

  // ── Global OOS helpers ────────────────────────────────────────────────────
  function showToast(msg: string, error = false) {
    if (error) { setToastError(msg); setTimeout(() => setToastError(''), 4000); }
    else       { setToast(msg);      setTimeout(() => setToast(''), 4000); }
  }

  async function handleMarkGlobalOos() {
    if (!oosDialog) return;
    const { product } = oosDialog;
    setOosProcessingId(product.id);
    const res  = await fetch('/api/products/global-oos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, message: oosMessage || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      // Update both the product list field AND the authoritative OOS set
      setProducts(ps => ps.map(p => p.id === product.id
        ? { ...p, is_globally_oos: true, globally_oos_message: oosMessage || null, globally_oos_at: new Date().toISOString() }
        : p
      ));
      setGlobalOosSet(prev => {
        const next = new Set(Array.from(prev));
        next.add(product.id);
        return next;
      });
      setGlobalOosMap(prev => ({ ...prev, [product.id]: { name: product.name, message: oosMessage || null } }));
      showToast(`✅ "${product.name}" marked OOS instantly. ${data.affected_stores} store${data.affected_stores !== 1 ? 's' : ''} notified.`);
    } else {
      showToast(data.error || 'Failed to mark OOS', true);
    }
    setOosDialog(null); setOosMessage(''); setOosProcessingId(null);
  }

  async function handleReEnableGlobal(productId?: string, productName?: string) {
    // Called either from dialog or from quick-re-enable in summary bar
    const id   = productId   ?? oosDialog?.product.id;
    const name = productName ?? oosDialog?.product.name;
    if (!id) return;
    setOosProcessingId(id);
    const res = await fetch(`/api/products/global-oos?product_id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProducts(ps => ps.map(p => p.id === id
        ? { ...p, is_globally_oos: false, globally_oos_at: null, globally_oos_message: null }
        : p
      ));
      setGlobalOosSet(prev => { const s = new Set(prev); s.delete(id); return s; });
      setGlobalOosMap(prev => { const m = { ...prev }; delete m[id]; return m; });
      showToast(`✅ "${name}" re-enabled globally. All stores notified.`);
    } else {
      showToast('Failed to re-enable', true);
    }
    setOosDialog(null); setOosProcessingId(null);
  }

  // ── Open edit modal ───────────────────────────────────────────────────────
  async function openEdit(product: Product) {
    setEditError('');
    setEditProduct(product);
    setEditName(product.name);
    setDeletedVarIds([]);
    setEditNewDraft({ size_label: '', price: '' });

    // Fetch fresh variants
    const res  = await fetch(`/api/variants?product_id=${product.id}`);
    const vars = await res.json();
    setEditVariants(Array.isArray(vars) ? vars : product.product_variants);
  }

  function closeEdit() { setEditProduct(null); setEditSaving(false); }

  function markVariantDeleted(varId: string) {
    setDeletedVarIds(ids => [...ids, varId]);
    setEditVariants(vs => vs.filter(v => v.id !== varId));
  }

  function updateEditVariantPrice(varId: string, newPrice: string) {
    setEditVariants(vs => vs.map(v => v.id === varId ? { ...v, price: parseFloat(newPrice) || 0 } : v));
  }

  function updateEditVariantLabel(varId: string, newLabel: string) {
    setEditVariants(vs => vs.map(v => v.id === varId ? { ...v, size_label: newLabel } : v));
  }

  function addEditNewVariant() {
    if (!editNewDraft.size_label.trim() || !editNewDraft.price) return;
    // Use a temp id starting with "new-" so we know to POST these
    const tempId = `new-${Date.now()}`;
    setEditVariants(vs => [...vs, { id: tempId, size_ml: null, size_label: editNewDraft.size_label.trim(), price: parseFloat(editNewDraft.price) }]);
    setEditNewDraft({ size_label: '', price: '' });
  }

  // ── Save edits ────────────────────────────────────────────────────────────
  async function handleSaveEdit() {
    if (!editProduct) return;
    setEditSaving(true);
    setEditError('');

    // 1. PATCH product name if changed
    if (editName.trim() !== editProduct.name) {
      const r = await fetch(`/api/products/${editProduct.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() })
      });
      if (!r.ok) { const d = await r.json(); setEditError(d.error || 'Failed to update name'); setEditSaving(false); return; }
    }

    // 2. DELETE removed variants
    for (const varId of deletedVarIds) {
      await fetch(`/api/variants/${varId}`, { method: 'DELETE' });
    }

    // 3. PATCH existing variants and POST new ones
    for (const v of editVariants) {
      if (v.id.startsWith('new-')) {
        // POST new variant
        await fetch('/api/variants', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: editProduct.id, size_label: v.size_label, price: v.price })
        });
      } else {
        // PATCH existing
        await fetch(`/api/variants/${v.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: v.price, size_label: v.size_label })
        });
      }
    }

    // 4. Fetch fresh variants to update local state
    const freshVarsRes = await fetch(`/api/variants?product_id=${editProduct.id}`);
    const freshVars    = await freshVarsRes.json();

    // 5. Update products list
    setProducts(ps => ps.map(p => p.id === editProduct.id
      ? { ...p, name: editName.trim(), product_variants: Array.isArray(freshVars) ? freshVars : editVariants }
      : p
    ));

    setSuccessMsg('Product updated!');
    setTimeout(() => setSuccessMsg(''), 2500);
    setEditSaving(false);
    closeEdit();
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const globalOosCount   = globalOosSet.size;
  const categoryFiltered = activeFilter ? products.filter(p => p.category_id === activeFilter) : products;
  const searchTrimmed    = searchText.trim().toLowerCase();
  const baseFiltered     = showOosOnly ? products.filter(p => globalOosSet.has(p.id)) : categoryFiltered;
  const filteredProducts = searchTrimmed ? baseFiltered.filter(p => p.name.toLowerCase().includes(searchTrimmed)) : baseFiltered;
  const activeCat        = categories.find(c => c.id === activeFilter);
  const productCountByCat = (catId: string) => products.filter(p => p.category_id === catId).length;
  // Array of OOS products for summary bar
  const oosProductsList  = products.filter(p => globalOosSet.has(p.id));

  function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: '#fef08a', color: '#78350f', borderRadius: '2px', padding: '0 2px', fontWeight: '800' }}>
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.9rem', borderRadius: '999px',
    border:  active ? 'none' : '1px solid #E8D5A3',
    background: active ? '#D4AF37' : '#fff',
    color:      active ? '#fff' : '#6B6B6B',
    fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer',
    whiteSpace: 'nowrap' as const, transition: 'all 0.15s',
  });

  const inputStyle: React.CSSProperties = {
    padding: '0.42rem 0.65rem', border: '1px solid #d1d5db',
    borderRadius: '0.4rem', fontSize: '0.85rem', color: '#111827',
    outline: 'none', background: '#fff',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F2', fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        background: '#fff', padding: '1rem 1.75rem',
        borderBottom: '1px solid #E8D5A3',
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        boxShadow: '0 2px 8px rgba(212,175,55,0.08)',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <button onClick={() => router.back()} style={{
          background: '#FDFBF3', border: '1px solid #E8D5A3',
          color: '#D4AF37', borderRadius: '8px', padding: '0.35rem 0.85rem',
          cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem'
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: '#1A1A1A' }}>Product Catalog</h1>
          <div style={{ width: '32px', height: '2px', background: '#D4AF37', marginTop: '3px' }} />
        </div>
        {/* Disputes badge */}
        {disputeCount > 0 && (
          <button
            onClick={() => router.push('/admin/notifications')}
            style={{
              marginLeft: 'auto', background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: '8px', padding: '0.35rem 0.9rem',
              fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(220,38,38,0.2)', whiteSpace: 'nowrap'
            }}
          >
            ⚠️ {disputeCount} store{disputeCount !== 1 ? 's' : ''} claiming they have stock — Review
          </button>
        )}
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      <main style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── Toasts ────────────────────────────────────────────────────── */}
        {successMsg && (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#16a34a', borderRadius: '0.5rem', padding: '0.65rem 1rem', fontWeight: '600', fontSize: '0.9rem' }}>
            ✅ {successMsg}
          </div>
        )}

        {/* ── MANAGE CATEGORIES (collapsible) ──────────────────────────── */}
        <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)', overflow: 'hidden' }}>
          <button onClick={() => setCatOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.85rem 1.25rem',
            background: catOpen ? '#FDFBF3' : '#fff',
            border: 'none', cursor: 'pointer',
            borderBottom: catOpen ? '1px solid #E8D5A3' : 'none',
            transition: 'background 0.2s'
          }}>
            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: catOpen ? '#D4AF37' : '#1A1A1A' }}>📁 Manage Categories</span>
            <span style={{ fontSize: '0.85rem', color: catOpen ? '#D4AF37' : '#6B6B6B', display: 'inline-block', transform: catOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
          </button>

          {catOpen && (
            <CardContent style={{ padding: '1.25rem' }}>
              {catError   && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '0.45rem', padding: '0.6rem 0.9rem', fontSize: '0.875rem', fontWeight: '500', marginBottom: '1rem' }}>⚠️ {catError}</div>}
              {catSuccess && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#16a34a', borderRadius: '0.45rem', padding: '0.6rem 0.9rem', fontSize: '0.875rem', fontWeight: '600', marginBottom: '1rem' }}>✅ {catSuccess}</div>}

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                {/* Left */}
                <div style={{ flex: '0 0 280px' }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontWeight: '800', fontSize: '0.88rem', color: '#1A1A1A' }}>Add New Category</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input placeholder="e.g. Body Mist" value={newCatName}
                      onChange={e => { setNewCatName(e.target.value); setCatError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleAddCategory()} style={{ flex: 1, background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
                    <button onClick={handleAddCategory} style={{ background: '#D4AF37', color: '#fff', border: '1px solid #D4AF37', borderRadius: '8px', padding: '0.45rem 1rem', fontWeight: '800', fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
                  </div>
                </div>
                {/* Right */}
                <div style={{ flex: '1 1 340px' }}>
                  <p style={{ margin: '0 0 0.75rem 0', fontWeight: '800', fontSize: '0.88rem', color: '#1A1A1A' }}>Existing Categories ({categories.length})</p>
                  {categories.length === 0 ? <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No categories yet.</p> : (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
                      {categories.map((cat, i) => {
                        const count = productCountByCat(cat.id);
                        const canDel = count === 0;
                        const isDel  = deletingCatId === cat.id;
                        return (
                            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: i % 2 === 0 ? '#fff' : '#FDFBF3', borderBottom: i < categories.length - 1 ? '1px solid #E8D5A3' : 'none' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ fontWeight: '700', color: '#1A1A1A', fontSize: '0.875rem' }}>{cat.name}</span>
                              <span style={{ background: count > 0 ? '#FDFBF3' : '#f3f4f6', color: count > 0 ? '#1A1A1A' : '#6b7280', borderRadius: '999px', padding: '0.1rem 0.55rem', fontSize: '0.75rem', fontWeight: '600' }}>
                                {count} product{count !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {canDel ? (
                              <button onClick={() => handleDeleteCategory(cat.id)} disabled={isDel} style={{ background: isDel ? '#fca5a5' : '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '0.4rem', padding: '0.25rem 0.65rem', fontSize: '0.78rem', fontWeight: '700', cursor: isDel ? 'not-allowed' : 'pointer' }}>
                                {isDel ? '...' : 'Delete'}
                              </button>
                            ) : (
                              <button disabled title="Remove all products first" style={{ background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '0.4rem', padding: '0.25rem 0.65rem', fontSize: '0.78rem', fontWeight: '600', cursor: 'not-allowed' }}>Delete</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* ── ADD PRODUCT CARD ─────────────────────────────────────────── */}
        <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)' }}>
          <CardHeader style={{ paddingBottom: '0.25rem' }}>
            <CardTitle style={{ fontSize: '1rem', fontWeight: '800', color: '#1A1A1A' }}>Add New Product</CardTitle>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

            {/* Row 1: Category + Name */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A1A1A', display: 'block', marginBottom: '0.3rem' }}>Category *</label>
                <select value={form.category_id} onChange={e => { setForm(f => ({ ...f, category_id: e.target.value })); setNewVariants([]); setVariantDraft({ size_label: '', price: '' }); }}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #E8D5A3', borderRadius: '8px', fontSize: '0.875rem', color: form.category_id ? '#1A1A1A' : '#9CA3AF', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                  <option value="" disabled>Select category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex: '2 1 220px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A1A1A', display: 'block', marginBottom: '0.3rem' }}>Product Name *</label>
                <Input placeholder="e.g. Bella Vita Luxe" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ background: '#fff', color: '#1A1A1A', borderColor: '#E8D5A3' }} />
              </div>
            </div>

            {/* Row 2: Variants section (conditional on category) */}
            {form.category_id && (
              isPerfumeCat(form.category_id) ? (
                // Perfume info box
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                  <p style={{ margin: '0 0 0.4rem 0', fontWeight: '700', fontSize: '0.82rem', color: '#0369a1' }}>🌸 Standard perfume sizes will be auto-created:</p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {PERFUME_DEFAULTS.map(d => (
                      <span key={d.label} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.2rem 0.7rem', fontSize: '0.8rem', fontWeight: '600' }}>
                        {d.label} {d.price}
                      </span>
                    ))}
                  </div>
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.78rem', color: '#0ea5e9' }}>You can modify these after adding the product.</p>
                </div>
              ) : (
                // Custom variants builder
                <div style={{ background: '#FDFBF3', borderRadius: '8px', border: '1px solid #E8D5A3', padding: '0.85rem' }}>
                  <p style={{ margin: '0 0 0.6rem 0', fontWeight: '800', fontSize: '0.85rem', color: '#1A1A1A' }}>Size Variants *</p>

                  {/* Draft input row */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: '1 1 120px' }} placeholder="Size (e.g. 6ml, Small)"
                      value={variantDraft.size_label}
                      onChange={e => setVariantDraft(d => ({ ...d, size_label: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addDraftVariant()} />
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E8D5A3', borderRadius: '8px', overflow: 'hidden', flex: '1 1 110px' }}>
                      <span style={{ padding: '0.42rem 0.55rem', background: '#FDFBF3', borderRight: '1px solid #E8D5A3', fontWeight: '800', fontSize: '0.85rem', color: '#1A1A1A' }}>₹</span>
                      <input type="number" min="0" placeholder="Price" style={{ flex: 1, border: 'none', outline: 'none', padding: '0.42rem 0.55rem', fontSize: '0.85rem', color: '#1A1A1A', background: '#fff' }}
                        value={variantDraft.price}
                        onChange={e => setVariantDraft(d => ({ ...d, price: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addDraftVariant()} />
                    </div>
                    <button onClick={addDraftVariant} style={{ background: '#D4AF37', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.42rem 0.9rem', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add</button>
                  </div>

                  {/* Tags */}
                  {newVariants.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem' }}>
                      {newVariants.map((v, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#FDFBF3', color: '#D4AF37', border: '1px solid #E8D5A3', borderRadius: '999px', padding: '0.25rem 0.65rem', fontSize: '0.82rem', fontWeight: '700' }}>
                          {v.size_label} — ₹{v.price}
                          <button onClick={() => removeDraftVariant(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: '800', fontSize: '0.85rem', padding: 0, lineHeight: 1 }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {/* Submit row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <Button onClick={handleAdd} style={{ background: '#D4AF37', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 1.4rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 2px 8px rgba(212,175,55,0.3)' }}>
                Add Product
              </Button>
              {error && <span style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: '600' }}>⚠️ {error}</span>}
            </div>
          </CardContent>
        </Card>

        {/* ── GLOBAL OOS SUMMARY BAR ──────────────────────────────────── */}
        {!loading && globalOosCount > 0 && (
          <div style={{
            background: '#7f1d1d', color: '#fff', borderRadius: '0.65rem',
            padding: '0.8rem 1.1rem', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', gap: '0.6rem'
          }}>
            {/* Top row: count + toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontWeight: '800', fontSize: '0.92rem' }}>
                🌐 {globalOosCount} product{globalOosCount !== 1 ? 's' : ''} currently globally out of stock
              </span>
              <button
                onClick={() => setShowOosOnly(v => !v)}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: '999px', padding: '0.2rem 0.7rem', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showOosOnly ? 'Show all ✕' : 'View only OOS →'}
              </button>
            </div>
            {/* Product name tags with quick re-enable */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {oosProductsList.map(p => (
                <span key={p.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: 'rgba(255,255,255,0.12)', borderRadius: '999px',
                  padding: '0.2rem 0.55rem 0.2rem 0.75rem',
                  fontSize: '0.78rem', fontWeight: '700'
                }}>
                  {p.name}
                  {globalOosMap[p.id]?.message && (
                    <span style={{ fontWeight: '400', opacity: 0.75 }}>· {globalOosMap[p.id].message}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleReEnableGlobal(p.id, p.name); }}
                    disabled={oosProcessingId === p.id}
                    title="Re-enable this product"
                    style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%', width: '1.1rem', height: '1.1rem', cursor: oosProcessingId === p.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#fff', fontWeight: '900', lineHeight: 1, flexShrink: 0, padding: 0 }}
                  >
                    {oosProcessingId === p.id ? '…' : '✕'}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── FILTER TABS ──────────────────────────────────────────────── */}
        {!loading && !showOosOnly && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => setActiveFilter('')} style={pill(activeFilter === '')}>All ({products.length})</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveFilter(cat.id)} style={pill(activeFilter === cat.id)}>
                {cat.name} ({productCountByCat(cat.id)})
              </button>
            ))}
          </div>
        )}

        {/* ── SEARCH BAR ───────────────────────────────────────────────── */}
        {!loading && (
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', color: '#9ca3af', pointerEvents: 'none', lineHeight: 1 }}>🔍</span>
            <input type="text" placeholder="Search products by name..." value={searchText} onChange={e => setSearchText(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 2.5rem 0.6rem 2.5rem', border: '1px solid #d1d5db', borderRadius: '0.5rem', fontSize: '0.9rem', color: '#111827', background: '#fff', outline: 'none', boxShadow: searchText ? '0 0 0 2px #bfdbfe' : 'none', transition: 'box-shadow 0.15s' }} />
            {searchText && (
              <button onClick={() => setSearchText('')} title="Clear search" style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: '#e5e7eb', border: 'none', borderRadius: '999px', width: '1.35rem', height: '1.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.75rem', color: '#374151', fontWeight: '700', lineHeight: 1 }}>✕</button>
            )}
          </div>
        )}

        {/* ── PRODUCT LIST ─────────────────────────────────────────────── */}
        <Card style={{ borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <CardHeader style={{ paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
              {searchTrimmed && activeCat ? <>Showing <strong style={{ color: '#111827' }}>{filteredProducts.length}</strong> of <strong style={{ color: '#111827' }}>{categoryFiltered.length}</strong> results for <em>&lsquo;{searchText.trim()}&rsquo;</em> in <strong style={{ color: '#111827' }}>{activeCat.name}</strong></>
              : searchTrimmed ? <>Showing <strong style={{ color: '#111827' }}>{filteredProducts.length}</strong> of <strong style={{ color: '#111827' }}>{products.length}</strong> products matching <em>&lsquo;{searchText.trim()}&rsquo;</em></>
              : activeCat ? <>Showing <strong style={{ color: '#111827' }}>{filteredProducts.length}</strong> product{filteredProducts.length !== 1 ? 's' : ''} in <strong style={{ color: '#111827' }}>{activeCat.name}</strong></>
              : <>Showing <strong style={{ color: '#111827' }}>{filteredProducts.length}</strong> product{filteredProducts.length !== 1 ? 's' : ''}</>}
            </p>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading...</p>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0' }}>
                  {searchTrimmed ? <>No products found for <em>&lsquo;{searchText.trim()}&rsquo;</em></> : 'No products in this category yet'}
                </p>
                {searchTrimmed && (
                  <button onClick={() => setSearchText('')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Clear search</button>
                )}
              </div>
            ) : (
              <div>
                {filteredProducts.map((product, i) => {
                  const isOos   = globalOosSet.has(product.id);
                  const rowBg   = isOos ? '#fef2f2' : i % 2 === 0 ? '#fff' : '#fafafa';
                  const hoverBg = isOos ? '#fee2e2' : '#f0f9ff';
                  const oosNote = globalOosMap[product.id]?.message ?? null;
                  return (
                    <div key={product.id} style={{
                      padding: '0.8rem 1.25rem',
                      borderBottom: i < filteredProducts.length - 1 ? '1px solid #f3f4f6' : 'none',
                      background: rowBg, transition: 'background 0.12s',
                      borderLeft: isOos ? '5px solid #dc2626' : '5px solid transparent',
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = hoverBg}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = rowBg}
                    >
                      {/* OOS banner */}
                      {isOos && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ background: '#dc2626', color: '#fff', borderRadius: '999px', padding: '0.15rem 0.65rem', fontSize: '0.72rem', fontWeight: '800', letterSpacing: '0.03em' }}>🌐 GLOBALLY OUT OF STOCK</span>
                          {oosNote && (
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>{oosNote}</span>
                          )}
                        </div>
                      )}

                      {/* Top row: name left, buttons right */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: '700', color: isOos ? '#991b1b' : '#111827', fontSize: '0.95rem' }}>
                            {highlightMatch(product.name, searchTrimmed)}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.1rem' }}>{product.category_name}</p>
                        </div>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                          {isOos ? (
                            /* Only Re-enable when globally OOS — no edit/delete */
                            <button
                              onClick={() => setOosDialog({ product, mode: 'reenable' })}
                              disabled={oosProcessingId === product.id}
                              style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '0.4rem', padding: '0.3rem 0.85rem', fontSize: '0.8rem', fontWeight: '700', cursor: oosProcessingId === product.id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: oosProcessingId === product.id ? 0.6 : 1 }}
                            >
                              {oosProcessingId === product.id ? '⏳…' : 'Re-enable Globally ✅'}
                            </button>
                          ) : (
                            <>
                              <button onClick={() => { setOosMessage(''); setOosDialog({ product, mode: 'mark' }); }} style={{ background: '#fff', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                🌐 Mark Global OOS
                              </button>
                              <button onClick={() => openEdit(product)} style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>Edit ✏️</button>
                              <button onClick={() => handleDeleteProduct(product)} disabled={deletingProductId === product.id} style={{ background: deletingProductId === product.id ? '#fca5a5' : '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: '700', cursor: deletingProductId === product.id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                                {deletingProductId === product.id ? '...' : 'Delete 🗑'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Variant chips */}
                      {product.product_variants.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {product.product_variants.map(v => (
                            <span key={v.id} style={{ background: '#f3f4f6', color: '#374151', borderRadius: '6px', padding: '0.15rem 0.55rem', fontSize: '0.78rem', fontWeight: '600' }}>
                              {variantLabel(v)} · ₹{v.price.toLocaleString('en-IN')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </main>

      {/* ── TOASTS ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.9rem', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 3000, whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
      {toastError && (
        <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: '999px', fontWeight: '700', fontSize: '0.9rem', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 3000, whiteSpace: 'nowrap' }}>
          ⚠️ {toastError}
        </div>
      )}

      {/* ═══ GLOBAL OOS DIALOG ══════════════════════════════════════════════ */}
      {oosDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) { setOosDialog(null); setOosMessage(''); } }}
        >
          <div style={{ background: '#fff', borderRadius: '0.85rem', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Dialog header */}
            <div style={{ background: oosDialog.mode === 'reenable' ? '#16a34a' : '#dc2626', color: '#fff', padding: '1rem 1.25rem' }}>
              <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem' }}>
                {oosDialog.mode === 'mark'     && '🌐 Mark as Globally Out of Stock?'}
                {oosDialog.mode === 'reenable' && '✅ Re-enable Product Globally?'}
              </p>
            </div>
            {/* Dialog body */}
            <div style={{ padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <p style={{ margin: 0, fontWeight: '800', fontSize: '1rem', color: '#111827' }}>{oosDialog.product.name}</p>
              {oosDialog.mode === 'mark' && (
                <>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 }}>
                    This will <strong>IMMEDIATELY</strong> block this product in <strong>ALL active stores</strong>.<br />
                    All stores will receive an instant notification.
                  </p>
                  <div style={{ background: '#FDFBF3', border: '1px solid #fde68a', borderRadius: '0.45rem', padding: '0.55rem 0.85rem', fontSize: '0.82rem', color: '#1A1A1A', fontWeight: '700' }}>
                    ⚡ This affects {activeStoreCount} active store{activeStoreCount !== 1 ? 's' : ''} — effective immediately.
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>Reason (optional — stores will see this)</label>
                    <textarea value={oosMessage} onChange={e => setOosMessage(e.target.value)}
                      placeholder="e.g. Supplier shortage, manufacturing issue"
                      rows={2} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '0.45rem', padding: '0.5rem 0.75rem', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </>
              )}
              {oosDialog.mode === 'reenable' && (
                <>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.6 }}>
                    This will notify all stores that the product is <strong>available again</strong>.
                  </p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#6b7280' }}>
                    Stores with approved exemptions will also be reset.
                  </p>
                </>
              )}
            </div>
            {/* Dialog footer */}
            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setOosDialog(null); setOosMessage(''); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '0.45rem', padding: '0.45rem 1rem', fontWeight: '600', cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
              <button
                disabled={!!oosProcessingId}
                onClick={oosDialog.mode === 'mark' ? handleMarkGlobalOos : () => handleReEnableGlobal()}
                style={{ background: oosDialog.mode === 'reenable' ? '#16a34a' : '#dc2626', color: '#fff', border: 'none', borderRadius: '0.45rem', padding: '0.45rem 1.2rem', fontWeight: '800', cursor: oosProcessingId ? 'not-allowed' : 'pointer', fontSize: '0.875rem', opacity: oosProcessingId ? 0.7 : 1 }}>
                {oosProcessingId ? '⏳ Processing…'
                  : oosDialog.mode === 'mark'     ? 'Mark Out of Stock Now'
                  : 'Re-enable Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT MODAL ══════════════════════════════════════════════════════ */}
      {editProduct && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem'
        }} onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div style={{
            background: '#fff', borderRadius: '0.85rem',
            width: '100%', maxWidth: '560px', maxHeight: '90vh',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
          }}>
            {/* Modal header */}
            <div style={{ background: '#111827', color: '#fff', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: '800', fontSize: '1rem' }}>✏️ Edit Product</span>
              <button onClick={closeEdit} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '0.35rem', padding: '0.25rem 0.6rem', cursor: 'pointer', fontSize: '1rem', fontWeight: '700' }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {editError && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '0.45rem', padding: '0.6rem 0.9rem', fontSize: '0.875rem' }}>⚠️ {editError}</div>}

              {/* Product name */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>Product Name</label>
                <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                  value={editName} onChange={e => setEditName(e.target.value)} />
              </div>

              {/* Existing variants */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>Size Variants</label>
                {editVariants.length === 0 && <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>No variants yet.</p>}
                {editVariants.map((v) => (
                  <div key={v.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <input style={{ ...inputStyle, flex: '1 1 100px' }}
                      value={v.size_label ?? (v.size_ml ? `${v.size_ml}ml` : '')}
                      onChange={e => updateEditVariantLabel(v.id, e.target.value)}
                      placeholder="Size label" />
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '0.4rem', overflow: 'hidden', flex: '1 1 100px' }}>
                      <span style={{ padding: '0.42rem 0.55rem', background: '#f3f4f6', borderRight: '1px solid #d1d5db', fontWeight: '700', fontSize: '0.85rem', color: '#374151' }}>₹</span>
                      <input type="number" min="0" style={{ flex: 1, border: 'none', outline: 'none', padding: '0.42rem 0.55rem', fontSize: '0.85rem', color: '#111827' }}
                        value={v.price} onChange={e => updateEditVariantPrice(v.id, e.target.value)} />
                    </div>
                    <button onClick={() => markVariantDeleted(v.id)}
                      style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '0.4rem', padding: '0.35rem 0.6rem', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', flexShrink: 0 }}>🗑</button>
                  </div>
                ))}

                {/* Add new variant row */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.7rem', borderTop: '1px dashed #e5e7eb' }}>
                  <input style={{ ...inputStyle, flex: '1 1 100px' }} placeholder="Size (e.g. 50ml)"
                    value={editNewDraft.size_label}
                    onChange={e => setEditNewDraft(d => ({ ...d, size_label: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addEditNewVariant()} />
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '0.4rem', overflow: 'hidden', flex: '1 1 100px' }}>
                    <span style={{ padding: '0.42rem 0.55rem', background: '#f3f4f6', borderRight: '1px solid #d1d5db', fontWeight: '700', fontSize: '0.85rem', color: '#374151' }}>₹</span>
                    <input type="number" min="0" placeholder="Price" style={{ flex: 1, border: 'none', outline: 'none', padding: '0.42rem 0.55rem', fontSize: '0.85rem', color: '#111827' }}
                      value={editNewDraft.price}
                      onChange={e => setEditNewDraft(d => ({ ...d, price: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addEditNewVariant()} />
                  </div>
                  <button onClick={addEditNewVariant} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.4rem', padding: '0.42rem 0.85rem', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}>+ Add</button>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={closeEdit} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.5rem 1.1rem', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSaving} style={{ background: editSaving ? '#6b7280' : '#111827', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1.4rem', fontWeight: '700', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
