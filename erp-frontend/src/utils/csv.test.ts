import { describe, expect, it } from 'vitest'
import { aCsv } from './csv'

describe('CSV', () => {
  it('usa ; y BOM, escapa comillas y deja vacío lo nulo', () => {
    expect(aCsv([['Folio', 'Razón social'], [1776, 'PLA "Ltda"'], [null, undefined]])).toBe('﻿"Folio";"Razón social"\r\n"1776";"PLA ""Ltda"""\r\n"";""')
  })
})
