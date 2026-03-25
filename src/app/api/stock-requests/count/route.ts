import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// ── GET /api/stock-requests/count ────────────────────────────────────────────
// Returns count of pending stock requests — used for bell-icon badge
export async function GET() {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count, error } = await supabase
    .from('stock_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ count: count ?? 0 });
}
