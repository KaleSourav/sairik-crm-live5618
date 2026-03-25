'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, Fragment } from 'react';

interface SaleRecord {
  id: string;
  sale_date: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  product_name: string;
  category_name: string;
  mrp_at_sale: number;
  discount_amount: number;
  final_price: number;
  size_ml?: number | null;
  size_label?: string | null;
  quantity?: number;
}

interface Store {
  id: string;
  name: string;
  location: string;
  username: string;
  is_active: boolean;
}

function groupKey(s: SaleRecord) {
  return `${s.sale_date}||${s.customer_name}||${s.product_name}`;
}

type SaleGroup = { key: string; rows: SaleRecord[]; subtotal: number };

function groupSales(records: SaleRecord[]): SaleGroup[] {
  const sorted = [...records].sort((a, b) => {
    if (b.sale_date      !== a.sale_date)      return b.sale_date.localeCompare(a.sale_date);
    if (a.customer_name  !== b.customer_name)  return a.customer_name.localeCompare(b.customer_name);
    if (a.product_name   !== b.product_name)   return a.product_name.localeCompare(b.product_name);
    return (a.size_ml ?? 0) - (b.size_ml ?? 0);
  });
  const groups: SaleGroup[] = [];
  for (const row of sorted) {
    const k = groupKey(row);
    const last = groups[groups.length - 1];
    if (last && last.key === k) {
      last.rows.push(row);
      last.subtotal += row.final_price || 0;
    } else {
      groups.push({ key: k, rows: [row], subtotal: row.final_price || 0 });
    }
  }
  return groups;
}

function getToday() { return new Date().toISOString().split('T')[0]; }
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function firstOfYear() { return `${new Date().getFullYear()}-01-01`; }

export default function AdminStoreViewPage() {
  const params = useParams();
  const id     = params.id as string;
  const router = useRouter();

  const [sales,   setSales]   = useState<SaleRecord[]>([]);
  const [stores,  setStores]  = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(firstOfMonth());
  const [to,      setTo]      = useState(getToday());
  const [activePreset, setActivePreset] = useState<string>('month');

  async function fetchSales(fromDate = from, toDate = to) {
    setLoading(true);
    const res  = await fetch(`/api/sales?store_id=${id}&from=${fromDate}&to=${toDate}`);
    const data = await res.json();
    setSales(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetch('/api/stores').then(r => r.json()).then(data => setStores(Array.isArray(data) ? data : []));
    fetchSales();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function setPreset(preset: 'today' | 'last7' | 'month' | 'year') {
    const t = getToday();
    const f = preset === 'today' ? t
            : preset === 'last7' ? daysAgo(7)
            : preset === 'month' ? firstOfMonth()
            :                      firstOfYear();
    setFrom(f); setTo(t); setActivePreset(preset);
    fetchSales(f, t);
  }

  function downloadCSV() {
    window.open(`/api/export?store_id=${id}&from=${from}&to=${to}`, '_blank');
  }

  const currentStore = stores.find(s => s.id === id);
  const totalRevenue = sales.reduce((sum, s) => sum + (s.final_price || 0), 0);
  const avgSale      = sales.length > 0 ? totalRevenue / sales.length : 0;
  const totalDiscount = sales.reduce((sum, s) => sum + (s.discount_amount || 0), 0);

  const presetLabels: Record<string, string> = { today: 'Today', last7: 'Week', month: 'Month', year: 'Year' };

  return (
    <div style={{ minHeight: '100vh', background: '#F9F9F7', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap');
        .gs { box-shadow: 0px 4px 20px rgba(212,175,55,0.08); transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .gs:hover { transform: translateY(-4px); box-shadow: 0px 10px 30px rgba(212,175,55,0.15); }
        .preset-btn { padding:0.4rem 1.25rem; border-radius:999px; font-size:0.65rem; font-weight:700; letter-spacing:0.15em; text-transform:uppercase; cursor:pointer; border:none; transition:all 0.2s; font-family:Inter,sans-serif; }
        .preset-active { background:#D4AF37; color:#fff; box-shadow:0 2px 10px rgba(212,175,55,0.3); }
        .preset-inactive { background:transparent; color:#9ca3af; }
        .preset-inactive:hover { color:#D4AF37; }
        .table-row-hover:hover { background: #FEFBF0; }
      `}</style>

      {/* HEADER */}
      <header style={{ position:'sticky', top:0, zIndex:50, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(212,175,55,0.2)', padding:'1rem 3rem', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:'1rem' }}>
        {/* Left */}
        <div style={{ display:'flex', alignItems:'center', gap:'2rem' }}>
          <button onClick={() => router.back()} style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'transparent', border:'none', cursor:'pointer', color:'#D4AF37', fontSize:'0.7rem', fontWeight:'700', letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:'Inter,sans-serif' }}>
            ← All Stores
          </button>
          <div style={{ width:'1px', height:'2.5rem', background:'rgba(212,175,55,0.2)' }} />
          <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
            <img src="/sairik-logo.jpg" alt="SairikCRM" style={{ height:'130px', width:'auto', objectFit:'contain', margin: '-45px 0' }} />
            <div>
              <h1 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.5rem', fontWeight:'700', color:'#1A1A1A', margin:0 }}>
                {currentStore?.name ?? 'Store Analytics'}
              </h1>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', fontSize:'0.65rem', letterSpacing:'0.15em', textTransform:'uppercase', color:'#9ca3af', marginTop:'0.2rem' }}>
                {currentStore?.location && <span style={{ display:'flex', alignItems:'center', gap:'0.25rem' }}><span style={{ color:'#D4AF37' }}>●</span> {currentStore.location}</span>}
                {currentStore && (
                  <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', color: currentStore.is_active ? '#16a34a' : '#9ca3af', fontWeight:'700' }}>
                    <span style={{ width:'0.4rem', height:'0.4rem', background: currentStore.is_active ? '#16a34a' : '#9ca3af', borderRadius:'50%', display:'inline-block' }} />
                    {currentStore.is_active ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: presets + export */}
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'1rem' }}>
          <div style={{ display:'flex', background:'#f3f4f6', borderRadius:'999px', padding:'0.25rem', border:'1px solid #e5e7eb' }}>
            {(['today','last7','month','year'] as const).map(p => (
              <button
                key={p}
                className={`preset-btn ${activePreset === p ? 'preset-active' : 'preset-inactive'}`}
                onClick={() => setPreset(p)}
              >
                {presetLabels[p]}
              </button>
            ))}
          </div>
          {/* Custom date pickers */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ padding:'0.4rem 0.75rem', border:'1px solid rgba(212,175,55,0.3)', background:'#fff', fontSize:'0.8rem', fontFamily:'Inter,sans-serif', outline:'none', color:'#1A1A1A' }} />
            <span style={{ color:'#9ca3af', fontSize:'0.75rem' }}>→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ padding:'0.4rem 0.75rem', border:'1px solid rgba(212,175,55,0.3)', background:'#fff', fontSize:'0.8rem', fontFamily:'Inter,sans-serif', outline:'none', color:'#1A1A1A' }} />
            <button onClick={() => fetchSales()} style={{ padding:'0.4rem 1rem', background:'#1A1A1A', color:'#D4AF37', border:'none', cursor:'pointer', fontSize:'0.7rem', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'Inter,sans-serif', transition:'all 0.2s' }}>
              Filter
            </button>
          </div>
          <button
            onClick={downloadCSV}
            style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 1.5rem', background:'#fff', border:'1px solid #D4AF37', color:'#D4AF37', cursor:'pointer', fontWeight:'700', fontSize:'0.7rem', letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:'Inter,sans-serif', transition:'all 0.3s' }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </header>

      <main style={{ maxWidth:'1440px', margin:'0 auto', padding:'3rem 2rem' }}>

        {/* KPI CARDS */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:'1.5rem', marginBottom:'3rem' }}>
          {[
            { label: 'Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, color: '#D4AF37', sub: 'Selected period' },
            { label: 'Transactions', value: `${sales.length} Sales`, color: '#1A1A1A', sub: 'Selected period' },
            { label: 'Avg Sale', value: `₹${avgSale.toFixed(0)}`, color: '#1A1A1A', sub: 'Per transaction' },
            { label: 'Total Discounts', value: `-₹${totalDiscount.toLocaleString('en-IN')}`, color: '#dc2626', sub: 'Concessions granted' },
          ].map(kpi => (
            <div key={kpi.label} className="gs" style={{ background:'#fff', padding:'1.5rem', border:'1px solid rgba(212,175,55,0.08)' }}>
              <p style={{ fontFamily:'Playfair Display,serif', fontSize:'1rem', fontWeight:'700', color:'#D4AF37', margin:'0 0 0.5rem' }}>{kpi.label}</p>
              <h3 style={{ fontSize:'2rem', fontWeight:'700', color: kpi.color, lineHeight:1, margin:'0 0 0.5rem' }}>{kpi.value}</h3>
              <p style={{ fontSize:'0.7rem', color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', margin:0 }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* SALES TABLE */}
        <section>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingBottom:'0.75rem', marginBottom:'1.5rem', borderBottom:'1px solid rgba(212,175,55,0.15)', position:'relative' }}>
            <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.4rem', fontWeight:'700', color:'#1A1A1A', margin:0 }}>Sales Records</h2>
            {sales.length > 0 && <span style={{ fontSize:'0.65rem', fontWeight:'700', color:'#D4AF37', letterSpacing:'0.2em', textTransform:'uppercase' }}>{sales.length} found</span>}
            <span style={{ position:'absolute', bottom:0, left:0, width:'60px', height:'1px', background:'#D4AF37' }} />
          </div>

          <div className="gs" style={{ background:'#fff', border:'1px solid rgba(212,175,55,0.08)', overflow:'hidden' }}>
            {loading ? (
              <div style={{ textAlign:'center', padding:'4rem', color:'#9ca3af', fontSize:'0.85rem', letterSpacing:'0.1em' }}>Loading...</div>
            ) : sales.length === 0 ? (
              <div style={{ textAlign:'center', padding:'4rem', color:'#9ca3af', fontSize:'0.85rem', letterSpacing:'0.1em' }}>No sales found for this period</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
                  <thead>
                    <tr style={{ background:'rgba(249,247,242,0.5)', borderBottom:'1px solid rgba(212,175,55,0.1)' }}>
                      {['Date','Customer','Contact','Product','Size','Qty','Category','MRP','Discount','Final Price'].map(h => (
                        <th key={h} style={{ padding:'1rem 1.25rem', textAlign:'left', fontSize:'0.6rem', fontWeight:'700', letterSpacing:'0.2em', textTransform:'uppercase', color:'#9ca3af', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupSales(sales).map((group) => {
                      const isMulti = group.rows.length > 1;
                      return (
                        <Fragment key={group.key}>
                          {group.rows.map((sale, ri) => {
                            const isFirst  = ri === 0;
                            const sizeLabel = sale.size_ml ? `${sale.size_ml}ml` : sale.size_label || '—';
                            return (
                              <tr
                                key={sale.id}
                                className="table-row-hover"
                                style={{ borderBottom:'1px solid rgba(212,175,55,0.06)', borderLeft: isMulti ? '3px solid #D4AF37' : 'none', background: isFirst ? '#fff' : 'rgba(212,175,55,0.02)' }}
                              >
                                <td style={{ padding:'0.9rem 1.25rem', color:'#6b7280', whiteSpace:'nowrap', fontSize:'0.82rem' }}>{isFirst ? sale.sale_date : ''}</td>
                                <td style={{ padding:'0.9rem 1.25rem', fontWeight:'600', color:'#1A1A1A' }}>{isFirst ? sale.customer_name : ''}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#9ca3af', fontSize:'0.78rem' }}>{isFirst ? (sale.customer_phone || sale.customer_email || '—') : ''}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#374151', fontWeight: isFirst ? '600' : '400' }}>
                                  {isFirst ? sale.product_name : <span style={{ color:'#d1d5db' }}>↳</span>}
                                </td>
                                <td style={{ padding:'0.9rem 1.25rem' }}>
                                  <span style={{ background:'rgba(212,175,55,0.06)', color:'#9ca3af', border:'1px solid rgba(212,175,55,0.15)', padding:'0.2rem 0.6rem', fontSize:'0.65rem', fontWeight:'700', letterSpacing:'0.1em', textTransform:'uppercase' }}>{sizeLabel}</span>
                                </td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#374151', textAlign:'center' }}>{sale.quantity || 1}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#6b7280', fontSize:'0.82rem' }}>{sale.category_name}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#374151' }}>₹{sale.mrp_at_sale}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#dc2626', fontWeight:'500' }}>{sale.discount_amount > 0 ? `-₹${sale.discount_amount}` : '—'}</td>
                                <td style={{ padding:'0.9rem 1.25rem', color:'#D4AF37', fontWeight:'700' }}>₹{sale.final_price.toLocaleString('en-IN')}</td>
                              </tr>
                            );
                          })}
                          {isMulti && (
                            <tr style={{ background:'rgba(212,175,55,0.04)', borderBottom:'2px solid rgba(212,175,55,0.15)', borderLeft:'3px solid #D4AF37' }}>
                              <td colSpan={3} />
                              <td colSpan={5} style={{ padding:'0.6rem 1.25rem', fontSize:'0.75rem', color:'#D4AF37', fontWeight:'700' }}>
                                📦 Subtotal — {group.rows[0].product_name}
                              </td>
                              <td />
                              <td style={{ padding:'0.6rem 1.25rem', color:'#D4AF37', fontWeight:'800', whiteSpace:'nowrap' }}>₹{group.subtotal.toLocaleString('en-IN')}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </main>

      <footer style={{ marginTop:'4rem', borderTop:'1px solid rgba(212,175,55,0.2)', padding:'2rem', textAlign:'center', color:'#9ca3af', fontSize:'0.65rem', letterSpacing:'0.3em', textTransform:'uppercase', background:'#fff' }}>
        Luxury Retail Intelligence Platform — SairikCRM
      </footer>
    </div>
  );
}
