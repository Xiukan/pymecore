/**
 * Rol de esta instancia del backend:
 * - local: todo en una base (desarrollo y demostración); el SII simulado se llama directo.
 * - edge: el local de la PYME; vende sin internet y envía su cola a la nube.
 * - cloud: la nube; recibe lotes de los locales, envía al SII y emite licencias.
 */
export type Modo = 'local' | 'edge' | 'cloud';
export const modo = (): Modo => (['edge', 'cloud'].includes(process.env.MODO ?? '') ? (process.env.MODO as Modo) : 'local');
