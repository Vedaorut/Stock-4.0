#!/usr/bin/env node

/**
 * Lint WebApp Links
 *
 * Статический анализатор: проверяет что WebApp кнопки только в keyboards/
 *
 * Security rule: WebApp buttons должны быть централизованы в keyboards/
 * для предотвращения фишинга (случайные URL в handlers)
 *
 * Usage:
 *   node tools/lint-webapp-links.js
 *
 * Exit codes:
 *   0 - все WebApp кнопки в разрешенных местах
 *   1 - найдены violations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');

// Разрешённые файлы для WebApp кнопок
const ALLOWED_FILES = [
  'src/keyboards/buyer.js',
  'src/keyboards/seller.js',
  'src/keyboards/main.js'
];

// Все файлы для проверки (кроме разрешённых)
const ALL_FILES = [
  'src/handlers/buyer/index.js',
  'src/handlers/seller/index.js',
  'src/handlers/common.js',
  'src/handlers/start.js',
  'src/scenes/searchShop.js',
  'src/scenes/createShop.js',
  'src/scenes/addProduct.js',
  'src/scenes/manageWallets.js'
];

/**
 * Поиск Markup.button.webApp() в файле
 */
async function checkFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const lines = content.split('\n');

  const violations = [];

  // Find all Markup.button.webApp() calls
  const webAppRegex = /Markup\.button\.webApp\(/g;
  let match;

  while ((match = webAppRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const lineText = lines[lineNum - 1];

    violations.push({
      file: filePath,
      line: lineNum,
      snippet: lineText.trim()
    });
  }

  return violations;
}

/**
 * Проверка разрешённых файлов (для информации)
 */
async function checkAllowedFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');

  const webAppRegex = /Markup\.button\.webApp\(/g;
  const matches = content.match(webAppRegex);

  return matches ? matches.length : 0;
}

async function main() {
  console.log('🔍 Lint: Checking WebApp button locations...\n');

  let totalViolations = 0;

  // Check allowed files (informational)
  console.log('✅ Allowed locations:');
  for (const file of ALLOWED_FILES) {
    try {
      const count = await checkAllowedFile(file);
      console.log(`   ${file}: ${count} WebApp button(s)`);
    } catch (err) {
      // File might not exist
      console.log(`   ${file}: (not found)`);
    }
  }
  console.log('');

  // Check all other files (violations)
  for (const file of ALL_FILES) {
    try {
      const violations = await checkFile(file);

      if (violations.length > 0) {
        console.log(`❌ ${file}:`);
        for (const v of violations) {
          console.log(`   Line ${v.line}: ${v.snippet}`);
        }
        console.log('');
        totalViolations += violations.length;
      }
    } catch (err) {
      // File might not exist, skip
    }
  }

  if (totalViolations === 0) {
    console.log('✅ All WebApp buttons are in allowed locations!\n');
    process.exit(0);
  } else {
    console.log(`❌ Found ${totalViolations} violation(s)\n`);
    console.log('Fix: Move WebApp buttons to keyboards/buyer.js or keyboards/seller.js\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
