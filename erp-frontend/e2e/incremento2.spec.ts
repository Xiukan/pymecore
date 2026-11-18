import { test, expect } from '@playwright/test'

// Incremento 2 en el navegador: registrar un vencimiento pasado, dar de baja el lote y verlo
// en "Pérdidas por vencimiento"; cambiar el aviso de un producto (AC-09, AC-13, AC-14).
const enDias = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('admin1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()
  await page.goto('/lotes')
})

test('dar de baja un lote vencido y verlo como pérdida', async ({ page }) => {
  const sinDato = page.getByRole('listitem').filter({ hasText: 'Sin dato' }).first()
  const nombre = (await sinDato.locator('p').first().textContent())!
  await sinDato.getByRole('button', { name: 'Registrar vencimiento' }).click()
  await page.getByLabel('Cantidad con esa fecha').fill('1')
  await page.getByLabel('Fecha de vencimiento').fill(enDias(-1))
  await page.getByRole('button', { name: 'Guardar' }).click()

  const vencido = page.getByRole('listitem').filter({ hasText: nombre }).filter({ hasText: 'Vencido' })
  await expect(vencido.getByRole('status')).toHaveText(/⛔\s*Vencido/)
  await vencido.getByRole('button', { name: 'Dar de baja' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Dar de baja \(vencido\)/ }).click()
  await expect(page.getByText(/dado de baja: 1 .*pérdida \$/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: nombre }).filter({ hasText: 'Vencido' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Pérdidas por vencimiento' }).click()
  await expect(page.getByText('⛔ Perdido por vencimiento')).toBeVisible()
  await expect(page.locator('tr', { hasText: nombre })).toBeVisible()
})

test('cambiar el aviso de vencimiento de un producto', async ({ page }) => {
  await page.getByRole('combobox').selectOption('todos')
  const fila = page.getByRole('listitem').filter({ hasText: /aviso \d+ días? antes/ }).first()
  page.once('dialog', (d) => d.accept('20'))
  await fila.getByRole('button', { name: 'cambiar' }).click()
  await expect(page.getByText(/Aviso de ".*" actualizado/)).toBeVisible()
  await expect(page.getByText('aviso 20 días antes').first()).toBeVisible()
})
