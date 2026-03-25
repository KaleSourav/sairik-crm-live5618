'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client'
import { Bell } from 'lucide-react'

interface SaleRecord {
  id: string;
  customer_name: string;
  product_name: string;
  category_name: string;
  final_price: number;
  discount_amount: number;
  sale_date: string;
  created_at?: string;
  size_ml?: number;
  quantity?: number;
}

interface User {
  role: string;
  store_id: string;
  store_name: string;
}

export default function StoreDashboardPage() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [sales,   setSales]   = useState<SaleRecord[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [hasNewNotification, setHasNewNotification] = useState(false)
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null)
  const [unreadGlobalCount, setUnreadGlobalCount] = useState(0);
  const globalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [biggestSale, setBiggestSale] = useState<any>(null)
  const [mostSold, setMostSold] = useState('')
  const [weeklyRevenue, setWeeklyRevenue] = useState(0)
  const [monthlyRevenue, setMonthlyRevenue] = useState(0)
  const [bestSeller, setBestSeller] = useState('')
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) { router.push('/login'); return; }
      const meData = await meRes.json();
      setUser(meData);

      const today = new Date().toISOString().split('T')[0];
      const salesRes = await fetch(`/api/sales?from=${today}&to=${today}`);
      if (salesRes.ok) {
        const data = await salesRes.json();
        setSales(data);

        // Biggest sale today
        const biggest = data.reduce((max: any, s: any) => 
          !max || s.final_price > max.final_price ? s : max, null)
        setBiggestSale(biggest)

        // Most sold product today
        const productCount: Record<string, number> = {}
        data.forEach((s: any) => {
          productCount[s.product_name] = 
            (productCount[s.product_name] || 0) + (s.quantity || 1)
        })
        const topProduct = Object.entries(productCount)
          .sort((a, b) => b[1] - a[1])[0]
        if (topProduct) setMostSold(topProduct[0])
      }

      fetch('/api/store-notifications')
        .then(r => r.json())
        .then(data => {
          if (data.notifications) 
            setNotifications(data.notifications)
        })
        .catch(() => {})

      const notifsRes = await fetch('/api/stock-requests');
      if (notifsRes.ok) {
        const notifs: { status: string; resolved_at?: string }[] = await notifsRes.json();
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        setHasNewNotification(Array.isArray(notifs) && notifs.some(
          n => n.status !== 'pending' && n.resolved_at && new Date(n.resolved_at).getTime() > oneDayAgo
        ));
      }
      setLoading(false);
    }
    load();

    async function fetchGlobalUnread() {
      try {
        const r = await fetch('/api/store-notifications');
        if (r.ok) { 
          const d = await r.json(); 
          setUnreadGlobalCount(d.unread_count ?? 0); 
          if (d.notifications) setNotifications(d.notifications);
        }
      } catch { /* silent */ }
    }
    fetchGlobalUnread();
    globalPollRef.current = setInterval(fetchGlobalUnread, 60_000);
    return () => { if (globalPollRef.current) clearInterval(globalPollRef.current); };
  }, [router]);

  useEffect(() => {
    if (!user) return
    
    // Weekly revenue
    const today = new Date()
    const weekAgo = new Date()
    weekAgo.setDate(today.getDate() - 7)
    fetch(`/api/sales?from=${weekAgo.toISOString().split('T')[0]}&to=${today.toISOString().split('T')[0]}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setWeeklyRevenue(
            data.reduce((sum, s) => sum + (s.final_price || 0), 0)
          )
          // Best seller this week
          const pc: Record<string,number> = {}
          data.forEach((s:any) => {
            pc[s.product_name] = (pc[s.product_name]||0)+1
          })
          const best = Object.entries(pc)
            .sort((a,b) => b[1]-a[1])[0]
          if (best) setBestSeller(best[0])
        }
      })
    
    // Monthly revenue  
    const monthStart = new Date(today.getFullYear(), 
      today.getMonth(), 1).toISOString().split('T')[0]
    fetch(`/api/sales?from=${monthStart}&to=${today.toISOString().split('T')[0]}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMonthlyRevenue(
            data.reduce((sum, s) => sum + (s.final_price || 0), 0)
          )
        }
      })
  }, [user])

  useEffect(() => {
    if (!user?.store_id) return

    // Subscribe to new notifications for this store
    const notificationSubscription = supabaseClient
      .channel('store-notifications-' + user.store_id)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'global_oos_notifications',
          filter: 'store_id=eq.' + user.store_id
        },
        (payload) => {
          console.log('New global notification:', payload)
          
          const newNotif = payload.new as any
          
          // Add to notifications list immediately
          setNotifications(prev => [newNotif, ...prev])
          
          // Show alert banner
          if (newNotif.type === 'global_oos_alert') {
            setRealtimeAlert(
              '⛔ ' + newNotif.product_name + 
              ' has been marked out of stock by admin'
            )
          } else if (newNotif.type === 're_enabled') {
            setRealtimeAlert(
              '✅ ' + newNotif.product_name + 
              ' is now available again'
            )
          }
          
          // Set notification badge
          setHasNewNotification(true)
          
          // Auto dismiss alert after 5 seconds
          setTimeout(() => setRealtimeAlert(null), 5000)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'global_oos_notifications',
          filter: 'store_id=eq.' + user.store_id
        },
        (payload) => {
          console.log('Notification updated:', payload)
          
          const updated = payload.new as any
          
          // Update the notification in state
          setNotifications(prev => 
            prev.map(n => n.id === updated.id ? updated : n)
          )
          
          // Show alert for admin decision
          if (updated.admin_decision === 'allow_selling') {
            setRealtimeAlert(
              '✅ Admin approved — You can sell ' + 
              updated.product_name
            )
            setTimeout(() => setRealtimeAlert(null), 6000)
          } else if (updated.admin_decision === 'keep_blocked') {
            setRealtimeAlert(
              '❌ Admin decision — ' + 
              updated.product_name + ' remains blocked'
            )
            setTimeout(() => setRealtimeAlert(null), 6000)
          }
          
          setHasNewNotification(true)
        }
      )
      .subscribe()

    // Subscribe to stock request updates for this store
    const stockRequestSubscription = supabaseClient
      .channel('stock-requests-' + user.store_id)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stock_requests',
          filter: 'store_id=eq.' + user.store_id
        },
        (payload) => {
          const updated = payload.new as any
          
          if (updated.status === 'accepted') {
            setRealtimeAlert(
              '✅ OOS request accepted for ' + 
              updated.product_name
            )
          } else if (updated.status === 'rejected') {
            setRealtimeAlert(
              '❌ OOS request rejected for ' + 
              updated.product_name + 
              (updated.admin_message 
                ? ': ' + updated.admin_message 
                : '')
            )
          }
          
          setHasNewNotification(true)
          setTimeout(() => setRealtimeAlert(null), 6000)
        }
      )
      .subscribe()

    // Subscribe to product global OOS status changes
    const productSubscription = supabaseClient
      .channel('products-oos-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products'
        },
        (payload) => {
          const updated = payload.new as any
          const previous = payload.old as any
          
          // Product just became globally OOS
          if (updated.is_globally_oos && !previous.is_globally_oos) {
            setRealtimeAlert(
              '⛔ ' + updated.name + 
              ' is now out of stock across all stores'
            )
            setHasNewNotification(true)
            setTimeout(() => setRealtimeAlert(null), 5000)
          }
          
          // Product re-enabled
          if (!updated.is_globally_oos && previous.is_globally_oos) {
            setRealtimeAlert(
              '✅ ' + updated.name + 
              ' is now available in all stores'
            )
            setHasNewNotification(true)
            setTimeout(() => setRealtimeAlert(null), 5000)
          }
        }
      )
      .subscribe()

    // Cleanup subscriptions when component unmounts
    return () => {
      supabaseClient.removeChannel(notificationSubscription)
      supabaseClient.removeChannel(stockRequestSubscription)
      supabaseClient.removeChannel(productSubscription)
    }
  }, [user?.store_id])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const todayCount   = sales.length;
  const todaySales   = sales;
  const todayRevenue = sales.reduce((sum, s) => sum + (s.final_price || 0), 0);

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAFAFA', fontFamily:'Inter,sans-serif' }}>
        <div style={{ textAlign:'center' }}>
          <img src="/sairik-logo.jpg" alt="SairikCRM" style={{ height:'160px', width:'auto', objectFit:'contain', marginBottom:'1.5rem' }} />
          <p style={{ color:'#9ca3af', fontSize:'0.8rem', letterSpacing:'0.15em', textTransform:'uppercase' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#FAFAFA', backgroundImage:'radial-gradient(#f0f0f0 0.5px, transparent 0.5px)', backgroundSize:'24px 24px', fontFamily:'Inter,sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
        .gs { box-shadow: 0 4px 20px -2px rgba(212,175,55,0.1); }
        .ac { background:#fff; border:1px solid rgba(212,175,55,0.12); cursor:pointer; transition:all 0.4s; }
        .ac:hover { box-shadow:0 10px 30px -5px rgba(212,175,55,0.25); transform:translateY(-2px); border-color:rgba(212,175,55,0.4); }
      `}</style>
      
      {realtimeAlert && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-slide-down">
          <div className={`px-6 py-3 flex items-center justify-between shadow-lg
            ${realtimeAlert.startsWith('✅') 
              ? 'bg-green-600' 
              : realtimeAlert.startsWith('❌')
              ? 'bg-red-600'
              : 'bg-amber-600'}`}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse"/>
              <span className="text-white font-medium text-sm">
                {realtimeAlert}
              </span>
            </div>
            <button 
              onClick={() => setRealtimeAlert(null)}
              className="text-white/80 hover:text-white text-lg leading-none">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ background:'rgba(255,255,255,0.9)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(212,175,55,0.2)', padding:'1.25rem 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <img src="/sairik-logo.jpg" alt="SairikCRM" style={{ height:'140px', width:'auto', objectFit:'contain', margin: '-50px 0' }} />
          <div style={{ borderLeft:'1px solid rgba(212,175,55,0.25)', paddingLeft:'1rem' }}>
            <p style={{ fontSize:'0.6rem', fontWeight:'700', letterSpacing:'0.2em', textTransform:'uppercase', color:'#D4AF37', margin:0 }}>Staff Access</p>
            <h1 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.2rem', fontWeight:'700', color:'#1A1A1A', margin:0 }}>{user?.store_name ?? 'Store'}</h1>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <span style={{ fontSize:'0.85rem', color:'#9ca3af', fontWeight:'500' }}>Good Morning! 🌸</span>
          <button
            onClick={() => {
              router.push('/store/notifications')
              setHasNewNotification(false)
            }}
            className="relative p-2">
            <Bell className="w-5 h-5 text-gray-600" />
            {(notifications.filter((n:any) => 
              !n.is_read_by_store).length > 0 || 
              hasNewNotification) && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold animate-pulse">
                {notifications.filter((n:any) => 
                  !n.is_read_by_store).length || '!'}
              </span>
            )}
          </button>
          <button
            onClick={handleLogout}
            style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem 1.25rem', border:'1px solid #D4AF37', color:'#D4AF37', background:'transparent', cursor:'pointer', fontSize:'0.7rem', fontWeight:'700', letterSpacing:'0.15em', textTransform:'uppercase', fontFamily:'Inter,sans-serif', transition:'all 0.3s' }}
          >
            Logout
          </button>
        </div>
      </header>

      <main style={{ maxWidth:'1400px', margin:'0 auto', padding:'2.5rem 2rem' }}>

        {/* STAT CARDS */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {/* Card 1: Today's Revenue */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">TODAY'S REVENUE</p>
            <p className="text-3xl font-bold text-yellow-600">
              ₹{todayRevenue.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">7-DAY PERFORMANCE</p>
            <div className="flex items-end gap-1 mt-2 h-6">
              {[30,45,35,60,50,75,100].map((h, i) => (
                <div key={i} 
                  className="flex-1 rounded-sm"
                  style={{
                    height: h + '%',
                    backgroundColor: i === 6 ? '#D4AF37' : `rgba(212,175,55,${0.2 + i*0.1})`
                  }}/>
              ))}
            </div>
          </div>

          {/* Card 2: Transactions */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <p className="text-xs text-gray-400 uppercase tracking-widest">TRANSACTIONS</p>
              <span className="text-yellow-500 text-lg">🧾</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-3">
              {todaySales.length} 
              <span className="text-xl font-normal text-gray-500 ml-1">Sales</span>
            </p>
            <p className="text-xs text-green-500 mt-2 font-medium">↗ More than yesterday</p>
          </div>

          {/* Card 3: Biggest Sale */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <p className="text-xs text-gray-400 uppercase tracking-widest">BIGGEST SALE TODAY</p>
              <span className="text-yellow-500 text-lg">⭐</span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-3">
              {biggestSale 
                ? '₹' + biggestSale.final_price.toLocaleString('en-IN') 
                : '₹0'}
            </p>
            {biggestSale && (
              <p className="text-xs text-gray-400 mt-2 italic">
                {biggestSale.customer_name} — {biggestSale.product_name}
              </p>
            )}
          </div>

          {/* Card 4: Most Sold */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <p className="text-xs text-gray-400 uppercase tracking-widest">MOST SOLD TODAY</p>
              <span className="text-lg">🔥</span>
            </div>
            <p className="text-xl font-bold text-gray-900 mt-3 leading-tight">
              {mostSold || '—'}
            </p>
            <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">
              {mostSold 
                ? todaySales.filter((s:any) => s.product_name === mostSold).length + ' UNITS SOLD TODAY'
                : 'NO SALES YET'}
            </p>
          </div>
        </div>

        {/* ACTION CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom:'3rem' }}>
          {/* New Sale */}
          <div className="ac" onClick={() => router.push('/store/new-sale')} style={{ padding:'2rem', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#D4AF37 0%,#B6932F 100%)', border:'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
              <div style={{ background:'rgba(255,255,255,0.15)', padding:'1.1rem', border:'1px solid rgba(255,255,255,0.25)', fontSize:'1.75rem' }}>💰</div>
              <div>
                <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.5rem', fontWeight:'700', color:'#fff', margin:'0 0 0.25rem' }}>New Sale</h2>
                <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.7)', letterSpacing:'0.2em', textTransform:'uppercase', margin:0 }}>Record a Transaction</p>
              </div>
            </div>
            <div style={{ background:'#fff', borderRadius:'999px', width:'3rem', height:'3rem', display:'flex', alignItems:'center', justifyContent:'center', color:'#D4AF37', fontWeight:'700', fontSize:'1.1rem', flexShrink:0 }}>→</div>
          </div>

          {/* Sales History */}
          <div className="ac" onClick={() => router.push('/store/sales-history')} style={{ padding:'2rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
              <div style={{ background:'rgba(212,175,55,0.06)', padding:'1.1rem', border:'1px solid rgba(212,175,55,0.12)', fontSize:'1.75rem' }}>📊</div>
              <div>
                <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.5rem', fontWeight:'700', color:'#1A1A1A', margin:'0 0 0.25rem' }}>Sales History</h2>
                <p style={{ fontSize:'0.65rem', color:'#9ca3af', letterSpacing:'0.2em', textTransform:'uppercase', margin:0 }}>View Past Performance</p>
              </div>
            </div>
            <div style={{ background:'#D4AF37', borderRadius:'999px', width:'3rem', height:'3rem', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'1.1rem', flexShrink:0 }}>→</div>
          </div>

          {/* Products */}
          <div className="ac" onClick={() => router.push('/store/products')} style={{ padding:'2rem', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
              <div style={{ background:'rgba(212,175,55,0.06)', padding:'1.1rem', border:'1px solid rgba(212,175,55,0.12)', fontSize:'1.75rem' }}>📦</div>
              <div>
                <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.5rem', fontWeight:'700', color:'#1A1A1A', margin:'0 0 0.25rem' }}>Products</h2>
                <p style={{ fontSize:'0.65rem', color:'#9ca3af', letterSpacing:'0.2em', textTransform:'uppercase', margin:0 }}>View & Manage Stock</p>
              </div>
            </div>
            <div style={{ background:'#D4AF37', borderRadius:'999px', width:'3rem', height:'3rem', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'1.1rem', flexShrink:0 }}>→</div>
          </div>

          {/* Notifications */}
          <div className="ac" onClick={() => router.push('/store/notifications')} style={{ padding:'2rem', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
            {unreadGlobalCount > 0 ? (
              <span style={{ position:'absolute', top:'0.75rem', right:'0.75rem', background:'#dc2626', color:'#fff', borderRadius:'999px', padding:'0.1rem 0.5rem', fontSize:'0.65rem', fontWeight:'800', border:'2px solid #fff' }}>{unreadGlobalCount}</span>
            ) : hasNewNotification ? (
              <span style={{ position:'absolute', top:'0.75rem', right:'0.75rem', width:'0.65rem', height:'0.65rem', background:'#dc2626', borderRadius:'50%', border:'2px solid #fff' }} />
            ) : null}
            <div style={{ display:'flex', alignItems:'center', gap:'1.5rem' }}>
              <div style={{ background:'rgba(212,175,55,0.06)', padding:'1.1rem', border:'1px solid rgba(212,175,55,0.12)', fontSize:'1.75rem' }}>📬</div>
              <div>
                <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:'1.5rem', fontWeight:'700', color:'#1A1A1A', margin:'0 0 0.25rem' }}>Notifications</h2>
                <p style={{ fontSize:'0.65rem', color:'#9ca3af', letterSpacing:'0.2em', textTransform:'uppercase', margin:0 }}>View Admin Responses</p>
              </div>
            </div>
            <div style={{ background:'#D4AF37', borderRadius:'999px', width:'3rem', height:'3rem', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:'700', fontSize:'1.1rem', flexShrink:0 }}>→</div>
          </div>
        </section>

        {/* TODAY'S TRANSACTIONS */}
        <div className="grid grid-cols-5 gap-4">
          {/* Left: Today's Sales Table */}
          <div className="col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-gray-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Today's Sales</h3>
                <div className="w-8 h-0.5 bg-yellow-500 mt-1"/>
              </div>
              {todaySales.length > 0 && (
                <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
                  {todaySales.length} NEW RECORDS
                </span>
              )}
            </div>
            
            {todaySales.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">No sales yet today</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50">
                    {['TIME','CUSTOMER','PRODUCT','SIZE','AMOUNT','DISCOUNT'].map(h => (
                      <th key={h} className="text-left text-xs text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todaySales.map((sale: any, i: number) => (
                    <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        {new Date(sale.created_at || sale.sale_date).toLocaleTimeString('en-IN', {
                          hour: '2-digit', 
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{sale.customer_name}</td>
                      <td className="px-5 py-3 text-gray-700">{sale.product_name}</td>
                      <td className="px-5 py-3">
                        {sale.size_ml ? (
                          <span className="bg-yellow-50 text-yellow-700 text-xs px-2 py-1 rounded-full font-medium border border-yellow-200">
                            {sale.size_ml}ML
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        ₹{(sale.final_price || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3">
                        {sale.discount_amount > 0 ? (
                          <span className="text-green-600 font-medium text-xs">
                            -₹{sale.discount_amount.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right: Quick Stats + Notifications */}
          <div className="col-span-2 flex flex-col gap-4">
            
            {/* Notifications card */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">📢 Notifications</h3>
                {unreadGlobalCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {unreadGlobalCount}
                  </span>
                )}
              </div>
              {notifications.slice(0,3).map((n:any, i:number) => (
                <div key={i} className={`rounded-xl p-3 mb-2 text-xs ${n.type === 'global_oos_alert' ? 'bg-amber-50 border border-amber-100' : 'bg-green-50 border border-green-100'}`}>
                  <p className={`font-bold uppercase tracking-wide text-xs mb-0.5 ${n.type === 'global_oos_alert' ? 'text-red-600' : 'text-green-600'}`}>
                    {n.type === 'global_oos_alert' ? '⚠️ OUT OF STOCK' : '✅ RESTOCK ALERT'}
                  </p>
                  <p className="text-gray-700">{n.product_name}</p>
                  <p className="text-gray-400 uppercase tracking-wide text-xs mt-1">
                    {new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} 
                  </p>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No new notifications</p>
              )}
            </div>

            {/* Weekly Revenue */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-500 text-xl">📊</div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest">WEEKLY REVENUE</p>
                <p className="text-xl font-bold text-gray-900">
                  ₹{weeklyRevenue.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Monthly Revenue */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-500 text-xl">📅</div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest">MONTHLY REVENUE</p>
                <p className="text-xl font-bold text-gray-900">
                  ₹{monthlyRevenue.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Best Seller */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-500 text-xl">💎</div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest">BEST SELLER</p>
                <p className="text-base font-bold text-gray-900 leading-tight">
                  {bestSeller || '—'}
                </p>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
