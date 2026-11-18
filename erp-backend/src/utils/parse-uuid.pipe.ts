import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

/** Acepta cualquier UUID con formato 8-4-4-4-12 (el seed usa ids fijos que no son v4). */
@Injectable()
export class ParseLooseUuidPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!isUUID(value, 'loose')) throw new BadRequestException('Identificador inválido.');
    return value;
  }
}
