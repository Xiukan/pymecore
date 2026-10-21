import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [TransactionsModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
