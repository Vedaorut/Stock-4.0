#!/usr/bin/env node

/**
 * Lint Callbacks Acknowledgement
 *
 * Статический анализатор: проверяет что все bot.action() имеют answerCbQuery()
 *
 * Usage:
 *   node tools/lint-callbacks-ack.js
 *
 * Exit codes:
 *   0 - все action handlers имеют answerCbQuery
 *   1 - найдены violations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');

// Файлы для проверки
const FILES_TO_CHECK = [
  'src/handlers/buyer/index.js',
  'src/handlers/seller/index.js',
  'src/handlers/common.js',
  'src/scenes/searchShop.js',
  'src/scenes/createShop.js',
  'src/scenes/addProduct.js',
  'src/scenes/manageWallets.js'
];

/**
 * Простой regex-based поиск bot.action() и answerCbQuery
 * (для более сложного анализа нужен AST parser)
 */
async function checkFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const lines = content.split('\n');

  const violations = [];

  let match;
  const actionMatches = [];

  // Collect bot.action() occurrences
  const botActionRegex = /bot\.action\([^,]+,\s*([a-zA-Z_][a-zA-Z0-9_]*)\)/g;
  while ((match = botActionRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const handlerName = match[1]; // Extract handler function name
    actionMatches.push({ line: lineNum, index: match.index, handlerName });
  }

  // Collect scene.action() occurrences (inline async functions)
  const sceneActionRegex = /\.action\([^,]+,\s*async\s*\(/g;
  while ((match = sceneActionRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    actionMatches.push({ line: lineNum, index: match.index, handlerName: null });
  }

  // For each action, check if answerCbQuery exists
  for (const { line, index, handlerName } of actionMatches) {
    let hasAnswerCbQuery = false;

    if (handlerName) {
      // Case 1: bot.action('pattern', handlerName)
      // Search for function definition in entire file
      const functionRegex = new RegExp(
        `(?:export\\s+)?(?:const|function)\\s+${handlerName}\\s*=?\\s*(?:async\\s*)?\\([^)]*\\)\\s*(?:=>\\s*)?\\{([\\s\\S]*?)\\n\\}`,
        'g'
      );
      const funcMatch = functionRegex.exec(content);

      if (funcMatch && funcMatch[1]) {
        hasAnswerCbQuery = /answerCbQuery/.test(funcMatch[1]);
      } else {
        // Fallback: check next 100 lines from bot.action() call
        const startLine = line - 1;
        const endLine = Math.min(startLine + 100, lines.length);
        const contextLines = lines.slice(startLine, endLine);
        const contextText = contextLines.join('\n');
        hasAnswerCbQuery = /answerCbQuery/.test(contextText);
      }
    } else {
      // Case 2: scene.action('pattern', async (ctx) => {...})
      // Inline function - check next 50 lines
      const startLine = line - 1;
      const endLine = Math.min(startLine + 50, lines.length);
      const handlerLines = lines.slice(startLine, endLine);
      const handlerText = handlerLines.join('\n');
      hasAnswerCbQuery = /answerCbQuery/.test(handlerText);
    }

    if (!hasAnswerCbQuery) {
      // Extract action pattern
      const lineText = lines[line - 1];
      const actionPattern = lineText.match(/action\(['"](.*?)['"]|action\((\/.*?\/)/);
      const pattern = actionPattern ? actionPattern[1] || actionPattern[2] : 'unknown';

      violations.push({
        file: filePath,
        line,
        pattern,
        handlerName: handlerName || 'inline',
        snippet: lineText.trim()
      });
    }
  }

  return violations;
}

async function main() {
  console.log('🔍 Lint: Checking bot.action() handlers for answerCbQuery...\n');

  let totalViolations = 0;

  for (const file of FILES_TO_CHECK) {
    const violations = await checkFile(file);

    if (violations.length > 0) {
      console.log(`❌ ${file}:`);
      for (const v of violations) {
        console.log(`   Line ${v.line}: ${v.pattern}`);
        console.log(`   → Missing answerCbQuery: ${v.snippet}`);
      }
      console.log('');
      totalViolations += violations.length;
    }
  }

  if (totalViolations === 0) {
    console.log('✅ All action handlers have answerCbQuery!\n');
    process.exit(0);
  } else {
    console.log(`❌ Found ${totalViolations} violation(s)\n`);
    console.log('Fix: Add await ctx.answerCbQuery() at the start of each action handler\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
