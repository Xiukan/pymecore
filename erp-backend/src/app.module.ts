import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ComprasModule } from './compras/compras.module';
import { EmpresaModule } from './empresa/empresa.module';
import { EntidadesModule } from './entidades/entidades.module';
import { GuiasDespachoModule } from './guias-despacho/guias-despacho.module';
import { SyncModule } from './sync/sync.module';
import { ItemsModule } from './items/items.module';
import { OfertasModule } from './ofertas/ofertas.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportesModule } from './reportes/reportes.module';
import { StockModule } from './stock/stock.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { TransactionsModule } from './transactions/transactions.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite general holgado por IP; el login tiene uno propio más estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
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
    ReportesModule,
    EmpresaModule,
    ComprasModule,
  ],
})
export class AppModule {}
