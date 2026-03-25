'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface Store {
  id: string;
  name: string;
  username: string;
  location: string;
  is_active: boolean;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [stores,    setStores]    = useState<Store[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [bellCount, setBellCount] = useState(0);
  const bellTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [allSales, setAllSales] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalDiscount, setTotalDiscount] = useState(0);
  const [bestSeller, setBestSeller] = useState('');
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [sizeData, setSizeData] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [oosCount, setOosCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('Monthly');

  useEffect(() => {
    async function load() {
      // 1. Auth check
      const meRes = await fetch('/api/auth/me');
      const me    = await meRes.json();
      if (!meRes.ok || me.role !== 'superadmin') {
        router.push('/login');
        return;
      }

      // 2. Fetch stores
      const storesRes = await fetch('/api/stores');
      if (storesRes.ok) {
        const data = await storesRes.json();
        setStores(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    }
    load();

    // Poll combined pending count every 30s
    // = pending stock-requests + store disputes (has_stock, not yet decided)
    async function fetchCount() {
      try {
        const [stockRes, disputeRes] = await Promise.all([
          fetch('/api/stock-requests/count'),
          fetch('/api/store-notifications/admin'),
        ]);
        let total = 0;
        if (stockRes.ok) {
          const d = await stockRes.json();
          total += d.count ?? 0;
        }
        if (disputeRes.ok) {
          const d = await disputeRes.json();
          total += d.dispute_count ?? 0;
        }
        setBellCount(total);
      } catch { /* silent */ }
    }
    fetchCount();
    bellTimerRef.current = setInterval(fetchCount, 30_000);
    return () => { if (bellTimerRef.current) clearInterval(bellTimerRef.current); };
  }, [router]);

  useEffect(() => {
    // Fetch OOS count
    fetch('/api/stock-requests/count')
      .then(r => r.json())
      .then(d => setOosCount(d.count || 0))

    // Fetch all sales for analytics
    const today = new Date()
    
    let fromDate = new Date()
    if (activeFilter === 'Daily') {
      fromDate = new Date()
    } else if (activeFilter === 'Weekly') {
      fromDate.setDate(today.getDate() - 7)
    } else if (activeFilter === 'Monthly') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1)
    } else if (activeFilter === 'Yearly') {
      fromDate = new Date(today.getFullYear(), 0, 1)
    }

    const from = fromDate.toISOString().split('T')[0]
    const to = today.toISOString().split('T')[0]

    // Fetch sales for each store and combine
    fetch('/api/stores')
      .then(r => r.json())
      .then(async (fetchedStores) => {
        const allSalesData: any[] = []
        for (const store of fetchedStores.filter((s:any) => s.is_active)) {
          try {
            const res = await fetch(`/api/sales?store_id=${store.id}&from=${from}&to=${to}`)
            const sales = await res.json()
            if (Array.isArray(sales)) {
              sales.forEach(s => allSalesData.push({ ...s, store_name: store.name }))
            }
          } catch(e) {}
        }

        setAllSales(allSalesData)

        // Calculate KPIs
        const revenue = allSalesData.reduce((sum, s) => sum + (s.final_price || 0), 0)
        setTotalRevenue(revenue)

        const discount = allSalesData.reduce((sum, s) => sum + (s.discount_amount || 0), 0)
        setTotalDiscount(discount)

        // Best seller
        const productCount: Record<string, number> = {}
        allSalesData.forEach(s => {
          productCount[s.product_name] = (productCount[s.product_name] || 0) + 1
        })
        const best = Object.entries(productCount).sort((a,b) => b[1]-a[1])[0]
        if (best) setBestSeller(best[0])

        // Top products
        const productRevenue: Record<string, {units:number, revenue:number}> = {}
        allSalesData.forEach(s => {
          if (!productRevenue[s.product_name]) productRevenue[s.product_name] = {units:0,revenue:0}
          productRevenue[s.product_name].units += (s.quantity || 1)
          productRevenue[s.product_name].revenue += (s.final_price || 0)
        })
        const topP = Object.entries(productRevenue)
          .map(([name, d]) => ({name, ...d}))
          .sort((a,b) => b.revenue - a.revenue)
          .slice(0, 10)
        setTopProducts(topP)

        // Category data
        const catMap: Record<string, number> = {}
        allSalesData.forEach(s => {
          catMap[s.category_name] = (catMap[s.category_name] || 0) + (s.final_price || 0)
        })
        const total = Object.values(catMap).reduce((a,b)=>a+b,0)
        setCategoryData(Object.entries(catMap).map(([name,val])=>({
          name, value: val,
          percent: total > 0 ? Math.round((val/total)*100) : 0
        })))

        // Weekly revenue trend
        const weekMap: Record<string, number> = {
          'Week 1':0,'Week 2':0,'Week 3':0,'Week 4':0
        }
        allSalesData.forEach(s => {
          const day = new Date(s.sale_date).getDate()
          const week = day <= 7 ? 'Week 1' : day <= 14 ? 'Week 2' : day <= 21 ? 'Week 3' : 'Week 4'
          weekMap[week] += (s.final_price || 0)
        })
        setWeeklyData(Object.entries(weekMap).map(([week, revenue]) => ({week, revenue})))

        // Size data
        const sizeMap: Record<string, number> = {}
        allSalesData.forEach(s => {
          const key = s.size_ml ? s.size_ml + 'ml' : 'Other'
          sizeMap[key] = (sizeMap[key] || 0) + (s.quantity || 1)
        })
        const totalUnits = Object.values(sizeMap).reduce((a,b)=>a+b,0)
        setSizeData(Object.entries(sizeMap)
          .map(([size, units]) => ({ size, units, percent: totalUnits > 0 ? Math.round((units/totalUnits)*100) : 0 }))
          .sort((a,b) => b.units - a.units))

        // Top customers
        const custMap: Record<string, {spend:number, phone:string}> = {}
        allSalesData.forEach(s => {
          if (!custMap[s.customer_name]) custMap[s.customer_name] = { spend: 0, phone: s.customer_phone || '' }
          custMap[s.customer_name].spend += (s.final_price || 0)
        })
        setTopCustomers(Object.entries(custMap)
          .map(([name, d]) => ({name, ...d}))
          .sort((a,b) => b.spend - a.spend)
          .slice(0, 3))

        // Recent activity (last 5 sales)
        setRecentActivity([...allSalesData]
          .sort((a,b) => new Date(b.created_at || b.sale_date).getTime() - new Date(a.created_at || a.sale_date).getTime())
          .slice(0, 5)
        )
      })
  }, [stores, activeFilter])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const activeCount   = stores.filter(s => s.is_active).length;
  const inactiveCount = stores.filter(s => !s.is_active).length;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#F9F7F2', fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <img src="/sairik-logo.jpg" alt="SairikCRM" style={{ height: '110px', width: 'auto', objectFit: 'contain', marginBottom: '1.5rem' }} />
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading...</p>
        </div>
      </div>
    );
  }

  const formatINR = (num: number) => '₹' + num.toLocaleString('en-IN')
  const GOLD_COLORS = ['#D4AF37', '#E8C97A', '#A8860E', '#F0D9A0', '#C9A84C']

  return (
    <div className="pb-16" style={{ minHeight: '100vh', background: '#F9F7F2', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;600;700&display=swap');
        .gold-shadow { box-shadow: 0 4px 20px -5px rgba(212,175,55,0.15); transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .gold-shadow:hover { box-shadow: 0 12px 30px -8px rgba(212,175,55,0.25); transform: translateY(-2px); }
        .nav-btn { background: transparent; border: 1px solid rgba(212,175,55,0.4); color: #D4AF37; padding: 0.45rem 1rem; cursor: pointer; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; transition: all 0.3s; font-family: Inter, sans-serif; }
        .nav-btn:hover { background: #D4AF37; color: #fff; }
        .store-card { background: #fff; border: 1px solid rgba(212,175,55,0.1); cursor: pointer; transition: all 0.3s; }
        .store-card:hover { border-color: #D4AF37; box-shadow: 0 12px 30px -8px rgba(212,175,55,0.2); transform: translateY(-2px); }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #D4AF37',
        padding: '1rem 3rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 20px rgba(212,175,55,0.08)'
      }}>
        {/* Logo + Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/sairik-logo.jpg" alt="SairikCRM" style={{ height: '140px', width: 'auto', objectFit: 'contain', margin: '-50px 0' }} />
          <div style={{ borderLeft: '1px solid rgba(212,175,55,0.3)', paddingLeft: '1rem' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: '700', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#D4AF37', marginBottom: '0.2rem' }}>
              Super Admin
            </div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.2rem', fontWeight: '700', color: '#1A1A1A' }}>
              Brand Management Portal
            </div>
          </div>
        </div>

        {/* Nav Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="nav-btn" onClick={() => router.push('/admin/stores')}>
            Manage Stores
          </button>
          <button className="nav-btn" onClick={() => router.push('/admin/products')}>
            Product Catalog
          </button>

          {/* Bell */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => router.push('/admin/notifications')}
              title={bellCount > 0 ? `${bellCount} pending` : 'Notifications'}
              style={{
                background: bellCount > 0 ? 'rgba(212,175,55,0.1)' : 'transparent',
                border: `1px solid ${bellCount > 0 ? '#D4AF37' : 'rgba(212,175,55,0.4)'}`,
                borderRadius: '0',
                padding: '0.45rem 0.6rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: bellCount > 0 ? '#D4AF37' : '#9ca3af',
                transition: 'all 0.2s'
              }}
            >
              <Bell size={17} />
            </button>
            {bellCount > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#dc2626', color: '#fff',
                borderRadius: '999px', minWidth: '1.1rem', height: '1.1rem',
                fontSize: '0.6rem', fontWeight: '800',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 0.2rem', lineHeight: 1, border: '2px solid #fff'
              }}>{bellCount > 99 ? '99+' : bellCount}</span>
            )}
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: '#1A1A1A', color: '#D4AF37',
              border: '1px solid #1A1A1A',
              padding: '0.45rem 1rem', cursor: 'pointer',
              fontWeight: '700', fontSize: '0.75rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'Inter, sans-serif', transition: 'all 0.3s'
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── MAIN ──────────────────────────────────────────────────────── */}
      <main style={{ padding: '3rem', maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── DATE FILTER ── */}
        <div className="flex items-center gap-2 mb-6">
          {['Daily','Weekly','Monthly','Yearly'].map(f => (
            <button key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium
                transition-colors ${activeFilter === f
                  ? 'bg-yellow-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-yellow-400'}`}>
              {f}
            </button>
          ))}
        </div>

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            {label:'TOTAL REVENUE', 
             value: formatINR(totalRevenue), 
             valueClass:'text-2xl font-bold text-gray-900'},
            {label:'TRANSACTIONS', 
             value: allSales.length.toLocaleString(), 
             valueClass:'text-2xl font-bold text-gray-900'},
            {label:'ACTIVE STORES', 
             value: stores.filter(s=>s.is_active).length + ' / ' + stores.length, 
             valueClass:'text-2xl font-bold text-gray-900'},
            {label:'BEST SELLER', 
             value: bestSeller || '—', 
             valueClass:'text-lg font-bold text-yellow-600 uppercase'},
            {label:'TOTAL DISCOUNTS', 
             value: formatINR(totalDiscount), 
             valueClass:'text-2xl font-bold text-gray-900'},
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 border-l-4 border-l-yellow-500">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{card.label}</p>
              <p className={card.valueClass}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── REVENUE TREND + CATEGORY DONUT ── */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {/* Revenue Trend */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-1">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Revenue Trend</h3>
                <div className="w-8 h-0.5 bg-yellow-500 mt-1"/>
              </div>
              <span className="text-gray-300 text-xl">···</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="week" tick={{fontSize:11, fill:'#9CA3AF'}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip formatter={(v:any) => [formatINR(v), 'Revenue']} contentStyle={{borderRadius:8, fontSize:12}}/>
                <Area type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2.5} fill="url(#goldGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sales by Category */}
          <div className="col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Sales by Category</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-4"/>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} dataKey="value" paddingAngle={2}>
                  {categoryData.map((_:any, i:number) => (
                    <Cell key={i} fill={GOLD_COLORS[i % GOLD_COLORS.length]}/>
                  ))}
                </Pie>
                <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-2xl font-bold" style={{fontSize:24,fontWeight:700,fill:'#1A1A1A'}}>
                  100%
                </text>
                <text x="50%" y="57%" textAnchor="middle" style={{fontSize:10,fill:'#9CA3AF',letterSpacing:2}}>
                  TOTAL SHARE
                </text>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {categoryData.map((cat:any, i:number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-3 h-1 rounded-full" style={{backgroundColor: GOLD_COLORS[i%GOLD_COLORS.length]}}/>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">{cat.name} ({cat.percent}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STORE PERFORMANCE + TOP PRODUCTS ── */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {/* Store Performance */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Store Performance Ranking</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-5"/>
            {(() => {
              const storeRevMap: Record<string,number> = {}
              allSales.forEach((s:any) => {
                if (s.store_name) {
                  storeRevMap[s.store_name] = (storeRevMap[s.store_name]||0) + (s.final_price||0)
                }
              })
              const maxRev = Math.max(...Object.values(storeRevMap),1)
              return stores
                .filter((s:any) => s.is_active)
                .map((store:any) => {
                  const rev = storeRevMap[store.name] || 0
                  const pct = Math.round((rev/maxRev)*100)
                  return (
                    <div key={store.id} onClick={() => router.push('/admin/store/' + store.id)} className="mb-4 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                          {store.name} {store.location ? ` — ${store.location}` : ''}
                        </span>
                        <span className="text-sm font-bold text-yellow-600">
                          {formatINR(rev)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full transition-all" style={{width: pct + '%'}}/>
                      </div>
                    </div>
                  )
                })
            })()}
            <p className="text-xs text-gray-400 mt-3 text-center italic">
              Click any store to view detailed sales →
            </p>
          </div>

          {/* Top 10 Products */}
          <div className="col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Top 10 Products</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-4"/>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs text-gray-400 uppercase tracking-wide pb-2">Product</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide pb-2">Units</th>
                  <th className="text-right text-xs text-gray-400 uppercase tracking-wide pb-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i===0 ? 'bg-yellow-50' : i%2===0 ? 'bg-gray-50/50' : ''}`}>
                    <td className="py-2 text-gray-800">
                      {i===0 && '🥇 '}{i===1 && '🥈 '}{i===2 && '🥉 '}{p.name}
                    </td>
                    <td className="py-2 text-right text-gray-600">{p.units}</td>
                    <td className="py-2 text-right font-semibold text-yellow-700">{formatINR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SELLING SIZES + ELITE CUSTOMERS + LIVE ACTIVITY ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Selling Sizes */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Selling Sizes</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-5"/>
            <div className="grid grid-cols-2 gap-3">
              {sizeData.slice(0,4).map((s, i) => (
                <div key={i} className={`rounded-xl p-4 ${i===0 ? 'bg-yellow-500/10 border border-yellow-200' : 'bg-gray-50'}`}>
                  <p className="text-xs text-yellow-600 uppercase tracking-widest font-medium mb-1">{s.size}</p>
                  <p className="text-3xl font-bold text-gray-900">{s.percent}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Elite Customers */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Elite Customers</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-5"/>
            {topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400 italic">Gold Tier Member</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-yellow-600">{formatINR(c.spend)}</span>
              </div>
            ))}
          </div>

          {/* Live Activity */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Live Activity</h3>
            <div className="w-8 h-0.5 bg-yellow-500 mb-5"/>
            {recentActivity.map((s, i) => (
              <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{backgroundColor: i===0 ? '#D4AF37' : '#D1D5DB'}}/>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    New Sale: {s.product_name}
                    {s.size_ml ? ` (${s.size_ml}ml)` : ''}
                  </p>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mt-0.5">
                    {i === 0 ? 'JUST NOW' : `${i * 5} MINS AGO`} • {s.store_name || 'STORE'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── OOS ALERT BAR ── */}
        {oosCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-amber-50 border-t border-amber-200 py-3 px-8 flex items-center justify-between z-50">
            <div className="flex items-center gap-2">
              <span className="text-amber-500">⚠️</span>
              <span className="text-sm font-bold tracking-wide text-amber-800 uppercase">
                {oosCount} STORES HAVE PENDING OOS REQUESTS
              </span>
            </div>
            <button
              onClick={() => router.push('/admin/notifications')}
              className="bg-yellow-500 text-white rounded-full px-5 py-1.5 text-sm font-medium hover:bg-yellow-600 transition-colors">
              REVIEW NOW
            </button>
          </div>
        )}

        {/* Section header */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{
            fontFamily: 'Playfair Display, serif',
            fontSize: '1.6rem', fontWeight: '700',
            color: '#1A1A1A', marginBottom: '0.5rem'
          }}>
            All Stores
          </h2>
          <div style={{ width: '40px', height: '2px', background: '#D4AF37', marginBottom: '0.75rem' }} />
          {stores.length > 0 && (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', letterSpacing: '0.05em' }}>
              <span style={{ color: '#D4AF37', fontWeight: '700' }}>{activeCount} active</span>
              {' '}· {inactiveCount} inactive
            </p>
          )}
        </div>

        {/* Stores Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}>
          {stores.length === 0 ? (
            <p style={{ color: '#9ca3af', gridColumn: '1/-1', textAlign: 'center', padding: '4rem', fontSize: '0.9rem', letterSpacing: '0.1em' }}>
              NO STORES FOUND
            </p>
          ) : (
            stores.map(store => (
              <div
                key={store.id}
                className="store-card gold-shadow"
                onClick={() => router.push(`/admin/store/${store.id}`)}
                style={{ opacity: store.is_active ? 1 : 0.55, padding: '1.75rem' }}
              >
                {/* Top row: name + badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{
                    fontFamily: 'Playfair Display, serif',
                    fontSize: '1.15rem', fontWeight: '700',
                    color: '#1A1A1A', margin: 0
                  }}>
                    {store.name}
                  </h3>
                  <span style={{
                    background: store.is_active ? 'rgba(212,175,55,0.08)' : '#f3f4f6',
                    color: store.is_active ? '#D4AF37' : '#9ca3af',
                    border: `1px solid ${store.is_active ? 'rgba(212,175,55,0.3)' : '#e5e7eb'}`,
                    padding: '0.2rem 0.65rem',
                    fontSize: '0.65rem', fontWeight: '700',
                    letterSpacing: '0.15em', textTransform: 'uppercase'
                  }}>
                    {store.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Location */}
                <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 0.4rem', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <span style={{ color: '#D4AF37' }}>●</span> {store.location || 'No location set'}
                </p>

                {/* Username */}
                <p style={{ fontSize: '0.75rem', color: '#d1d5db', margin: '0 0 1.25rem', letterSpacing: '0.05em' }}>
                  @{store.username}
                </p>

                {/* CTA */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingTop: '1rem', borderTop: '1px solid rgba(212,175,55,0.1)'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#D4AF37', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    View Analytics
                  </span>
                  <span style={{ color: '#D4AF37', fontSize: '0.9rem' }}>→</span>
                </div>
              </div>
            ))
          )}
        </div>

      </main>
    </div>
  );
}
