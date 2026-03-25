import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyToken } from '@/lib/auth'

// HELPER: Escape a cell value for CSV
function escapeCell(value: any): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (
    str.includes(',') || 
    str.includes('"') || 
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export async function GET(req: NextRequest) {
  
  // Read token directly from request cookies
  // This is more reliable than getUserFromToken()
  // in GET route handlers
  const token = req.cookies.get('auth_token')?.value
  
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized - no token' }, 
      { status: 401 }
    )
  }
  
  const user = verifyToken(token)
  
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized - invalid token' }, 
      { status: 401 }
    )
  }
  
  if (user.role !== 'superadmin') {
    return NextResponse.json(
      { error: 'Unauthorized - not superadmin' }, 
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const store_id = searchParams.get('store_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    // Build query — only select columns that EXIST
    let query = supabase
      .from('sales_records')
      .select(`
        id,
        sale_date,
        customer_name,
        customer_phone,
        customer_email,
        product_name,
        category_name,
        size_ml,
        quantity,
        mrp_at_sale,
        discount_amount,
        final_price,
        invoice_number,
        stores (name)
      `)
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })

    // Apply filters
    if (store_id) query = query.eq('store_id', store_id)
    if (from) query = query.gte('sale_date', from)
    if (to) query = query.lte('sale_date', to)

    const { data, error } = await query

    if (error) {
      console.error('Export query error:', error)
      return NextResponse.json(
        { error: error.message }, 
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      // Return empty CSV with just headers
      const emptyCSV = 
        '\uFEFF' +
        'Sale ID,' +
        'Sale Date,' +
        'Store Name,' +
        'Customer Name,' +
        'Phone,' +
        'Email,' +
        'Product,' +
        'Category,' +
        'Size (ml),' +
        'Quantity,' +
        'MRP (Rs),' +
        'Discount (Rs),' +
        'Final Price (Rs),' +
        'Invoice No\r\n'
      
      return new NextResponse(emptyCSV, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 
            'attachment; filename="sales-export.csv"',
        }
      })
    }

    // Build CSV manually — no external library needed
    // This avoids all json2csv import errors

    // HEADERS ROW
    const headers = [
      'Sale ID',
      'Sale Date',
      'Store Name',
      'Customer Name',
      'Phone',
      'Email',
      'Product',
      'Category',
      'Size (ml)',
      'Quantity',
      'MRP (Rs)',
      'Discount (Rs)',
      'Final Price (Rs)',
      'Invoice No'
    ]

    // BUILD ROWS
    const rows = data.map((sale: any) => {
      const storeName = sale.stores?.name || ''
      
      return [
        escapeCell(sale.id),
        escapeCell(sale.sale_date),
        escapeCell(storeName),
        escapeCell(sale.customer_name),
        escapeCell(sale.customer_phone || ''),
        escapeCell(sale.customer_email || ''),
        escapeCell(sale.product_name),
        escapeCell(sale.category_name),
        escapeCell(
          sale.size_ml ? sale.size_ml + 'ml' : ''
        ),
        escapeCell(sale.quantity || 1),
        escapeCell(sale.mrp_at_sale || 0),
        escapeCell(sale.discount_amount || 0),
        escapeCell(sale.final_price || 0),
        escapeCell(sale.invoice_number || ''),
      ].join(',')
    })

    // COMBINE: BOM + headers + rows
    // \uFEFF is the UTF-8 BOM — makes Excel open 
    // the file correctly with Indian characters
    const csvContent = 
      '\uFEFF' +                          // UTF-8 BOM for Excel
      headers.join(',') + '\r\n' +        // Header row
      rows.join('\r\n')                   // Data rows

    // Generate filename with date range
    const today = new Date().toISOString().split('T')[0]
    const filename = store_id
      ? `store-sales-${today}.csv`
      : `all-stores-sales-${today}.csv`

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 
          `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      }
    })

  } catch (err: any) {
    console.error('Export unexpected error:', err)
    return NextResponse.json(
      { error: 'Export failed: ' + err.message }, 
      { status: 500 }
    )
  }
}
