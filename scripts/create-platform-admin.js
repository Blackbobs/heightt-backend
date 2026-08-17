require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createPlatformAdmin() {
  const email = 'ayodejiayodele350@gmail.com';

  try {
    console.log(`🔍 Looking for user with email: ${email}`);

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      console.log(
        '📝 Please register the user first or check the email address.',
      );
      process.exit(1);
    }

    console.log(`✅ User found: ${user.id} (${user.email})`);

    // Check if already an admin
    const existingAdmin = await prisma.admin.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
    });

    if (existingAdmin) {
      console.log(`⚠️ User is already an admin: ${existingAdmin.adminType}`);
      console.log(existingAdmin);
      process.exit(0);
    }

    // Create platform admin
    const admin = await prisma.admin.create({
      data: {
        userId: user.id,
        adminType: 'PLATFORM_ADMIN',
        status: 'ACTIVE',
        assignedAt: new Date(),
        // If your schema requires these fields, uncomment and set them
        // institutionId: null,
        // facultyId: null,
        // departmentId: null,
        // organizationId: null,
      },
    });

    console.log('✅ Platform Admin created successfully!');
    console.log(admin);

    // Also create some default permissions if needed
    console.log('📋 Admin details:');
    console.log(`- ID: ${admin.id}`);
    console.log(`- User ID: ${admin.userId}`);
    console.log(`- Type: ${admin.adminType}`);
    console.log(`- Status: ${admin.status}`);
  } catch (error) {
    console.error('❌ Error creating platform admin:');
    console.error(error);
    console.error('\n📋 Error details:');
    console.error(`- Code: ${error.code}`);
    console.error(`- Message: ${error.message}`);
    console.error(`- Meta:`, error.meta);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createPlatformAdmin();
