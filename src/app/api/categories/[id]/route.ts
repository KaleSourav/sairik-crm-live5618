import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── DELETE /api/categories/[id] ───────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Check if any products are linked to this category
  const { data: products, error: checkError } = await supabase
    .from('products')
    .select('id')
    .eq('category_id', id)
    .limit(1);

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  if (products && products.length > 0) {
    return NextResponse.json(
      { error: 'Category has products. Delete products first.' },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabase
    .from('categories')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
