const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS unique_active_appointment_slot;`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX unique_active_appointment_slot ON Appointment (businessId, ifnull(staffId, ''), startTime) WHERE status NOT IN ('CANCELLED', 'NO_SHOW');`
  );
  const indexes = await prisma.$queryRawUnsafe(`PRAGMA index_list(Appointment);`);
  console.log("Updated Appointment indexes:", indexes);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
