import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CurrencyService } from './modules/currency/currency.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('Billing Engine API')
    .setDescription(
      'A production-grade billing system API for managing accounts, transactions, and payments. ' +
        'Supports multiple currencies, atomic transfers, refunds, and complete audit trails.',
    )
    .setVersion('1.0')
    .addTag('accounts', 'Account management operations')
    .addTag('transactions', 'Transaction processing operations')
    .addTag('currencies', 'Currency configuration')
    .addServer('http://localhost:3000', 'Local Development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Billing Engine API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  // Initialize default currencies
  const currencyService = app.get(CurrencyService);
  await currencyService.initializeDefaultCurrencies();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Billing Engine API running on port ${port}`);
  logger.log(
    `Swagger documentation available at http://localhost:${port}/api/docs`,
  );
}
bootstrap();
