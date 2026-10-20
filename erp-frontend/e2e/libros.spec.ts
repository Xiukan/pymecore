import { test, expect } from '@playwright/test'

// Libros e IVA: solo administrador, resumen del mes y libros con descarga CSV.
test('el administrador revisa el resumen de IVA y descarga el libro de ventas', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('admin1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('Dashboard comercial')).toBeVisible()
  await page.getByRole('link', { name: 'Libros e IVA' }).click()

  await expect(page.getByText('Débito fiscal (ventas − NC)')).toBeVisible()
  await expect(page.getByText('Total a pagar (IVA + retenciones)')).toBeVisible()

  await page.getByRole('button', { name: 'Libro de ventas' }).click()
  await expect(page.locator('tbody tr').first()).toContainText(/Boleta|Factura|Sin documentos/)
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar CSV' }).click()
  expect((await descarga).suggestedFilename()).toMatch(/^libro_ventas_\d{4}-\d{2}\.csv$/)
})

test('un vendedor no ve el menú de libros', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('vendedor1')
  await page.getByLabel('Contraseña').fill('vend1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('Dashboard comercial')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Libros e IVA' })).toHaveCount(0)
})
