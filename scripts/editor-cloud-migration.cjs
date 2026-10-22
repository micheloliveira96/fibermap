// Additive upgrade for an existing FiberMap foundation. Never resets data.
const fs = require("node:fs"),
  crypto = require("node:crypto");
const migrations = [
  "202610220004_map_editor",
  "202610220005_equipment_containers",
  "202610220006_editor_security",
];
let sql = "SET search_path = public, extensions;\n";
for (const name of migrations) {
  const source = fs
    .readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")
    .replaceAll("\r\n", "\n");
  sql += source + "\n";
  const checksum = crypto.createHash("sha256").update(source).digest("hex");
  sql += `INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,applied_steps_count) VALUES ('${crypto.randomUUID()}','${checksum}',now(),'${name}',1);\n`;
}
process.stdout.write(sql);
