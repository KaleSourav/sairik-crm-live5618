import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── POST /api/products/global-oos — mark product globally OOS (instant) ───────
export async function POST(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { product_id, message } = await req.json();
  if (!product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 });
  }

  // STEP 1: Mark product OOS instantly (no timer)
  const { error: updateErr } = await supabase
    .from('products')
    .update({
      is_globally_oos:      true,
      globally_oos_at:      new Date().toISOString(),
      globally_oos_message: message ?? null,
    })
    .eq('id', product_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // STEP 2: Fetch product name
  const { data: product } = await supabase
    .from('products')
    .select('name')
    .eq('id', product_id)
    .single();

  const product_name = product?.name ?? 'Unknown Product';

  // STEP 3: Fetch all active stores
  const { data: stores, error: storesErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('is_active', true);

  if (storesErr) {
    return NextResponse.json({ error: storesErr.message }, { status: 500 });
  }

  const activeStores = stores ?? [];

  // STEP 4: Insert a notification for every active store
  if (activeStores.length > 0) {
    const notifications = activeStores.map((store) => ({
      product_id,
      product_name,
      store_id:           store.id,
      store_name:         store.name,
      type:               'global_oos_alert',
      is_read_by_store:   false,
      is_read_by_admin:   true,
    }));

    const { error: notifErr } = await supabase
      .from('global_oos_notifications')
      .insert(notifications);

    if (notifErr) {
      // Non-fatal — product is already marked OOS; log and continue
      console.error('Failed to insert OOS notifications:', notifErr.message);
    }
  }

  // STEP 5: Return summary
  return NextResponse.json({
    success:        true,
    product_name,
    affected_stores: activeStores.length,
    message:        'Product marked OOS in all stores instantly',
  });
}

// ── DELETE /api/products/global-oos?product_id=... — re-enable globally ───────
export async function DELETE(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const product_id = searchParams.get('product_id');
  if (!product_id) {
    return NextResponse.json({ error: 'product_id query param is required' }, { status: 400 });
  }

  // STEP 1: Clear global OOS fields on product
  const { error: updateErr } = await supabase
    .from('products')
    .update({
      is_globally_oos:      false,
      globally_oos_at:      null,
      globally_oos_message: null,
    })
    .eq('id', product_id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // STEP 2: Remove all store-level OOS overrides for this product
  await supabase
    .from('store_product_status')
    .delete()
    .eq('product_id', product_id);

  // STEP 3: Delete existing notifications for this product
  await supabase
    .from('global_oos_notifications')
    .delete()
    .eq('product_id', product_id);

  // STEP 4: Fetch product name + active stores
  const [{ data: product }, { data: stores }] = await Promise.all([
    supabase.from('products').select('name').eq('id', product_id).single(),
    supabase.from('stores').select('id, name').eq('is_active', true),
  ]);

  const product_name  = product?.name ?? 'Unknown Product';
  const activeStores  = stores ?? [];

  // STEP 5: Insert re-enabled notification for every active store
  if (activeStores.length > 0) {
    await supabase.from('global_oos_notifications').insert(
      activeStores.map((store) => ({
        product_id,
        product_name,
        store_id:         store.id,
        store_name:       store.name,
        type:             're_enabled',
        is_read_by_store: false,
        is_read_by_admin: true,
      }))
    );
  }

  return NextResponse.json({ success: true });
}
