-- Datos adicionales al seed para pruebas de navegador (nunca en producción).
INSERT INTO sucursales (id, nombre) VALUES ('6f1c2a3e-2222-4a1a-8a1a-000000000002', 'Sucursal Norte')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO folios_disponibles (id, tipo_doc, numero)
  SELECT gen_random_uuid(), 39, g FROM generate_series(1, 500) g
  ON CONFLICT (tipo_doc, numero) DO NOTHING;
