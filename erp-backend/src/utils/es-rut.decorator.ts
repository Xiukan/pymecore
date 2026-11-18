import { registerDecorator, ValidationOptions } from 'class-validator';
import { validarRut } from './rut.util';

/** RUT con formato 12345678-9 y dígito verificador correcto. */
export function EsRut(opciones?: ValidationOptions) {
  return (objeto: object, propiedad: string) =>
    registerDecorator({
      name: 'esRut',
      target: objeto.constructor,
      propertyName: propiedad,
      options: { message: 'RUT inválido: revise el dígito verificador (formato 12345678-9).', ...opciones },
      validator: {
        validate: (valor: unknown) => typeof valor === 'string' && /^\d{7,8}-[\dkK]$/.test(valor) && validarRut(valor),
      },
    });
}
