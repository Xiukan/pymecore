import jsPDF from 'jspdf'

interface DetallePdf {
  nombre: string
  cantidad: number
  precio: number
  subtotal: number
}

interface BoletaData {
  folio: number
  tipoDoc: number
  fecha: string
  rutEmisor: string
  razonSocialEmisor: string
  rutReceptor: string
  razonSocialReceptor: string
  medioPago: string
  detalles: DetallePdf[]
  montoTotal: number
  sucursal: string
  metadatosSii?: any
}

export function generarPdfBoleta(data: BoletaData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const W = 148
  let y = 10

  const tipoNombre =
    data.tipoDoc === 33 ? 'FACTURA ELECTRONICA'
    : data.tipoDoc === 61 ? 'NOTA DE CREDITO'
    : 'BOLETA ELECTRONICA'

  // Cabecera emisor
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PYMECORE', W / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(data.razonSocialEmisor, W / 2, y, { align: 'center' })
  y += 4
  doc.text(`RUT: ${data.rutEmisor}`, W / 2, y, { align: 'center' })
  y += 4
  doc.text(data.sucursal, W / 2, y, { align: 'center' })
  y += 6

  // Banner tipo documento
  doc.setFillColor(30, 80, 160)
  doc.rect(10, y, W - 20, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(tipoNombre, W / 2, y + 5.5, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += 12

  // Datos receptor
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`N° ${data.folio}`, 10, y)
  doc.text(`Fecha: ${data.fecha}`, W - 10, y, { align: 'right' })
  y += 5
  doc.text(`Receptor: ${data.razonSocialReceptor}`, 10, y)
  y += 4
  doc.text(`RUT: ${data.rutReceptor}`, 10, y)
  y += 4
  doc.text(`Medio pago: ${data.medioPago}`, 10, y)
  y += 6

  // Tabla productos
  doc.setDrawColor(180, 180, 180)
  doc.line(10, y, W - 10, y)
  y += 4

  doc.setFont('helvetica', 'bold')
  doc.text('Producto', 10, y)
  doc.text('Cant', 95, y, { align: 'right' })
  doc.text('Precio', 118, y, { align: 'right' })
  doc.text('Subtotal', W - 10, y, { align: 'right' })
  y += 3
  doc.line(10, y, W - 10, y)
  y += 4

  doc.setFont('helvetica', 'normal')
  for (const d of data.detalles) {
    const nombreCorto = d.nombre.length > 35 ? d.nombre.slice(0, 32) + '...' : d.nombre
    doc.text(nombreCorto, 10, y)
    doc.text(String(d.cantidad), 95, y, { align: 'right' })
    doc.text(`$${d.precio.toLocaleString('es-CL')}`, 118, y, { align: 'right' })
    doc.text(`$${d.subtotal.toLocaleString('es-CL')}`, W - 10, y, { align: 'right' })
    y += 5
  }

  y += 2
  doc.line(10, y, W - 10, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL:', 80, y, { align: 'right' })
  doc.text(`$${data.montoTotal.toLocaleString('es-CL')}`, W - 10, y, { align: 'right' })
  y += 10

  // Timbre SII (TED)
  _dibujarTimbreSii(doc, data, y, W)

  const filename = `${tipoNombre.replace(/ /g, '_')}_${data.folio}.pdf`
  doc.save(filename)
}

function _dibujarTimbreSii(doc: jsPDF, data: BoletaData, y: number, W: number): void {
  const meta = data.metadatosSii
  // Sin folio = no hay DTE generado todavía (caso raro: sin pool disponible)
  const sinDte = !meta || meta?.sinFolio || (!meta?.folio && !data.folio)
  // Tiene DTE generado pero aún no enviado al SII
  const pendienteEnvio = !sinDte && meta?.pendienteDte === true

  // Borde del recuadro TED
  const boxH = 32
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.rect(10, y, W - 20, boxH)

  // Título TED
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('TIMBRE ELECTRONICO SII', W / 2, y + 4, { align: 'center' })

  if (sinDte) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(180, 60, 0)
    doc.text('DOCUMENTO PENDIENTE DE TIMBRAJE', W / 2, y + 10, { align: 'center' })
    doc.text('Se timbrara automaticamente al recuperar conexion', W / 2, y + 15, { align: 'center' })
    doc.setTextColor(0, 0, 0)
  } else {
    // DTE generado — mostrar datos del timbre
    const folio = meta?.folio ?? data.folio
    const tipoDoc = meta?.tipoDoc ?? data.tipoDoc
    const rutEmisor = meta?.rutEmisor ?? data.rutEmisor
    const monto = meta?.montoTotal ?? data.montoTotal
    const fecha = meta?.fechaEmision ?? data.fecha

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)

    const col1x = 13
    const col2x = W / 2 + 2
    let ty = y + 9

    doc.text(`RUT Emisor: ${rutEmisor}`, col1x, ty)
    doc.text(`Tipo Doc: ${tipoDoc}`, col2x, ty)
    ty += 4
    doc.text(`Folio: ${folio}`, col1x, ty)
    doc.text(`Fecha: ${fecha}`, col2x, ty)
    ty += 4
    doc.text(`Monto: $${Number(monto).toLocaleString('es-CL')}`, col1x, ty)
    doc.text(`RUT Recep: ${data.rutReceptor}`, col2x, ty)
    ty += 4

    // Simulación visual del código PDF417
    _dibujarBarrasPdf417(doc, 13, ty, W - 26, pendienteEnvio ? 7 : 10)

    // Leyenda pendiente de envío (si aplica)
    if (pendienteEnvio) {
      ty += 8
      doc.setFontSize(5.5)
      doc.setTextColor(160, 90, 0)
      doc.text('* Documento timbrado — pendiente de envio al SII', col1x, ty)
      doc.setTextColor(0, 0, 0)
    }
  }

  // Leyenda final
  const lyFinal = y + boxH + 3
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 100, 100)
  doc.text('Documento Tributario Electronico — Resolución Ex. SII N°80 de 2014', W / 2, lyFinal, { align: 'center' })
  doc.text('Verifique en www.sii.cl', W / 2, lyFinal + 3.5, { align: 'center' })
}

function _dibujarBarrasPdf417(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  // Patrón visual que simula un código de barras PDF417
  const barCount = 55
  const barW = w / barCount
  // Patrón pseudo-aleatorio determinista basado en posición
  for (let i = 0; i < barCount; i++) {
    // Alterna anchos de barra usando un patrón fijo que parece un código real
    const isFilled = (i * 7 + i % 3 * 4 + (i > 20 ? 1 : 0)) % 3 !== 0
    if (isFilled) {
      doc.setFillColor(0, 0, 0)
      doc.rect(x + i * barW, y, barW * 0.7, h, 'F')
    }
  }
  // Marco exterior del código
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.rect(x, y, w, h)
}
