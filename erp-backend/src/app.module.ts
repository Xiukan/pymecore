import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { EntidadesModule } from './entidades/entidades.module';
import { GuiasDespachoModule } from './guias-despacho/guias-despacho.module';
import { SyncModule } from './sync/sync.module';
import { ItemsModule } from './items/items.module';
import { OfertasModule } from './ofertas/ofertas.module';
import { PrismaModule } from './prisma/prisma.module';
import { StockModule } from './stock/stock.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    SucursalesModule,
    ItemsModule,
    EntidadesModule,
    StockModule,
    TransactionsModule,
    UsuariosModule,
    OfertasModule,
    GuiasDespachoModule,
    SyncModule,
  ],
})
export class AppModule {}
