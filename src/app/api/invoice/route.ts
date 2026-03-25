import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = verifyToken(token)
  if (!user || user.role !== 'store') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sale_ids } = await req.json()

  if (!sale_ids || !Array.isArray(sale_ids) || sale_ids.length === 0) {
    return NextResponse.json({ error: 'No sale IDs provided' }, { status: 400 })
  }

  // Get store details
  const { data: store } = await supabase
    .from('stores')
    .select('name, location')
    .eq('id', user.store_id)
    .single()

  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  // Generate invoice number using RPC function
  const year = new Date().getFullYear()
  const { data: invoiceData, error: rpcError } = await supabase.rpc('generate_invoice_number', {
    p_store_id: user.store_id,
    p_store_name: store.name,
    p_year: year
  })

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 })
  }

  const invoiceNumber = invoiceData as string
  const now = new Date().toISOString()

  // Update all sale records with invoice number
  const { error: updateError } = await supabase
    .from('sales_records')
    .update({
      invoice_number: invoiceNumber,
      invoice_generated_at: now
    })
    .in('id', sale_ids)
    .eq('store_id', user.store_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Fetch the complete sale records for PDF generation
  const { data: sales } = await supabase
    .from('sales_records')
    .select('*')
    .in('id', sale_ids)
    .eq('store_id', user.store_id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    success: true,
    invoice_number: invoiceNumber,
    store,
    sales,
    generated_at: now
  })
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = verifyToken(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const invoice_number = searchParams.get('invoice_number')

  if (!invoice_number) return NextResponse.json({ error: 'Invoice number required' }, { status: 400 })

  const { data: sales, error } = await supabase
    .from('sales_records')
    .select('*')
    .eq('invoice_number', invoice_number)

  if (error || !sales?.length) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const { data: store } = await supabase
    .from('stores')
    .select('name, location')
    .eq('id', sales[0].store_id)
    .single()

  return NextResponse.json({ sales, store, invoice_number })
}
