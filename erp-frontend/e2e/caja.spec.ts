import { test, expect, type Page } from '@playwright/test'

/** Entra como vendedor al POS con una caja recién abierta con $10.000 de fondo. */
async function cajaNueva(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('vendedor1')
  await page.getByLabel('Contraseña').fill('vend1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()
  await page.goto('/ventas')
  await page.evaluate(() => { window.confirm = () => true })

  // Espera a que cargue el estado de caja; si quedó una abierta de otra prueba, se cierra primero.
  await expect(page.getByText(/● Caja (abierta|cerrada)/)).toBeVisible()
  if (await page.getByText('● Caja abierta').isVisible()) {
    await page.getByRole('button', { name: 'Cerrar caja' }).click()
    await page.getByPlaceholder('Efectivo contado').fill('0')
    await page.getByRole('button', { name: 'Cerrar caja' }).last().click()
    await page.getByRole('button', { name: 'Listo' }).click()
  }

  await page.getByPlaceholder('Fondo inicial').fill('10000')
  await page.getByRole('button', { name: 'Abrir caja' }).click()
  await expect(page.getByText('efectivo esperado $10.000')).toBeVisible()
}

// D-06: F3 debe cobrar con el medio de pago elegido después de armar el carrito.
// Con el defecto, la venta se enviaba como Efectivo porque el atajo conservaba el estado anterior.
test('F3 cobra con el medio de pago vigente (D-06)', async ({ page }) => {
  await cajaNueva(page)
  await page.getByText('Café Molido 250g').first().click()
  await page.getByText('Tarjeta', { exact: true }).click()
  await page.getByRole('button', { name: 'Sin RUT' }).click()
  const venta = page.waitForRequest((r) => r.method() === 'POST' && /\/transactions$/.test(new URL(r.url()).pathname))
  await page.keyboard.press('F3')
  expect((await venta).postDataJSON().medioPago).toBe('Tarjeta')
  await expect(page.getByText(/emitida/)).toBeVisible({ timeout: 15000 })
})

// Caja: abrir con fondo, vender con distintos medios y cerrar con arqueo.
test('apertura, ventas y cierre de caja con informe Z', async ({ page }) => {
  await cajaNueva(page)

  const cobrar = async (medio: string) => {
    await page.getByText('Café Molido 250g').first().click()
    await page.getByText(medio, { exact: true }).click()
    await page.getByRole('button', { name: 'Sin RUT' }).click()
    await page.getByRole('button', { name: /cobrar/i }).click()
    await expect(page.getByText(/emitida/)).toBeVisible({ timeout: 15000 })
  }
  await cobrar('Efectivo')
  await cobrar('Tarjeta')
  await expect(page.getByText('efectivo esperado $13.490')).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar caja' }).click()
  await page.getByPlaceholder('Efectivo contado').fill('13000')
  await page.getByRole('button', { name: 'Cerrar caja' }).last().click()
  await expect(page.getByText('Informe Z')).toBeVisible()
  await expect(page.getByText('Diferencia -$490')).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('● Caja cerrada')).toBeVisible()

  await page.goto('/caja')
  await expect(page.locator('tr', { hasText: '$13.000' }).first()).toContainText('-$490')
})
