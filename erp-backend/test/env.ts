import { certificadosSinteticos } from './fixtures/certificados-sinteticos'

// Variables para las pruebas de integración; la base la entrega DATABASE_URL (ver global-setup).
process.env.JWT_SECRET ??= 'secreto-de-pruebas-de-integracion-0123456789'
process.env.NODE_ENV = 'test'

// Firma de DTE con material sintético: mismo resultado en el CI y en cualquier máquina.
const sii = certificadosSinteticos()
process.env.SII_CAF_PATH = sii.caf
process.env.SII_P12_PATH = sii.p12
process.env.SII_P12_PASSWORD = sii.clave
