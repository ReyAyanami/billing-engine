# Database Migrations

This directory contains TypeORM migrations for the Billing Engine database schema.

## Migration Commands

### Run Migrations
Apply all pending migrations to the database:
```bash
npm run migration:run
```

### Revert Migration
Revert the most recently applied migration:
```bash
npm run migration:revert
```

### Show Migrations
Display the status of all migrations (applied/pending):
```bash
npm run migration:show
```

### Generate Migration
Automatically generate a migration by comparing entities with database schema:
```bash
npm run migration:generate -- src/migrations/MigrationName
```

### Create Empty Migration
Create a new empty migration file:
```bash
npm run migration:create -- src/migrations/MigrationName
```

## Environment Configuration

### Development
In development, the application uses `synchronize: true` by default, which auto-creates the schema.

To use migrations in development, set:
```env
USE_MIGRATIONS=true
```

### Production
In production, migrations are **automatically run** on application startup:
- `synchronize` is disabled
- `migrationsRun` is enabled

## Migration Files

### Initial Schema Migration
`1765108546941-InitialSchema.ts` - Creates the initial database schema:
- **currencies** table with default currencies (USD, EUR, GBP, BTC, ETH, POINTS)
- **accounts** table with foreign key to currencies
- **transactions** table with foreign keys to accounts
- **audit_logs** table for audit trail
- All necessary indexes for performance
- Enum types for status fields

## Best Practices

### Creating Migrations
1. Always test migrations on a development database first
2. Ensure migrations can be rolled back (implement `down` method)
3. Never modify existing migrations that have been applied to production
4. Use meaningful names for migrations

### Migration Safety
- Migrations are atomic (wrapped in a transaction)
- Failed migrations will rollback automatically
- Keep migrations idempotent when possible
- Test both `up` and `down` methods

### Production Deployment
1. Backup database before deploying
2. Review migration SQL before applying
3. Test migrations on staging environment
4. Monitor application logs during deployment

## Troubleshooting

### Migration Already Applied
If you see "migration already applied", check:
```bash
npm run migration:show
```

### Rollback Failed Migration
If a migration fails, it will automatically rollback. Fix the issue and run again.

### Reset Development Database
To start fresh in development:
```bash
# Drop and recreate database
docker-compose down -v
docker-compose up -d

# Run migrations
npm run migration:run
```

## Schema Changes

When modifying entities:
1. Update the entity files
2. Generate a new migration: `npm run migration:generate -- src/migrations/UpdateSchema`
3. Review the generated migration
4. Test in development
5. Deploy to production

## Example: Adding a New Column

```typescript
export class AddAccountNickname1234567890123 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "accounts" 
            ADD COLUMN "nickname" VARCHAR(100)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "accounts" 
            DROP COLUMN "nickname"
        `);
    }
}
```

## Notes

- Migrations are stored in the database in the `migrations` table (auto-created by TypeORM)
- Each migration runs exactly once
- Migrations run in chronological order based on timestamp
- The initial schema includes all necessary constraints and indexes for production use

