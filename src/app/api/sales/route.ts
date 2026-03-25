import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/sales?store_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD ──────────
export async function GET(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  // ── Data isolation: store sees only its own data ──────────────────────────
  let storeId: string | null = null;
  if (user.role === 'store') {
    // Always use the store_id from the JWT — ignore any query param
    storeId = user.store_id;
  } else if (user.role === 'superadmin') {
    // Superadmin can filter by any store_id from query param
    storeId = searchParams.get('store_id');
  }

  let query = supabase
    .from('sales_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  if (from) {
    query = query.gte('sale_date', from);
  }

  if (to) {
    query = query.lte('sale_date', to);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ── POST /api/sales ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Only store role can record sales
  const user = await getUserFromToken();
  if (!user || user.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    customer_name,
    customer_phone,
    customer_email,
    product_id,
    product_name,
    category_name,
    variant_id,
    size_ml,
    quantity,
    mrp_at_sale,
    discount_amount,
    final_price: body_final_price,
    overall_discount_percent,
    phone_verified,
    otp_verified_at,
  } = await req.json();

  // Use client-supplied final_price (already computed after per-item discounts).
  // Fall back to recalculating only if not provided.
  const final_price = body_final_price ?? (mrp_at_sale - (discount_amount || 0));

  // Today's date as YYYY-MM-DD
  const sale_date = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('sales_records')
    .insert({
      store_id:                   user.store_id,
      customer_name,
      customer_phone,
      customer_email,
      product_id,
      product_name,
      category_name,
      variant_id:                 variant_id              ?? null,
      size_ml:                    size_ml                 ?? null,
      quantity:                   quantity                ?? 1,
      mrp_at_sale,
      discount_amount:            discount_amount         || 0,
      final_price,
      overall_discount_percent:   overall_discount_percent || 0,
      sale_date,
      phone_verified:             phone_verified          ?? false,
      otp_verified_at:            otp_verified_at         ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
