import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// ── GET /api/stock-status — combined OOS list for a store ─────────────────────
// Returns products that are blocked for this store, considering:
//   1. Global OOS (products.is_globally_oos = true), MINUS any store-specific exemptions
//   2. Store-specific OOS (store_product_status.is_out_of_stock = true)
export async function GET() {
  const user = await getUserFromToken();
  if (!user || user.role !== 'store') {
    return NextResponse.json({ error: 'Store users only' }, { status: 403 });
  }

  // ── CHECK 1: Global OOS products ────────────────────────────────────────────
  const { data: globalOos } = await supabase
    .from('products')
    .select('id')
    .eq('is_globally_oos', true);

  const globalOosIds: string[] = (globalOos ?? []).map((p) => p.id);

  // ── CHECK 2: Store_product_status for this store ─────────────────────────────
  const { data: storeStatus } = await supabase
    .from('store_product_status')
    .select('product_id, is_out_of_stock, override_global_oos')
    .eq('store_id', user.store_id);

  const storeStatusMap: Record<string, { is_out_of_stock: boolean; override_global_oos: boolean }> = {};
  for (const row of storeStatus ?? []) {
    storeStatusMap[row.product_id] = {
      is_out_of_stock:    row.is_out_of_stock,
      override_global_oos: row.override_global_oos,
    };
  }

  // Products globally OOS, minus those this store is exempt from (override_global_oos = true)
  const effectiveGlobalOos = globalOosIds.filter((id) => {
    const override = storeStatusMap[id];
    return !(override && override.override_global_oos === true);
  });

  // Store-specific OOS (where store explicitly marked it out of stock, without global exemption)
  const storeSpecificOos = Object.entries(storeStatusMap)
    .filter(([, v]) => v.is_out_of_stock && !v.override_global_oos)
    .map(([productId]) => productId);

  // Union (deduplicated)
  const allBlocked = Array.from(new Set([...effectiveGlobalOos, ...storeSpecificOos]));

  return NextResponse.json({
    blocked_products:     allBlocked,
    global_oos_products:  effectiveGlobalOos,
    store_oos_products:   storeSpecificOos,
  });
}
