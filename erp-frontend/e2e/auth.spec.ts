import { test, expect } from '@playwright/test'

// AUTO-0003: Flujo completo de inicio de sesión en el POS
test.describe('Autenticación', () => {
  test('vendedor puede iniciar sesión y accede al dashboard', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('PYMECORE')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible()

    await page.getByLabel('Usuario').fill('vendedor1')
    await page.getByLabel('Contraseña').fill('vend1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('Ventas del periodo')).toBeVisible()
    await expect(page.getByText('Ventas del periodo')).toBeVisible()
  })

  test('vendedor puede navegar al POS desde el menú', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('vendedor1')
    await page.getByLabel('Contraseña').fill('vend1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.getByText('Ventas del periodo')).toBeVisible()

    await page.getByText('Ventas POS').click()
    await expect(page).toHaveURL(/ventas/)
    await expect(page.getByText('Punto de Venta')).toBeVisible()
  })

  test('muestra error con credenciales incorrectas', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('vendedor1')
    await page.getByLabel('Contraseña').fill('wrongpass')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('Credenciales incorrectas')).toBeVisible()
    await expect(page).toHaveURL(/login/)
  })

  test('admin puede iniciar sesión y accede al dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Usuario').fill('admin')
    await page.getByLabel('Contraseña').fill('admin1234')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page.getByText('Ventas del periodo')).toBeVisible()
    await expect(page.getByText('Ventas del periodo')).toBeVisible()
  })
})
