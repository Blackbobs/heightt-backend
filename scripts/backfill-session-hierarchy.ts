// scripts/backfill-session-hierarchy.ts

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/v1/generated/prisma/client';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function backfillSessionHierarchy() {
  console.log('Starting session hierarchy backfill...');

  const sessions = await prisma.academicSession.findMany({
    include: {
      organizations: {
        where: {
          type: 'LEVEL',
        },
        take: 1,
        include: {
          faculty: true,
          department: true,
          academicLevel: true,
        },
      },
      institution: true,
    },
  });

  let updatedCount = 0;

  for (const session of sessions) {
    // Find the first organization to get hierarchy info
    const org = session.organizations[0];

    if (org) {
      const updateData: any = {};

      if (org.facultyId) {
        updateData.facultyId = org.facultyId;
      }
      if (org.departmentId) {
        updateData.departmentId = org.departmentId;
      }
      if (org.academicLevelId) {
        updateData.academicLevelId = org.academicLevelId;
      }

      // Determine scope
      if (updateData.academicLevelId) {
        updateData.scope = 'LEVEL';
      } else if (updateData.departmentId) {
        updateData.scope = 'DEPARTMENT';
      } else if (updateData.facultyId) {
        updateData.scope = 'FACULTY';
      } else {
        updateData.scope = 'INSTITUTION';
      }

      await prisma.academicSession.update({
        where: { id: session.id },
        data: updateData,
      });

      updatedCount++;
      console.log(
        `Updated session: ${session.name} with scope: ${updateData.scope}`,
      );
    } else {
      // No organizations found, set as institution-level
      await prisma.academicSession.update({
        where: { id: session.id },
        data: {
          scope: 'INSTITUTION',
        },
      });
      console.log(
        `Set session ${session.name} as INSTITUTION scope (no org found)`,
      );
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} sessions.`);
}

backfillSessionHierarchy()
  .catch(console.error)
  .finally(() => prisma.$disconnect());