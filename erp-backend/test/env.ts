// Variables para las pruebas de integración; la base la entrega DATABASE_URL (ver global-setup).
process.env.JWT_SECRET ??= 'secreto-de-pruebas-de-integracion-0123456789'
process.env.NODE_ENV = 'test'
