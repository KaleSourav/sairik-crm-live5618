import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── DELETE /api/stock-status/[productId]?store_id=<uuid> ─────────────────────
// Superadmin re-enables a product that was previously marked OOS for a store
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { productId } = await params;
  const storeId = new URL(req.url).searchParams.get('store_id');

  if (!storeId) {
    return NextResponse.json(
      { error: 'store_id query param is required' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('store_product_status')
    .delete()
    .eq('store_id', storeId)
    .eq('product_id', productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
