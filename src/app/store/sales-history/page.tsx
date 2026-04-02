'use client';

import React, { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { downloadInvoicePDF } from '@/lib/invoice-generator';

// ── Types ──────────────────────────────────────────────────────────────────────
interface SaleRecord {
  id: string;
  sale_date: string;
  customer_name: string;
  customer_phone: string;
  product_name: string;
  product_id: string;
  category_name: string;
  mrp_at_sale: number;
  discount_amount: number;
  final_price: number;
  size_ml?: number | null;
  size_label?: string | null;
  quantity?: number;
  invoice_number?: string | null;
  overall_discount_percent?: number | null;
}

// ── Group key: date + customer + product ──────────────────────────────────────
function groupKey(s: SaleRecord) {
  return `${s.sale_date}||${s.customer_name}||${s.product_name}`;
}

type SaleGroup = { key: string; rows: SaleRecord[]; subtotal: number };

function groupSales(records: SaleRecord[]): SaleGroup[] {
  const sorted = [...records].sort((a, b) => {
    if (b.sale_date    !== a.sale_date)    return b.sale_date.localeCompare(a.sale_date);
    if (a.customer_name !== b.customer_name) return a.customer_name.localeCompare(b.customer_name);
    if (a.product_name  !== b.product_name)  return a.product_name.localeCompare(b.product_name);
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

function getToday()    { return new Date().toISOString().split('T')[0]; }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function SalesHistoryPage() {
  const router = useRouter();

  const [sales,   setSales]   = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [from,    setFrom]    = useState(getToday());
  const [to,      setTo]      = useState(getToday());
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  async function handleDownloadInvoice(invoiceNumber: string) {
    if (downloadingInvoice) return;
    setDownloadingInvoice(invoiceNumber);
    try {
      const res = await fetch(`/api/invoice?invoice_number=${invoiceNumber}`);
      if (res.ok) {
        const d = await res.json();
        const firstSale = d.sales?.[0] || {};
        const fullData = {
          ...d,
          generated_at: firstSale.invoice_generated_at || firstSale.created_at || new Date().toISOString(),
          customer_name: firstSale.customer_name || 'Customer',
          customer_phone: firstSale.customer_phone,
          customer_email: firstSale.customer_email,
          overall_discount_percent: firstSale.overall_discount_percent
        };
        await downloadInvoicePDF(fullData);
      } else {
        alert('Invoice not found.');
      }
    } catch {
      alert('Error downloading invoice.');
    } finally {
      setDownloadingInvoice(null);
    }
  }

  // OOS state removed

  async function fetchSales(fromDate = from, toDate = to) {
    setLoading(true);
    const res  = await fetch(`/api/sales?from=${fromDate}&to=${toDate}`);
    const data = await res.json();
    setSales(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  // Load existing pending requests on mount
  useEffect(() => {
    fetchSales();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setPreset(preset: 'today' | 'last7' | 'month') {
    let f = getToday(), t = getToday();
    if (preset === 'last7') f = daysAgo(7);
    if (preset === 'month') f = firstOfMonth();
    setFrom(f); setTo(t);
    fetchSales(f, t);
  }

  // Computed
  const totalRevenue  = sales.reduce((s, r) => s + (r.final_price    || 0), 0);
  const totalDiscount = sales.reduce((s, r) => s + (r.discount_amount || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf5' }}>

      {/* ── HEADER ── */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #E8D5A3',
        color: '#1A1A1A', padding: '1rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem',
        boxShadow: '0 2px 8px rgba(212,175,55,0.08)',
        position: 'sticky', top: 0, zIndex: 40
      }}>
        <button onClick={() => router.back()} style={{
          background: '#FDFBF3', border: '1px solid #E8D5A3',
          color: '#D4AF37', borderRadius: '0.5rem', padding: '0.35rem 0.85rem',
          cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem'
        }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#1A1A1A' }}>Sales History</h1>
          <div style={{ width: '32px', height: '2px', background: '#D4AF37', marginTop: '3px' }} />
        </div>
        <img src="/sairik-logo.jpg" alt="SAIRIK" style={{ height: '130px', width: 'auto', objectFit: 'contain', margin: '-45px 0' }} />
      </header>

      <main style={{ padding: '1.25rem', maxWidth: '1200px', margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── FILTER CARD ── */}
        <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)' }}>
          <CardContent style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {([
                { label: 'Today',       key: 'today' as const },
                { label: 'Last 7 Days', key: 'last7' as const },
                { label: 'This Month',  key: 'month' as const },
              ]).map(p => (
                <button key={p.key} onClick={() => setPreset(p.key)} style={{
                  padding: '0.35rem 0.9rem', borderRadius: '999px',
                  border: '1px solid #E8D5A3', background: '#fff',
                  color: '#6B6B6B', fontWeight: '600', fontSize: '0.85rem',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FDFBF3'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#D4AF37'; (e.currentTarget as HTMLButtonElement).style.color = '#D4AF37'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8D5A3'; (e.currentTarget as HTMLButtonElement).style.color = '#6B6B6B'; }}
                >{p.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#374151', fontWeight: '500' }}>From:</label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: '160px' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', color: '#374151', fontWeight: '500' }}>To:</label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: '160px' }} />
              </div>
              <Button onClick={() => fetchSales()} style={{
                background: '#D4AF37', color: '#fff',
                border: 'none', borderRadius: '10px',
                padding: '0.45rem 1.25rem', fontWeight: '700', cursor: 'pointer'
              }}>Search</Button>
            </div>
          </CardContent>
        </Card>

        {/* ── SUMMARY CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)' }}>
            <CardHeader style={{ paddingBottom: '0.25rem' }}>
              <CardTitle style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '500' }}>Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '2rem', fontWeight: '800', color: '#D4AF37', lineHeight: 1 }}>{sales.length}</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <CardHeader style={{ paddingBottom: '0.25rem' }}>
              <CardTitle style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '500' }}>Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '2rem', fontWeight: '800', color: '#16a34a', lineHeight: 1 }}>₹{totalRevenue.toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
          <Card style={{ borderRadius: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <CardHeader style={{ paddingBottom: '0.25rem' }}>
              <CardTitle style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '500' }}>Total Discounts Given</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: '2rem', fontWeight: '800', color: '#dc2626', lineHeight: 1 }}>₹{totalDiscount.toLocaleString('en-IN')}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── DATA TABLE ── */}
        <Card style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8D5A3', boxShadow: '0 4px 12px rgba(212,175,55,0.08)', overflow: 'hidden' }}>
          <CardHeader>
            <CardTitle style={{ fontSize: '1rem', color: '#374151' }}>
              Records
              {sales.length > 0 && (
                <span style={{ fontWeight: '400', fontSize: '0.85rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                  ({sales.length} found)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent style={{ padding: 0 }}>
            {loading ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>Loading...</p>
            ) : sales.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>No records found for this period</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#FDFBF3', borderBottom: '2px solid #fde68a' }}>
                    {['Date', 'Customer', 'Phone', 'Product', 'Size', 'Qty', 'Category', 'MRP', 'Discount', 'Final Price', 'Invoice'].map(h => (
                        <th key={h} style={{
                          padding: '0.65rem 0.85rem', textAlign: 'left',
                          fontWeight: '700', color: '#fff',
                          background: '#D4AF37', fontSize: '0.72rem',
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          whiteSpace: 'nowrap'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      return groupSales(sales).map((group) => {
                        const isMulti = group.rows.length > 1;

                        return (
                          <React.Fragment key={group.key}>
                            {group.rows.map((sale, ri) => {
                              const isFirst   = ri === 0;
                              const sizeLabel = sale.size_ml ? `${sale.size_ml}ml` : sale.size_label || '—';
                              return (
                                <tr key={sale.id} style={{
                                  borderBottom: '1px solid #f3f4f6',
                                  background: isFirst ? '#fff' : '#fffbf0',
                                  borderLeft: isMulti ? '3px solid #f59e0b' : 'none',
                                }}
                                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fef9ec'}
                                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = isFirst ? '#fff' : '#fffbf0'}
                                >
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#374151', whiteSpace: 'nowrap' }}>
                                    {isFirst ? sale.sale_date : ''}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', fontWeight: '500', color: '#1f2937' }}>
                                    {isFirst ? sale.customer_name : ''}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#6b7280' }}>
                                    {isFirst ? (sale.customer_phone || '—') : ''}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#374151', fontWeight: isFirst ? '600' : '400' }}>
                                    {isFirst ? sale.product_name : <span style={{ color: '#d1d5db' }}>↳</span>}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                    {sizeLabel}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#374151', textAlign: 'center' }}>
                                    {sale.quantity || 1}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#6b7280' }}>{sale.category_name}</td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#374151' }}>₹{sale.mrp_at_sale}</td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#dc2626', fontWeight: '500' }}>
                                    {sale.discount_amount > 0 ? `-₹${sale.discount_amount}` : '—'}
                                    {(sale.overall_discount_percent ?? 0) > 0 && (
                                      <span style={{ marginLeft: '0.4rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', padding: '0.1rem 0.35rem', fontSize: '0.65rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                        +{sale.overall_discount_percent}% overall
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem', color: '#16a34a', fontWeight: '700' }}>
                                    ₹{sale.final_price.toLocaleString('en-IN')}
                                  </td>
                                  <td style={{ padding: '0.6rem 0.85rem' }}>
                                    {sale.invoice_number ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{
                                          fontSize: '0.72rem', fontFamily: 'monospace',
                                          color: '#1A1A1A', background: '#FDFBF3',
                                          padding: '0.2rem 0.4rem', borderRadius: '4px',
                                          border: '1px solid #fde68a', whiteSpace: 'nowrap'
                                        }}>
                                          {sale.invoice_number}
                                        </span>
                                        <button
                                          onClick={() => handleDownloadInvoice(sale.invoice_number!)}
                                          disabled={downloadingInvoice === sale.invoice_number}
                                          style={{
                                            background: '#D4AF37', color: '#fff', border: 'none',
                                            borderRadius: '4px', padding: '0.2rem 0.4rem',
                                            cursor: downloadingInvoice === sale.invoice_number ? 'wait' : 'pointer',
                                            fontSize: '0.65rem', fontWeight: 'bold'
                                          }}
                                          title="Download PDF"
                                        >
                                          {downloadingInvoice === sale.invoice_number ? '...' : '⬇️'}
                                        </button>
                                      </div>
                                    ) : (
                                      <span style={{ color: '#d1d5db', fontSize: '0.85rem' }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {/* Subtotal row */}
                            {isMulti && (
                              <tr style={{ background: '#FDFBF3', borderBottom: '2px solid #fde68a', borderLeft: '3px solid #f59e0b' }}>
                                <td colSpan={3} />
                                <td colSpan={5} style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem', color: '#1A1A1A', fontWeight: '700' }}>
                                  📦 Subtotal — {group.rows[0].product_name}
                                </td>
                                <td />
                                <td style={{ padding: '0.4rem 0.85rem', color: '#16a34a', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                  ₹{group.subtotal.toLocaleString('en-IN')}
                                </td>
                                <td />
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
