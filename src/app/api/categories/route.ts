import { getUserFromToken } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ── GET /api/categories ───────────────────────────────────────────────────────
export async function GET() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ── POST /api/categories ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUserFromToken();
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name } = await req.json();

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
  }

  // Check for duplicate (case-insensitive)
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .ilike('name', name.trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Category already exists' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim() })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
