import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/store-notifications/admin — disputes: stores claiming they have stock
export async function GET() {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('global_oos_notifications')
    .select('*, store_response_message')
    .eq('store_response', 'has_stock')
    .is('admin_decision', null)
    .order('store_responded_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const disputes = data ?? [];
  return NextResponse.json({ disputes, dispute_count: disputes.length });
}

// ── PATCH /api/store-notifications/admin — admin rules on a dispute ───────────
export async function PATCH(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Superadmin only' }, { status: 403 });
  }

  const { notification_id, decision, admin_decision_message } = await req.json();

  if (!notification_id || !decision) {
    return NextResponse.json(
      { error: 'notification_id and decision are required' },
      { status: 400 }
    );
  }

  if (!['allow_selling', 'keep_blocked'].includes(decision)) {
    return NextResponse.json(
      { error: 'decision must be "allow_selling" or "keep_blocked"' },
      { status: 400 }
    );
  }

  // Fetch the notification to get store_id + product_id
  const { data: notif, error: fetchErr } = await supabase
    .from('global_oos_notifications')
    .select('id, store_id, product_id')
    .eq('id', notification_id)
    .single();

  if (fetchErr || !notif) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  // Record the admin decision
  const { error: decisionErr } = await supabase
    .from('global_oos_notifications')
    .update({
      admin_decision:         decision,
      admin_decision_message: admin_decision_message ?? null,
      admin_decided_at:       new Date().toISOString(),
      is_read_by_store:       false,  // notify the store of the ruling
      is_read_by_admin:       true,
    })
    .eq('id', notification_id);

  if (decisionErr) {
    return NextResponse.json({ error: decisionErr.message }, { status: 500 });
  }

  // Apply the store-product status based on decision
  const statusPayload =
    decision === 'allow_selling'
      ? { store_id: notif.store_id, product_id: notif.product_id, is_out_of_stock: false, override_global_oos: true  }
      : { store_id: notif.store_id, product_id: notif.product_id, is_out_of_stock: true,  override_global_oos: false };

  const { error: statusErr } = await supabase
    .from('store_product_status')
    .upsert(statusPayload, { onConflict: 'store_id,product_id' });

  if (statusErr) {
    return NextResponse.json({ error: statusErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
