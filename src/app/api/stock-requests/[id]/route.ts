import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── PATCH /api/stock-requests/[id] ───────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { status, admin_message } = await req.json();

  if (!['accepted', 'rejected'].includes(status)) {
    return NextResponse.json(
      { error: "status must be 'accepted' or 'rejected'" },
      { status: 400 }
    );
  }

  const resolvedAt = new Date().toISOString();

  // ── Fetch the original request (need store_id + product_id for OOS upsert) ─
  const { data: request, error: fetchError } = await supabase
    .from('stock_requests')
    .select('store_id, product_id')
    .eq('id', id)
    .single();

  if (fetchError || !request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  // ── Update the request row ────────────────────────────────────────────────
  const { data, error: updateError } = await supabase
    .from('stock_requests')
    .update({
      status,
      admin_message:  admin_message ?? null,
      resolved_at:    resolvedAt,
      resolved_by:    'superadmin',
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // ── If accepted → mark product as out-of-stock for this store ────────────
  if (status === 'accepted') {
    const { error: upsertError } = await supabase
      .from('store_product_status')
      .upsert(
        {
          store_id:       request.store_id,
          product_id:     request.product_id,
          is_out_of_stock: true,
          marked_at:      resolvedAt,
        },
        { onConflict: 'store_id,product_id' }
      );

    if (upsertError) {
      // Non-fatal — log but still return the updated request
      console.error('store_product_status upsert failed:', upsertError.message);
    }
  }

  // ── If rejected → leave store_product_status untouched (product stays live)

  return NextResponse.json(data);
}
