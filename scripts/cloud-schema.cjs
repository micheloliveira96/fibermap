// Emits a reviewed SQL bundle for a NEW, EMPTY Supabase project only.
// Passwords and infrastructure records are deliberately excluded.
const fs = require('node:fs');
const crypto = require('node:crypto');
const migrations = fs.readdirSync('prisma/migrations').filter(name => fs.existsSync(`prisma/migrations/${name}/migration.sql`)).sort();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
let sql = 'CREATE SCHEMA IF NOT EXISTS extensions;\n';
for (const name of migrations) sql += fs.readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8').replace('CREATE EXTENSION IF NOT EXISTS postgis;', 'CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;\nSET search_path = public, extensions;') + '\n';
sql += `CREATE TABLE public._prisma_migrations (
  id varchar(36) PRIMARY KEY, checksum varchar(64) NOT NULL,
  finished_at timestamptz, migration_name varchar(255) NOT NULL,
  logs text, rolled_back_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0
);\n`;
for (const name of migrations) {
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
  sql += `INSERT INTO public._prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES (${quote(crypto.randomUUID())},${quote(checksum)},now(),${quote(name)},1);\n`;
}
sql += 'ALTER FUNCTION public.validate_connection_terminals() SET search_path = public, extensions;\n';
const tables = ['User','Session','Account','Verification','Organization','Membership','Asset','FiberStrand','OpticalTerminal','InternalLink','NetworkConnection','ConnectionTerminal','AuditLog','_prisma_migrations'];
for (const table of tables) sql += `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON TABLE public."${table}" FROM anon, authenticated;\n`;
sql += 'REVOKE EXECUTE ON FUNCTION public.validate_connection_terminals() FROM PUBLIC, anon, authenticated;\n';
if (process.argv.includes('--checksums')) {
  process.stdout.write(migrations.map(name => {
    const checksum = crypto.createHash('sha256').update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    return `UPDATE public._prisma_migrations SET checksum = ${quote(checksum)} WHERE migration_name = ${quote(name)};`;
  }).join('\n'));
} else process.stdout.write(sql);
