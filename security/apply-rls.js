// security/apply-rls.js
// Automation script to apply Supabase Row-Level Security (RLS) policies and constraints from rls.sql

const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

function splitSql(sql) {
  // 1. Remove block comments /* */
  let cleanSql = sql.replace(/\/\*[\s\S]*?\*\//g, '')
  
  // Remove line comments -- line-by-line
  cleanSql = cleanSql
    .split('\n')
    .map(line => {
      const index = line.indexOf('--')
      if (index !== -1) {
        return line.substring(0, index)
      }
      return line
    })
    .join('\n')

  // 2. Split by semicolon, respecting $$ blocks and single quotes
  const statements = []
  let currentStmt = ''
  let inDollarQuote = false
  let inSingleQuote = false
  
  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i]
    const nextChar = cleanSql[i + 1]
    
    // Check for $$
    if (char === '$' && nextChar === '$') {
      inDollarQuote = !inDollarQuote
      currentStmt += '$$'
      i++ // Skip next char
      continue
    }
    
    // Check for single quote
    if (char === "'" && !inDollarQuote) {
      inSingleQuote = !inSingleQuote
    }
    
    // Check for semicolon
    if (char === ';' && !inDollarQuote && !inSingleQuote) {
      const trimmed = currentStmt.trim()
      if (trimmed.length > 0) {
        statements.push(trimmed)
      }
      currentStmt = ''
    } else {
      currentStmt += char
    }
  }
  
  const trimmed = currentStmt.trim()
  if (trimmed.length > 0) {
    statements.push(trimmed)
  }
  
  return statements
}

async function main() {
  const sqlPath = path.join(__dirname, '../prisma/rls.sql')
  console.log('Reading RLS SQL from:', sqlPath)
  
  if (!fs.existsSync(sqlPath)) {
    console.error('Error: prisma/rls.sql file not found.')
    process.exit(1)
  }
  
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const statements = splitSql(sql)
  
  console.log(`Extracted ${statements.length} SQL statements. Executing on Supabase...`)
  
  let successCount = 0
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    try {
      await prisma.$executeRawUnsafe(stmt)
      successCount++
    } catch (err) {
      console.warn(`⚠️ Warning executing statement ${i + 1}: ${err.message}`)
      console.log('Statement was:', stmt)
    }
  }
  
  console.log(`✅ Applied ${successCount}/${statements.length} SQL RLS configurations successfully!`)
}

main()
  .catch((err) => {
    console.error('❌ Critical error during RLS execution:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
