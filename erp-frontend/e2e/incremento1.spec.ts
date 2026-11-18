import { test, expect, type Page } from '@playwright/test'

// Recorridos del Incremento 1 que se demuestran en la defensa.
async function entrar(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('admin1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()
}

const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('Incremento 1', () => {
  test.beforeEach(async ({ page }) => entrar(page))

  test('AC-08: vender en 3 pasos (producto → Cobrar → confirmar)', async ({ page }) => {
    await page.goto('/ventas')
    await expect(page.getByText(/● Caja (abierta|cerrada)/)).toBeVisible()
    if (await page.getByText('● Caja cerrada').isVisible()) {
      await page.getByPlaceholder(/fondo/i).fill('0')
      await page.getByRole('button', { name: 'Abrir caja' }).click()
      await expect(page.getByText('● Caja abierta')).toBeVisible()
    }
    let pasos = 0
    page.on('dialog', (d) => { pasos++; d.accept() })
    await page.getByText('Café Molido 250g').first().click(); pasos++
    await page.getByRole('button', { name: /cobrar/i }).click(); pasos++
    await expect(page.getByText(/emitida/)).toBeVisible({ timeout: 15000 })
    expect(pasos).toBe(3)
  })

  test('AC-05 y AC-06 (AUTO-0006): "Próximo a vencer" con ícono y texto; sin fecha, "Sin dato"', async ({ page }) => {
    await page.goto('/lotes')
    const sinDato = page.getByRole('listitem').filter({ hasText: 'Sin dato' }).first()
    await expect(sinDato).toBeVisible()
    const nombre = (await sinDato.locator('p').first().textContent())!
    await sinDato.getByRole('button', { name: 'Registrar vencimiento' }).click()
    await page.getByLabel('Cantidad con esa fecha').fill('1')
    await page.getByLabel('Fecha de vencimiento').fill(enDias(2))
    await page.getByRole('button', { name: 'Guardar' }).click()
    const fila = page.getByRole('listitem').filter({ hasText: nombre }).filter({ hasText: 'Próximo a vencer' })
    await expect(fila.getByRole('status')).toHaveText(/⚠\s*Próximo a vencer \(2 días\)/)
    await expect(page.getByRole('status').filter({ hasText: 'Sin dato' }).first()).toContainText('?')
    await page.goto('/')
    await expect(page.getByText(/⚠ \d+ insumos? (está|están) próximos? a vencer \(3 días o menos\)/)).toBeVisible()
  })

  test('la conexión se muestra desde el servidor y ya no existe "Simular offline" (RET-06)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Simular/ })).toHaveCount(0)
    await expect(page.locator('aside').getByRole('status')).toBeVisible()
  })
})
