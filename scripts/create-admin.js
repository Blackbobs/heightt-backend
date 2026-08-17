require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'ayodejiayodele350@gmail.com';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found:', email);
    process.exit(1);
  }

  const admin = await prisma.admin.create({
    data: {
      userId: user.id,
      adminType: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Created admin:', admin);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());