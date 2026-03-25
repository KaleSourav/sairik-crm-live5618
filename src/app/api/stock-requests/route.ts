import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/stock-requests ───────────────────────────────────────────────────
export async function GET() {
  const user = await getUserFromToken();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role === 'superadmin') {
    // Superadmin sees ALL pending requests across all stores, with store name
    const { data, error } = await supabase
      .from('stock_requests')
      .select(`
        *,
        stores ( name )
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (user.role === 'store') {
    // Store sees their own requests at all statuses
    const { data, error } = await supabase
      .from('stock_requests')
      .select('*')
      .eq('store_id', user.store_id)
      .order('requested_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ── POST /api/stock-requests ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { product_id, product_name, request_message } = await req.json();

  if (!product_id || !product_name) {
    return NextResponse.json(
      { error: 'product_id and product_name are required' },
      { status: 400 }
    );
  }

  // ── Check for existing pending request ────────────────────────────────────
  const { data: existing } = await supabase
    .from('stock_requests')
    .select('id')
    .eq('store_id', user.store_id)
    .eq('product_id', product_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Request already pending for this product' },
      { status: 400 }
    );
  }

  // ── Get store name ────────────────────────────────────────────────────────
  const { data: storeRow } = await supabase
    .from('stores')
    .select('name')
    .eq('id', user.store_id)
    .single();

  const store_name = storeRow?.name ?? '';

  // ── Insert request ────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('stock_requests')
    .insert({
      store_id:        user.store_id,
      product_id,
      product_name,
      store_name,
      status:          'pending',
      request_message: request_message ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
