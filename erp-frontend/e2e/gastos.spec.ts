import { test, expect } from '@playwright/test'

// Gastos generales: registrar, ver montos derivados y pagar.
test.describe('Gastos de la empresa', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('admin')
    await page.getByLabel('Contraseña').fill('admin1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()
    await page.goto('/gastos')
    await expect(page.getByText('Gastos de la empresa')).toBeVisible()
  })

  test('registra una boleta pagada y la muestra con su costo', async ({ page }) => {
    const descripcion = `Útiles de aseo ${Date.now()}`
    await page.getByRole('button', { name: 'Registrar gasto' }).click()
    await page.getByPlaceholder('ej. Arriendo local octubre').fill(descripcion)
    await page.locator('label:has-text("Categoría *") select').selectOption({ label: 'Útiles y oficina' })
    await page.locator('label:has-text("Total pagado *") input').fill('8990')
    await expect(page.getByText('Costo $8.990')).toBeVisible()
    await page.getByRole('button', { name: 'Guardar' }).click()
    const fila = page.locator('tr', { hasText: descripcion })
    await expect(fila).toBeVisible()
    await expect(fila).toContainText('Pagado · Efectivo')
  })

  test('un gasto por pagar se paga desde el listado', async ({ page }) => {
    const descripcion = `Mantención ${Date.now()}`
    await page.getByRole('button', { name: 'Registrar gasto' }).click()
    await page.getByPlaceholder('ej. Arriendo local octubre').fill(descripcion)
    await page.locator('label:has-text("Categoría *") select').selectOption({ label: 'Mantención y reparaciones' })
    await page.locator('label:has-text("Total pagado *") input').fill('25000')
    await page.getByLabel('Ya está pagado').uncheck()
    await page.getByRole('button', { name: 'Guardar' }).click()
    const fila = page.locator('tr', { hasText: descripcion })
    await expect(fila).toContainText('Por pagar')
    await fila.locator('select').selectOption('Transferencia')
    await expect(fila).toContainText('Pagado · Transferencia')
  })
})
