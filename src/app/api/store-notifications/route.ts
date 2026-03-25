import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/store-notifications — fetch this store's global OOS notifications ─
export async function GET() {
  const user = await getUserFromToken();
  if (!user || user.role !== 'store') {
    return NextResponse.json({ error: 'Store users only' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('global_oos_notifications')
    .select('*')
    .eq('store_id', user.store_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notifications = data ?? [];
  const unread_count  = notifications.filter((n) => !n.is_read_by_store).length;

  return NextResponse.json({ notifications, unread_count });
}

export async function PATCH(req: NextRequest) {
  const user = await getUserFromToken()
  if (!user || user.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { 
    notification_id, 
    response, 
    store_quantity_remaining, 
    store_response: storeMessage,
    mark_all_read 
  } = body

  // Handle mark all as read
  if (mark_all_read) {
    const { error } = await supabase
      .from('global_oos_notifications')
      .update({ is_read_by_store: true })
      .eq('store_id', user.store_id)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Handle store response
  if (response === 'confirmed_oos') {
    const { data, error } = await supabase
      .from('global_oos_notifications')
      .update({
        store_response: 'confirmed_oos',
        store_responded_at: new Date().toISOString(),
        is_read_by_store: true,
        is_read_by_admin: true
      })
      .eq('id', notification_id)
      .eq('store_id', user.store_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json(data)
  }

  if (response === 'has_stock') {
    const { data, error } = await supabase
      .from('global_oos_notifications')
      .update({
        store_response: 'has_stock',
        store_response_message: storeMessage || '',
        store_quantity_remaining: Number(store_quantity_remaining) || 0,
        store_responded_at: new Date().toISOString(),
        is_read_by_store: true,
        is_read_by_admin: false
      })
      .eq('id', notification_id)
      .eq('store_id', user.store_id)
      .select()
      .single()

    if (error) {
      console.error('Error saving has_stock response:', error)
      return NextResponse.json({ error }, { status: 500 })
    }
    
    console.log('has_stock response saved:', data)
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Invalid response type' }, { status: 400 })
}
