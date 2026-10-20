-- Diagnóstico (solo lectura) de ventas registradas antes de que el precio se tratara como
-- IVA incluido: en ellas el backend sumó IVA sobre el precio y el total quedó por encima de
-- lo cobrado en el POS. No modifica datos; la corrección es una decisión de negocio.
--   psql -U erp_user -d erp_db -f scripts/diagnostico-iva-historico.sql
WITH ventas AS (
  SELECT t.id, t.numero_factura, t.fecha_registro::date AS fecha, t.monto_total,
         round(sum(d.precio_unitario * d.cantidad - d.descuento_linea)) - t.descuento_global AS cobrado
    FROM transacciones t
    JOIN transacciones_detalle d ON d.transaccion_id = t.id
   WHERE t.tipo_transaccion = 'VENTA' AND t.estado = 'Activa'
   GROUP BY t.id
)
SELECT count(*) FILTER (WHERE monto_total > cobrado)               AS ventas_infladas,
       count(*)                                                    AS ventas_totales,
       sum(monto_total - cobrado) FILTER (WHERE monto_total > cobrado) AS diferencia_total,
       min(fecha) FILTER (WHERE monto_total > cobrado)             AS desde,
       max(fecha) FILTER (WHERE monto_total > cobrado)             AS hasta
  FROM ventas;
