const { PrismaMariaDB } = require('./lib/prisma-adapter')
require('dotenv/config')

async function main() {
  const url = process.env.DATABASE_URL
  console.log('Database URL:', url ? url.substring(0, 30) + '...' : 'NOT SET')

  if (!url) {
    console.log('ERROR: DATABASE_URL not set')
    process.exit(1)
  }

  try {
    const adapter = new PrismaMariaDB({ url })
    const db = await adapter.connect()
    console.log('Connected to database successfully!')

    const result = await db.queryRaw({
      sql: 'SELECT 1 as test',
      args: [],
      argTypes: [],
    })
    console.log('Query result:', JSON.stringify(result))

    await db.dispose()
    console.log('Disposed successfully!')
    process.exit(0)
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
}

main()