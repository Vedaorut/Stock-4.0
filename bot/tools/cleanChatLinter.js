#!/usr/bin/env node

/**
 * Clean Chat Static Analyzer
 *
 * Сканирует код бота и находит нарушения clean chat правил:
 * - ctx.reply() без cleanup
 * - text handlers без deleteMessage
 * - сообщения без tracking
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Цвета для вывода
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Счетчики
let totalViolations = 0;
let fileCount = 0;
const violations = [];

// Паттерны для поиска
const patterns = {
  // ctx.reply() вызовы
  ctxReply: /ctx\.reply\s*\(/g,
  ctxReplyWithHTML: /ctx\.replyWithHTML\s*\(/g,
  ctxReplyWithMarkdown: /ctx\.replyWithMarkdown\s*\(/g,

  // Удаление сообщений
  deleteMessage: /ctx\.deleteMessage\s*\(/g,
  smartMessageSend: /smartMessage\.send\s*\(/g,

  // Text handlers
  botOnText: /bot\.on\s*\(\s*['"`]text['"`]/g,
  botHears: /bot\.hears\s*\(/g,

  // Session tracking
  sessionLastAIPair: /ctx\.session\.lastAIPair/g,
  sessionMessageTracker: /messageTracker/g
};

/**
 * Рекурсивно сканирует директорию и возвращает все .js файлы
 */
function getAllJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Пропускаем node_modules и тесты
      if (file !== 'node_modules' && file !== 'tests' && file !== 'coverage') {
        getAllJsFiles(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Анализирует файл на нарушения clean chat
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(path.join(__dirname, '..'), filePath);

  const fileViolations = [];

  // Находим все ctx.reply() вызовы
  let replyMatches = [];
  let match;

  // ctx.reply()
  while ((match = patterns.ctxReply.exec(content)) !== null) {
    replyMatches.push({ index: match.index, type: 'ctx.reply()' });
  }

  // ctx.replyWithHTML()
  patterns.ctxReplyWithHTML.lastIndex = 0;
  while ((match = patterns.ctxReplyWithHTML.exec(content)) !== null) {
    replyMatches.push({ index: match.index, type: 'ctx.replyWithHTML()' });
  }

  // ctx.replyWithMarkdown()
  patterns.ctxReplyWithMarkdown.lastIndex = 0;
  while ((match = patterns.ctxReplyWithMarkdown.exec(content)) !== null) {
    replyMatches.push({ index: match.index, type: 'ctx.replyWithMarkdown()' });
  }

  // Для каждого reply проверяем есть ли nearby cleanup
  replyMatches.forEach(replyMatch => {
    const lineNum = content.substring(0, replyMatch.index).split('\n').length;
    const contextStart = Math.max(0, replyMatch.index - 500); // 500 chars before
    const contextEnd = Math.min(content.length, replyMatch.index + 500); // 500 chars after
    const contextCode = content.substring(contextStart, contextEnd);

    // Проверяем есть ли cleanup в контексте
    const hasDeleteMessage = /deleteMessage/.test(contextCode);
    const hasSmartMessage = /smartMessage\.send/.test(contextCode);
    const hasMessageTracking = /lastAIPair|messageTracker/.test(contextCode);

    if (!hasDeleteMessage && !hasSmartMessage && !hasMessageTracking) {
      fileViolations.push({
        file: relativePath,
        line: lineNum,
        type: replyMatch.type,
        severity: 'HIGH',
        message: `${replyMatch.type} без cleanup (нет deleteMessage, smartMessage или tracking)`
      });
    }
  });

  // Проверяем text handlers
  patterns.botOnText.lastIndex = 0;
  while ((match = patterns.botOnText.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(content.length, match.index + 1000);
    const contextCode = content.substring(contextStart, contextEnd);

    const hasDeleteMessage = /deleteMessage/.test(contextCode);

    if (!hasDeleteMessage) {
      fileViolations.push({
        file: relativePath,
        line: lineNum,
        type: "bot.on('text')",
        severity: 'MEDIUM',
        message: "Text handler без deleteMessage - user сообщения будут накапливаться"
      });
    }
  }

  return fileViolations;
}

/**
 * Выводит результаты анализа
 */
function printResults() {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════`);
  console.log(`  CLEAN CHAT STATIC ANALYSIS REPORT`);
  console.log(`═══════════════════════════════════════════════════════════${colors.reset}\n`);

  if (violations.length === 0) {
    console.log(`${colors.green}${colors.bold}✅ No violations found! Clean chat compliance 100%${colors.reset}\n`);
    return;
  }

  // Группируем по severity
  const critical = violations.filter(v => v.severity === 'CRITICAL');
  const high = violations.filter(v => v.severity === 'HIGH');
  const medium = violations.filter(v => v.severity === 'MEDIUM');

  // Выводим по группам
  if (critical.length > 0) {
    console.log(`${colors.red}${colors.bold}🚨 CRITICAL (${critical.length})${colors.reset}`);
    critical.forEach(v => {
      console.log(`  ${colors.red}❌${colors.reset} ${v.file}:${v.line}`);
      console.log(`     ${v.message}`);
      console.log();
    });
  }

  if (high.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  HIGH (${high.length})${colors.reset}`);
    high.forEach(v => {
      console.log(`  ${colors.yellow}⚠️${colors.reset}  ${v.file}:${v.line}`);
      console.log(`     ${v.message}`);
      console.log();
    });
  }

  if (medium.length > 0) {
    console.log(`${colors.blue}${colors.bold}ℹ️  MEDIUM (${medium.length})${colors.reset}`);
    medium.forEach(v => {
      console.log(`  ${colors.blue}ℹ️${colors.reset}  ${v.file}:${v.line}`);
      console.log(`     ${v.message}`);
      console.log();
    });
  }

  // Итоги
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}Total violations: ${colors.red}${violations.length}${colors.reset}`);
  console.log(`${colors.bold}Files scanned: ${fileCount}${colors.reset}`);
  console.log(`${colors.bold}Compliance rate: ${getComplianceRate()}%${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Вычисляет процент соответствия
 */
function getComplianceRate() {
  if (fileCount === 0) return 100;
  const violationRate = (violations.length / fileCount) * 10; // Грубая оценка
  return Math.max(0, Math.round(100 - violationRate));
}

/**
 * Main
 */
function main() {
  console.log(`${colors.cyan}${colors.bold}\nStarting Clean Chat Static Analysis...${colors.reset}\n`);

  const srcDir = path.join(__dirname, '..', 'src');
  const files = getAllJsFiles(srcDir);

  fileCount = files.length;
  console.log(`Scanning ${fileCount} files...\n`);

  files.forEach(file => {
    const fileViolations = analyzeFile(file);
    violations.push(...fileViolations);
  });

  printResults();

  // Exit code
  process.exit(violations.length > 0 ? 1 : 0);
}

main();
