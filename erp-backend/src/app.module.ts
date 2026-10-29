import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UsuarioIpThrottlerGuard } from './auth/guards/throttler.guard';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CajaModule } from './caja/caja.module';
import { CampoModule } from './campo/campo.module';
import { FinanzasModule } from './finanzas/finanzas.module';
import { NubeModule } from './nube/nube.module';
import { PedidosModule } from './pedidos/pedidos.module';
import { PreciosModule } from './precios/precios.module';
import { ContabilidadModule } from './contabilidad/contabilidad.module';
import { LotesModule } from './lotes/lotes.module';
import { ProductoresModule } from './productores/productores.module';
import { CuentasModule } from './cuentas/cuentas.module';
import { TributarioModule } from './tributario/tributario.module';
import { ComprasModule } from './compras/compras.module';
import { EmpresaModule } from './empresa/empresa.module';
import { GastosModule } from './gastos/gastos.module';
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
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: UsuarioIpThrottlerGuard }],
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
    GastosModule,
    CajaModule,
    TributarioModule,
    CuentasModule,
    ContabilidadModule,
    LotesModule,
    ProductoresModule,
    CampoModule,
    FinanzasModule,
    PreciosModule,
    PedidosModule,
    NubeModule,
  ],
})
export class AppModule {}
