import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/variants?product_id=<uuid> ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('product_id');

  if (!productId) {
    return NextResponse.json(
      { error: 'product_id query parameter is required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('product_variants')
    .select('id, size_ml, size_label, price')
    .eq('product_id', productId)
    .order('price', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// ── POST /api/variants ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { product_id, size_label, size_ml, price } = await req.json();

  if (!product_id || price === undefined) {
    return NextResponse.json(
      { error: 'product_id and price are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('product_variants')
    .insert({ product_id, size_label: size_label ?? null, size_ml: size_ml ?? null, price })
    .select('id, size_ml, size_label, price')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
