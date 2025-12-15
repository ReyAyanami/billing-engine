import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const getDatabaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432', 10),
  username: process.env['DB_USERNAME'] || 'postgres',
  password: process.env['DB_PASSWORD'] || 'postgres',
  database: process.env['DB_DATABASE'] || 'billing_engine',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  // Use migrations in production, synchronize in development
  synchronize:
    process.env['NODE_ENV'] !== 'production' &&
    process.env['USE_MIGRATIONS'] !== 'true',
  migrationsRun:
    process.env['NODE_ENV'] === 'production' ||
    process.env['USE_MIGRATIONS'] === 'true',
  logging: process.env['NODE_ENV'] === 'development',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
});
