import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import bcryptjs from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

// ── PATCH /api/stores/:id ─────────────────────────────────────────────────
// Handles: activate/deactivate, reset password, rename — all in one endpoint
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Build update object — only include fields actually provided
  const updates: Record<string, unknown> = {};

  if (typeof body.is_active === 'boolean') {
    updates.is_active = body.is_active;
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
  }

  if (typeof body.password === 'string' && body.password.trim()) {
    // Hash new password before storing
    updates.password_hash = bcryptjs.hashSync(body.password.trim(), 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields provided to update' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('stores')
    .update(updates)
    .eq('id', id)
    // Never return password_hash
    .select('id, name, location, username, is_active, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

// ── DELETE /api/stores/:id ────────────────────────────────────────────────────
// Superadmin only. Permanently removes the store.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Confirm store exists first
  const { data: existing, error: findError } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', id)
    .single();

  if (findError || !existing) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // ── Delete child records first (FK constraint order) ─────────────────────
  // 1. sales_records — has sales_records_store_id_fkey
  const { error: e1 } = await supabase.from('sales_records').delete().eq('store_id', id);
  if (e1) return NextResponse.json({ error: 'Failed to remove sales records: ' + e1.message }, { status: 500 });

  // 2. stock_requests
  const { error: e2 } = await supabase.from('stock_requests').delete().eq('store_id', id);
  if (e2) return NextResponse.json({ error: 'Failed to remove stock requests: ' + e2.message }, { status: 500 });

  // 3. store_product_status
  const { error: e3 } = await supabase.from('store_product_status').delete().eq('store_id', id);
  if (e3) return NextResponse.json({ error: 'Failed to remove product status: ' + e3.message }, { status: 500 });

  // 4. global_oos_notifications
  const { error: e4 } = await supabase.from('global_oos_notifications').delete().eq('store_id', id);
  if (e4) return NextResponse.json({ error: 'Failed to remove notifications: ' + e4.message }, { status: 500 });

  // ── Finally, delete the store itself ─────────────────────────────────────
  const { error: deleteError } = await supabase
    .from('stores')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: `Store "${existing.name}" deleted` });
}
