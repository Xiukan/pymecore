/** El SII publica los XML en ISO-8859-1; se respeta la codificación declarada en el prólogo. */
export async function leerXml(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer()
  const prologo = new TextDecoder('ascii').decode(bytes.slice(0, 200))
  const codificacion = /encoding=["']([^"']+)["']/i.exec(prologo)?.[1] ?? 'utf-8'
  return new TextDecoder(codificacion).decode(bytes)
}
