# Database Migrations

To apply a new migration:

1. Connect to the PostgreSQL database with admin credentials
2. Run the SQL file: `psql -h <host> -U <user> -d <database> < <migration_file>.sql`
3. Verify the tables and indexes were created: `\dt` in psql

For production deployments, use your standard migration tool (Flyway, pg-migrate, etc.).
