// Browser-only — do NOT import from server components
// Uses dynamic imports to avoid SSR issues with jsPDF

export async function generateInvoicePDF(invoiceData: {
  invoice_number: string
  store: { name: string; location: string }
  sales: any[]
  generated_at: string
  customer_name: string
  customer_phone?: string
  customer_email?: string
  overall_discount_percent?: number
}) {
  // Dynamic imports — only loads in browser
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const GOLD:       [number, number, number] = [201, 168, 76]
  const DARK:       [number, number, number] = [26,  26,  26]
  const GRAY:       [number, number, number] = [120, 120, 120]
  const LIGHT_GOLD: [number, number, number] = [253, 248, 235]
  const WHITE:      [number, number, number] = [255, 255, 255]
  const RED:        [number, number, number] = [180, 60,  60]
  const GREEN:      [number, number, number] = [34,  139, 34]

  const pageWidth = doc.internal.pageSize.getWidth()

  // ── HEADER BACKGROUND ──────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT_GOLD)
  doc.rect(0, 0, pageWidth, 45, 'F')

  doc.setFillColor(...GOLD)
  doc.rect(0, 0, pageWidth, 2, 'F')

  // Try to add logo
  try {
    const logoUrl = window.location.origin + '/sairik-logo.jpg'
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = logoUrl
    })
    if (img.complete && img.naturalHeight > 0) {
      doc.addImage(img, 'JPEG', 12, 5, 28, 28)
    }
  } catch {
    // Logo failed — show text only
  }

  // Brand
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...GOLD)
  doc.text('SAIRIK', 45, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Enhance Your Soul', 45, 22)
  doc.text('Saisha International LLP', 45, 27)
  doc.text('GST No. 27AFJFS6082C1ZT', 45, 32)

  // INVOICE title right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...GOLD)
  doc.text('INVOICE', pageWidth - 15, 18, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text(invoiceData.invoice_number, pageWidth - 15, 26, { align: 'right' })

  const invoiceDate = new Date(invoiceData.generated_at)
  doc.text(
    invoiceDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
    pageWidth - 15, 32, { align: 'right' }
  )
  doc.text(
    invoiceDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    pageWidth - 15, 37, { align: 'right' }
  )

  // Gold divider
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.5)
  doc.line(12, 47, pageWidth - 12, 47)

  // ── STORE + CUSTOMER INFO ──────────────────────────────────────────────────
  let y = 53

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GOLD)
  doc.text('FROM', 12, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(invoiceData.store.name, 12, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  if (invoiceData.store.location) doc.text(invoiceData.store.location, 12, y + 11)

  const rightCol = pageWidth / 2 + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...GOLD)
  doc.text('BILL TO', rightCol, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...DARK)
  doc.text(invoiceData.customer_name, rightCol, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  let customerY = y + 11
  if (invoiceData.customer_phone) {
    doc.text('Ph: ' + invoiceData.customer_phone, rightCol, customerY)
    customerY += 5
  }
  if (invoiceData.customer_email) {
    doc.text(invoiceData.customer_email, rightCol, customerY)
  }

  // ── ITEMS TABLE ────────────────────────────────────────────────────────────
  y = 82

  autoTable(doc, {
    startY: y,
    margin: { left: 12, right: 12 },
    head: [['#', 'Product', 'Size', 'Qty', 'MRP (Rs)', 'Discount (Rs)', 'Total (Rs)']],
    body: invoiceData.sales.map((sale, i) => [
      i + 1,
      sale.product_name,
      sale.size_ml ? sale.size_ml + 'ml' : '-',
      sale.quantity || 1,
      Number(sale.mrp_at_sale || 0).toLocaleString('en-IN'),
      Number(sale.discount_amount || 0).toLocaleString('en-IN'),
      Number(sale.final_price || 0).toLocaleString('en-IN')
    ]),
    headStyles: {
      fillColor: GOLD,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      cellPadding: 4
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'left',   cellWidth: 55 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right',  cellWidth: 22 },
      5: { halign: 'right',  cellWidth: 25 },
      6: { halign: 'right',  cellWidth: 25 },
    },
    alternateRowStyles: { fillColor: [250, 248, 242] as [number, number, number] },
    bodyStyles: { fontSize: 9, textColor: DARK, cellPadding: 3 },
    styles: { lineColor: [230, 225, 210] as [number, number, number], lineWidth: 0.3 }
  })

  // ── PRICE SUMMARY BOX ─────────────────────────────────────────────────────
  const tableEndY = (doc as any).lastAutoTable.finalY + 6

  const mrpTotal     = invoiceData.sales.reduce((s: number, r: any) => s + Number(r.mrp_at_sale || 0) * (Number(r.quantity) || 1), 0)
  const itemDisc     = invoiceData.sales.reduce((s: number, r: any) => s + Number(r.discount_amount || 0), 0)
  // subtotal = sum of final_prices stored in DB (after per-item discounts only)
  const subtotal     = invoiceData.sales.reduce((s: number, r: any) => s + Number(r.final_price || 0), 0)
  // Read overall % from the DB record first, then fall back to the passed-in field
  const overallPct   = Number(
    invoiceData.sales[0]?.overall_discount_percent ??
    invoiceData.overall_discount_percent ??
    0
  )
  const overallDisc  = overallPct > 0 ? Math.round(subtotal * overallPct / 100) : 0
  const grandTotal   = subtotal - overallDisc
  const totalSavings = itemDisc + overallDisc

  const boxH  = overallPct > 0 ? 58 : (itemDisc > 0 ? 48 : 38)
  const boxX  = pageWidth - 82
  const boxW  = 70
  let   boxY  = tableEndY

  doc.setFillColor(...LIGHT_GOLD)
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'F')
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.5)
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, 'S')

  boxY += 8

  const row = (
    label: string,
    value: string,
    bold = false,
    color: [number, number, number] = DARK
  ) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 10 : 9)
    doc.setTextColor(...color)
    doc.text(label, boxX + 5, boxY)
    doc.text(value, boxX + boxW - 5, boxY, { align: 'right' })
    boxY += bold ? 8 : 7
  }

  row('MRP Total', 'Rs ' + mrpTotal.toLocaleString('en-IN'), false, GRAY)
  if (itemDisc > 0) row('Item Discounts', '-Rs ' + itemDisc.toLocaleString('en-IN'), false, RED)

  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.3)
  doc.line(boxX + 4, boxY - 2, boxX + boxW - 4, boxY - 2)

  row('Subtotal', 'Rs ' + subtotal.toLocaleString('en-IN'))
  if (overallPct > 0) row(`Overall Discount (${overallPct}%)`, '-Rs ' + overallDisc.toLocaleString('en-IN'), false, RED)

  // Grand Total gold bar
  doc.setFillColor(...GOLD)
  doc.rect(boxX, boxY - 5, boxW, 13, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...WHITE)
  doc.text('GRAND TOTAL', boxX + 5, boxY + 3)
  doc.text('Rs ' + grandTotal.toLocaleString('en-IN'), boxX + boxW - 5, boxY + 3, { align: 'right' })
  boxY += 16

  if (totalSavings > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...GREEN)
    doc.text(
      'You saved Rs ' + totalSavings.toLocaleString('en-IN') + '!',
      boxX + boxW / 2, boxY + 2,
      { align: 'center' }
    )
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pageH   = doc.internal.pageSize.getHeight()
  const footerY = pageH - 22

  doc.setFillColor(...GOLD)
  doc.rect(0, footerY - 2, pageWidth, 0.5, 'F')

  doc.setFillColor(...LIGHT_GOLD)
  doc.rect(0, footerY - 1, pageWidth, 25, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...GOLD)
  doc.text('Thank you for choosing SAIRIK!', pageWidth / 2, footerY + 6, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...GRAY)
  doc.text('Enhance Your Soul — Saisha International LLP', pageWidth / 2, footerY + 12, { align: 'center' })
  doc.text('GST No. 27AFJFS6082C1ZT', pageWidth / 2, footerY + 17, { align: 'center' })

  return doc
}

export async function downloadInvoicePDF(invoiceData: any): Promise<void> {
  const doc = await generateInvoicePDF(invoiceData)
  doc.save(`Invoice-${invoiceData.invoice_number}.pdf`)
}

export async function printInvoice(invoiceData: any): Promise<void> {
  const doc  = await generateInvoicePDF(invoiceData)
  const blob = doc.output('blob')
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url)
  if (win) win.onload = () => win.print()
}

export function sendWhatsApp(
  phone: string,
  invoiceNumber: string,
  customerName: string,
  grandTotal: number,
  storeName: string
): void {
  const clean   = phone.replace(/\D/g, '').replace(/^91/, '').replace(/^0/, '')
  const waNum   = '91' + clean
  const message = encodeURIComponent(
    `Dear ${customerName},\n\n` +
    `Thank you for visiting *${storeName}*! 🌸\n\n` +
    `Here are your purchase details:\n` +
    `📄 *Invoice No:* ${invoiceNumber}\n` +
    `💰 *Amount Paid:* Rs ${grandTotal.toLocaleString('en-IN')}\n\n` +
    `We have attached your invoice. For any queries, please contact us.\n\n` +
    `*SAIRIK — Enhance Your Soul* ✨`
  )
  window.open(`https://wa.me/${waNum}?text=${message}`, '_blank')
}
