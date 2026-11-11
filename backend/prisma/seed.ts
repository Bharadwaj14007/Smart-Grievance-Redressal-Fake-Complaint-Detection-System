import argon2 from 'argon2'
import { Priority, Role } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../src/config/prisma.js'

const seedConfig = z.object({
  SEED_ADMIN_EMAIL: z.string().email().transform((email) => email.toLowerCase()),
  SEED_ADMIN_PASSWORD: z.string().min(12).max(128),
}).parse(process.env)

const department = await prisma.department.upsert({
  where: { code: 'GEN' },
  create: { name: 'General Administration', code: 'GEN', description: 'Default routing department.' },
  update: {},
})
await prisma.complaintCategory.upsert({
  where: { name: 'General Grievance' },
  create: { name: 'General Grievance', departmentId: department.id },
  update: { departmentId: department.id },
})
for (const [priority, hours] of [
  [Priority.CRITICAL, 12],
  [Priority.HIGH, 24],
  [Priority.MEDIUM, 72],
  [Priority.LOW, 120],
] as const) {
  const existing = await prisma.sLAConfiguration.findFirst({ where: { categoryId: null, priority } })
  if (!existing) {
    await prisma.sLAConfiguration.create({
      data: { categoryId: null, priority, responseHours: hours, resolutionHours: hours, active: true },
    })
  }
}
const passwordHash = await argon2.hash(seedConfig.SEED_ADMIN_PASSWORD, { type: argon2.argon2id })
await prisma.user.upsert({
  where: { email: seedConfig.SEED_ADMIN_EMAIL },
  create: {
    email: seedConfig.SEED_ADMIN_EMAIL,
    passwordHash,
    role: Role.ADMIN,
  },
  update: { passwordHash, role: Role.ADMIN, status: 'ACTIVE' },
})
console.info(`Seeded baseline records and administrator ${seedConfig.SEED_ADMIN_EMAIL}.`)
await prisma.$disconnect()
