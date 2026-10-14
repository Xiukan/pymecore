import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

// Errores de datos del cliente que Prisma reporta como excepciones: se responden como 4xx
// en vez de 500. Lo que no está mapeado sigue siendo un error interno.
const MAPA: Record<string, [HttpStatus, string]> = {
  P2025: [HttpStatus.NOT_FOUND, 'Registro no encontrado'],
  P2002: [HttpStatus.CONFLICT, 'Ya existe un registro con esos datos'],
  P2003: [HttpStatus.BAD_REQUEST, 'Se hace referencia a un registro que no existe'],
  P2004: [HttpStatus.BAD_REQUEST, 'Los datos no cumplen una regla de integridad'],
  P2007: [HttpStatus.BAD_REQUEST, 'Identificador o dato con formato inválido'],
  P2023: [HttpStatus.BAD_REQUEST, 'Identificador o dato con formato inválido'],
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    let mapeo = MAPA[exception.code];
    if (!mapeo && /invalid input syntax|violates check constraint/i.test(exception.message)) {
      mapeo = [HttpStatus.BAD_REQUEST, 'Los datos no tienen un formato o valor válido'];
    }
    if (!mapeo) return super.catch(exception, host);
    const [statusCode, message] = mapeo;
    host.switchToHttp().getResponse().status(statusCode).json({ statusCode, message });
  }
}
