import { test, expect } from '@playwright/test'

// AUTO-0004: Flujo de cobro en el POS y generación de boleta PDF
test.describe('POS — flujo de cobro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('vendedor1')
    await page.getByLabel('Contraseña').fill('vend1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText('Ventas del periodo')).toBeVisible()
    await page.goto('/ventas')
    await page.waitForSelector('text=Punto de Venta')
  })

  test('agrega un producto al carrito y lo refleja en el resumen', async ({ page }) => {
    await page.waitForSelector('text=Café Molido 250g', { timeout: 10000 })
    await page.getByText('Café Molido 250g').first().click()

    // El producto aparece en el panel derecho con cantidad 1
    await expect(page.getByText('1 productos · 1 unidades')).toBeVisible()
    await expect(page.locator('text=$3.490').first()).toBeVisible()
  })

  test('procesa un cobro completo sin cliente y muestra confirmación con folio', async ({ page }) => {
    await page.waitForSelector('text=Café Molido 250g', { timeout: 10000 })
    await page.getByText('Café Molido 250g').first().click()

    // Saltarse el confirm nativo del navegador
    await page.evaluate(() => { window.confirm = () => true })

    await page.getByRole('button', { name: 'Sin RUT' }).click()
    await page.waitForSelector('text=CLIENTE FINAL')
    await page.getByRole('button', { name: /cobrar/i }).click()

    await expect(page.getByText(/boleta n°/i)).toBeVisible({ timeout: 15000 })
  })

  test('muestra el botón de descargar PDF tras un cobro exitoso', async ({ page }) => {
    await page.waitForSelector('text=Café Molido 250g', { timeout: 10000 })
    await page.getByText('Café Molido 250g').first().click()

    await page.evaluate(() => { window.confirm = () => true })

    await page.getByRole('button', { name: 'Sin RUT' }).click()
    await page.waitForSelector('text=CLIENTE FINAL')
    await page.getByRole('button', { name: /cobrar/i }).click()

    await expect(page.getByText(/boleta n°/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Descargar PDF')).toBeVisible()
  })
})
