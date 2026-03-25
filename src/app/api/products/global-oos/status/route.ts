import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// ── GET /api/products/global-oos/status — fetch all globally OOS products ─────
export async function GET() {
  const user = await getUserFromToken();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('products')
    .select('id, name, is_globally_oos, globally_oos_message, globally_oos_at')
    .eq('is_globally_oos', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return shaped array — no timer/countdown, OOS is always effective immediately
  const result = (data ?? []).map((p) => ({
    product_id:           p.id,
    product_name:         p.name,
    is_globally_oos:      true,
    globally_oos_message: p.globally_oos_message ?? null,
    globally_oos_at:      p.globally_oos_at ?? null,
    // No effective_at or hours_until_effective — blocking is instant
    globally_oos_effective_at: null,
    hours_until_effective:     null,
  }));

  return NextResponse.json(result);
}
