import { test, expect, type Page } from '@playwright/test'

// Flujos nuevos para pymes agrícolas: módulos, productores, lotes, campo, contabilidad,
// cotizaciones y conteo físico. Corre en serie sobre una base de prueba limpia.
test.describe.configure({ mode: 'serial' })

async function entrar(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill('admin')
  await page.getByLabel('Contraseña').fill('admin1234')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByText('¿Qué quieres hacer?')).toBeVisible()
}

const sufijo = Date.now().toString().slice(-6)

test.describe('PYMECORE agro', () => {
  test.beforeEach(async ({ page }) => entrar(page))

  test('la empresa activa módulos y aparecen en el menú', async ({ page }) => {
    await page.goto('/configuracion')
    for (const m of ['Compras a productores', 'Campo', 'Contabilidad', 'Cotizaciones y pedidos']) {
      const caja = page.locator('label', { hasText: m }).locator('input[type="checkbox"]').first()
      if (!(await caja.isChecked())) {
        await caja.check()
        await expect(page.getByText('Guardado.')).toBeVisible()
      }
    }
    await page.reload()
    const menu = page.locator('aside nav')
    await expect(menu.getByRole('link', { name: 'Compras a productores' })).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Mi campo' })).toBeVisible()
  })

  test('recibe producto de un productor nuevo y queda su lote', async ({ page }) => {
    await page.goto('/productores')
    await page.getByText('+ Nuevo productor').click()
    await page.getByPlaceholder('RUT (12345678-5)').fill('11111111-1')
    await page.getByPlaceholder('Nombre').fill(`Productor ${sufijo}`)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('select').first()).toHaveValue(/.+/)
    await page.locator('select').nth(1).selectOption({ index: 1 })
    await page.getByLabel('Peso bruto').fill('1050')
    await page.getByLabel('Tara (camión vacío, envases)').fill('50')
    await page.getByLabel('Precio por kilo (neto)').fill('500')
    await expect(page.getByText('Kilos a pagar', { exact: true })).toBeVisible()
    await expect(page.locator('aside').getByText('$500.000').first()).toBeVisible()
    await page.getByRole('button', { name: 'Registrar recepción' }).click()
    const fila = page.locator('tr', { hasText: `Productor ${sufijo}` })
    await expect(fila).toContainText('1.000 kg')
    await page.goto('/lotes')
    await expect(page.locator('tr', { hasText: `Productor ${sufijo}` })).toContainText('RP-')
  })

  test('campo: cuartel, aplicación con carencia y cosecha bloqueada', async ({ page }) => {
    await page.goto('/campo')
    await page.getByPlaceholder('Nombre (ej: Fundo El Roble)').fill(`Fundo ${sufijo}`)
    await page.getByRole('button', { name: 'Crear predio' }).click()
    await expect(page.getByRole('heading', { name: new RegExp(`Fundo ${sufijo}`) })).toBeVisible()
    const anio = new Date().getFullYear()
    const temporada = page.locator('section', { hasText: 'Temporadas' })
    await temporada.locator('input').first().fill(`T${sufijo}`)
    await temporada.locator('input[type="date"]').first().fill(`${anio - 1}-07-01`)
    await temporada.locator('input[type="date"]').last().fill(`${anio + 1}-06-30`)
    await page.getByRole('button', { name: 'Crear temporada' }).click()
    const nuevo = page.locator('section', { hasText: 'Nuevo cuartel' })
    await nuevo.locator('select').selectOption({ label: `Fundo ${sufijo}` })
    await nuevo.getByPlaceholder('Nombre (ej: Cuartel 3)').fill('Cuartel A')
    await nuevo.getByPlaceholder('Cultivo').fill('Manzano')
    await nuevo.getByPlaceholder('Hectáreas').fill('2')
    await page.getByRole('button', { name: 'Crear cuartel' }).click()
    await expect(page.locator('section', { hasText: `Fundo ${sufijo}` }).getByText('Cuartel A', { exact: true })).toBeVisible()
    await page.locator('select').first().selectOption({ label: `T${sufijo}` })

    await page.getByRole('button', { name: 'Cuaderno de campo' }).click()
    await page.getByLabel('Cuartel').selectOption({ label: `Fundo ${sufijo} · Cuartel A` })
    await page.getByLabel('Producto aplicado').selectOption({ index: 1 })
    await page.getByLabel('¿Para qué? (plaga o enfermedad)').fill('Oídio')
    await page.getByLabel('Dosis por hectárea').fill('1')
    await page.getByLabel('Carencia (días, ver etiqueta)').fill('14')
    await page.getByLabel('Quién aplicó').fill('Juan Pérez')
    await expect(page.getByText(/Se descontarán 2/)).toBeVisible()
    await page.getByRole('button', { name: 'Anotar aplicación' }).click()
    await expect(page.locator('tr', { hasText: 'Oídio' })).toBeVisible()

    await page.getByRole('button', { name: 'Cosecha', exact: true }).click()
    await page.getByLabel('Cuartel').selectOption({ label: `Fundo ${sufijo} · Cuartel A` })
    await expect(page.getByText(/está en carencia por "Oídio"/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar cosecha' })).toBeDisabled()
  })

  test('contabilidad: resultado del período y balance que cuadra', async ({ page }) => {
    await page.goto('/contabilidad')
    await expect(page.getByText(/En este período (ganaste|perdiste)/)).toBeVisible()
    await page.getByRole('button', { name: 'Balance' }).click()
    const sumas = page.locator('tr', { hasText: 'Sumas' })
    await expect(sumas).toBeVisible()
    const celdas = await sumas.locator('td').allTextContents()
    expect(celdas[1]).toBe(celdas[2])
  })

  test('cotización con vista para imprimir', async ({ page }) => {
    await page.goto('/pedidos')
    await page.getByRole('button', { name: 'Nueva cotización' }).click()
    await page.locator('select', { hasText: 'Elige...' }).first().selectOption({ index: 1 })
    await page.locator('select', { hasText: 'Producto...' }).selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText(/COTIZACIÓN N° \d+/)).toBeVisible()
    await page.getByRole('button', { name: 'Volver' }).click()
    await expect(page.locator('span', { hasText: /^Cotización$/ }).first()).toBeVisible()
  })

  test('conteo físico muestra diferencias antes de aplicar', async ({ page }) => {
    await page.goto('/inventario')
    await page.getByRole('link', { name: 'Conteo físico' }).click()
    const primera = page.locator('label', { has: page.getByPlaceholder('Contado') }).first()
    await primera.getByPlaceholder('Contado').fill('0')
    await page.getByRole('button', { name: /Revisar diferencias/ }).click()
    await expect(page.getByText(/productos cuadran/)).toBeVisible()
  })
})
