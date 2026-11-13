const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function setupDbGuards() {
  console.log("Applying database-level append-only constraints on ActivityLog...");

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_activity_log_update
    BEFORE UPDATE ON ActivityLog
    BEGIN
      SELECT RAISE(ABORT, 'ActivityLog is append-only and cannot be updated');
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_activity_log_delete
    BEFORE DELETE ON ActivityLog
    BEGIN
      SELECT RAISE(ABORT, 'ActivityLog is append-only and cannot be deleted');
    END;
  `);

  console.log("Database triggers successfully established on ActivityLog.");
  await prisma.$disconnect();
}

setupDbGuards().catch((err) => {
  console.error("Error setting up DB guards:", err);
  process.exit(1);
});
