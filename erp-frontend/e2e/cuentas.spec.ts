import { test, expect } from '@playwright/test'
import { calcularDv } from '../src/utils/rut'

// Crédito: habilitar cupo al cliente, vender a crédito en el POS y cobrar un abono.
test('venta a crédito y abono desde cuentas por cobrar', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('admin1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()

  // 0. Cliente nuevo con RUT válido, registrado desde el POS.
  const cuerpo = String(10_000_000 + (Date.now() % 9_000_000))
  const rut = `${cuerpo}-${calcularDv(cuerpo).toUpperCase()}`
  const nombre = `Cliente Crédito ${cuerpo}`
  await page.goto('/ventas')
  await page.evaluate(() => { window.confirm = () => true })
  await expect(page.getByText(/● Caja (abierta|cerrada)/)).toBeVisible()
  if (await page.getByRole('button', { name: 'Abrir caja' }).isVisible()) {
    await page.getByPlaceholder('Fondo inicial').fill('0')
    await page.getByRole('button', { name: 'Abrir caja' }).click()
  }
  await page.getByText('Café Molido 250g').first().click()
  await page.getByRole('button', { name: 'Buscar por RUT' }).click()
  await page.getByPlaceholder('12345678 o 12345678-9').fill(rut)
  await page.getByPlaceholder('12345678 o 12345678-9').press('Enter')
  await page.getByPlaceholder('Nombre *').fill(nombre)
  await page.getByRole('button', { name: 'Registrar y continuar' }).click()
  await expect(page.getByText(`✓ ${nombre}`)).toBeVisible()

  // 1. Cupo de crédito al cliente.
  await page.goto('/clientes')
  const fila = page.locator('tr', { hasText: nombre })
  await fila.getByRole('button', { name: 'Editar' }).click()
  await fila.getByPlaceholder('Cupo').fill('100000')
  await fila.getByPlaceholder('Días').fill('30')
  await fila.getByRole('button', { name: 'Guardar' }).click()
  await expect(fila).toContainText('$100.000 · 30 días')

  // 2. Venta a crédito en el POS (con el RUT escrito con guion y dígito verificador).
  await page.goto('/ventas')
  await page.evaluate(() => { window.confirm = () => true })
  await expect(page.getByText('● Caja abierta')).toBeVisible()
  await page.getByText('Café Molido 250g').first().click()
  await page.getByRole('button', { name: 'Buscar por RUT' }).click()
  await page.getByPlaceholder('12345678 o 12345678-9').fill(rut)
  await page.getByPlaceholder('12345678 o 12345678-9').press('Enter')
  await expect(page.getByText(`✓ ${nombre}`)).toBeVisible()
  await page.getByText('Crédito', { exact: true }).click()
  await page.getByRole('button', { name: /cobrar/i }).click()
  await expect(page.getByText(/emitida/)).toBeVisible({ timeout: 15000 })

  // 3. La deuda aparece en cuentas por cobrar y se abona.
  await page.goto('/cuentas')
  const cliente = page.locator('section', { hasText: nombre })
  await expect(cliente).toBeVisible()
  const saldoAntes = await cliente.locator('h2 + span').innerText()
  await cliente.getByRole('button', { name: 'Abonar' }).first().click()
  await cliente.locator('input[type=number]').fill('1000')
  await cliente.locator('select').selectOption('Transferencia')
  await cliente.getByRole('button', { name: 'Registrar' }).click()
  await expect(cliente.locator('h2 + span')).not.toHaveText(saldoAntes)
})
