import { PrismaClient as PrismaMongo } from '@dotabod/prisma/dist/mongo/index.js'
import { PrismaClient as PrismaPsql } from '@dotabod/prisma/dist/psql/index.js'

// allow global `var` declarations
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaPsql | undefined
  // eslint-disable-next-line no-var
  var prismaMongo: PrismaMongo | undefined
}

export const prisma = global.prisma ?? new PrismaPsql()
export const prismaMongo = global.prismaMongo ?? new PrismaMongo()

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
  global.prismaMongo = prismaMongo
}
