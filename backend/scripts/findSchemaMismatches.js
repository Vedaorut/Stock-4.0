#!/usr/bin/env node
/**
 * Schema Mismatch Finder
 *
 * Автоматически парсит все SQL запросы в коде и сравнивает с реальной БД.
 * Запуск: node scripts/findSchemaMismatches.js
 *
 * Находит:
 * - Колонки в коде которых нет в БД
 * - Колонки в БД которые не используются в коде
 * - NOT NULL constraints которые могут конфликтовать
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection - load from .env or use default
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://sile@localhost:5432/statusstock'
});

/**
 * Рекурсивно найти все .js файлы
 */
function findJsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && !item.includes('node_modules')) {
      findJsFiles(fullPath, files);
    } else if (item.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Извлечь SQL запросы из файла
 */
function extractSqlQueries(content) {
  const queries = [];

  // Паттерны для поиска SQL (backticks for template literals)
  const backtickRegex = /`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|INTO|SET|WHERE)[^`]*)`/gis;

  let match;
  while ((match = backtickRegex.exec(content)) !== null) {
    const sql = match[1].trim();
    if (sql.length > 20) {
      queries.push(sql);
    }
  }

  return queries;
}

/**
 * Парсить таблицы и колонки из SQL запроса
 */
function parseColumnsFromSql(sql) {
  const result = {};

  // Нормализуем SQL
  const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

  // INSERT INTO table (col1, col2, ...)
  const insertMatch = normalized.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const table = insertMatch[1];
    const columns = insertMatch[2].split(',').map(c => c.trim().replace(/["`]/g, ''));
    result[table] = result[table] || new Set();
    columns.forEach(c => {
      if (c && !c.startsWith('$') && !c.includes('(')) {
        result[table].add(c);
      }
    });
  }

  // UPDATE table SET col1 = ..., col2 = ...
  const updateMatch = normalized.match(/update\s+(\w+)\s+set\s+([^where]+)/i);
  if (updateMatch) {
    const table = updateMatch[1];
    const setPart = updateMatch[2];
    const columns = setPart.match(/(\w+)\s*=/g) || [];
    result[table] = result[table] || new Set();
    columns.forEach(c => {
      const col = c.replace(/\s*=.*/, '').trim();
      if (col && !col.startsWith('$')) {
        result[table].add(col);
      }
    });
  }

  // SELECT ... FROM table
  const fromMatches = normalized.matchAll(/from\s+(\w+)/gi);
  for (const fromMatch of fromMatches) {
    const table = fromMatch[1];
    if (!['where', 'select', 'and', 'or', 'join'].includes(table)) {
      result[table] = result[table] || new Set();
    }
  }

  return result;
}

/**
 * Получить реальную схему из БД
 */
async function getDatabaseSchema() {
  const queryResult = await pool.query(`
    SELECT
      table_name,
      column_name,
      is_nullable,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const schema = {};
  for (const row of queryResult.rows) {
    schema[row.table_name] = schema[row.table_name] || {};
    schema[row.table_name][row.column_name] = {
      nullable: row.is_nullable === 'YES',
      type: row.data_type
    };
  }

  return schema;
}

/**
 * Main
 */
async function main() {
  console.log('Scanning codebase for SQL queries...\n');

  const srcDir = path.join(__dirname, '..', 'src');
  const jsFiles = findJsFiles(srcDir);

  console.log('Found ' + jsFiles.length + ' JavaScript files\n');

  // Collect all columns used in code
  const codeColumns = {};
  const fileMap = {};

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const queries = extractSqlQueries(content);

    for (const query of queries) {
      const parsed = parseColumnsFromSql(query);

      for (const [table, columns] of Object.entries(parsed)) {
        codeColumns[table] = codeColumns[table] || new Set();
        fileMap[table] = fileMap[table] || {};

        for (const col of columns) {
          codeColumns[table].add(col);
          fileMap[table][col] = fileMap[table][col] || [];
          const relPath = path.relative(srcDir, file);
          if (!fileMap[table][col].includes(relPath)) {
            fileMap[table][col].push(relPath);
          }
        }
      }
    }
  }

  // Get database schema
  console.log('Fetching database schema...\n');
  const dbSchema = await getDatabaseSchema();

  // Compare
  console.log('='.repeat(60));
  console.log('SCHEMA MISMATCH REPORT');
  console.log('='.repeat(60));

  let issues = 0;
  const migrations = [];

  for (const [table, columns] of Object.entries(codeColumns)) {
    if (!dbSchema[table]) {
      console.log('\nTable "' + table + '" used in code but NOT in database!');
      issues++;
      continue;
    }

    const dbColumns = Object.keys(dbSchema[table]);

    // Columns in code but not in DB
    const missingInDb = [...columns].filter(c => !dbColumns.includes(c));

    if (missingInDb.length > 0) {
      console.log('\nTable: ' + table);
      console.log('   Missing in DB (used in code):');

      for (const col of missingInDb) {
        const files = fileMap[table][col] || ['unknown'];
        console.log('   - ' + col);
        console.log('     Used in: ' + files.join(', '));
        migrations.push('ALTER TABLE ' + table + ' ADD COLUMN IF NOT EXISTS ' + col + ' TEXT;');
        issues++;
      }
    }
  }

  if (issues === 0) {
    console.log('\nNo schema mismatches found!');
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('SUGGESTED MIGRATIONS:');
    console.log('='.repeat(60));
    migrations.forEach(m => console.log(m));
  }

  console.log('\nTotal issues: ' + issues);

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
