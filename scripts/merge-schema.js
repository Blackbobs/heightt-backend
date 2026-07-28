const fs = require('fs');
const path = require('path');

const domainsDir = path.join(__dirname, '../prisma/domains');
const outputFile = path.join(__dirname, '../prisma/schema.prisma');

// Header for schema.prisma
let merged = `// ============================================
// MAIN PRISMA SCHEMA
// Generated from domain files
// ============================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;

// Read all domain files in order
const domainFiles = fs.readdirSync(domainsDir).sort();

for (const file of domainFiles) {
  if (file.endsWith('.prisma')) {
    const content = fs.readFileSync(path.join(domainsDir, file), 'utf8');
    merged += `\n// ============================================\n`;
    merged += `// FROM: ${file}\n`;
    merged += `// ============================================\n\n`;
    merged += content + '\n\n';
  }
}

// Write the merged file
fs.writeFileSync(outputFile, merged);
console.log('✅ Schema merged successfully!');