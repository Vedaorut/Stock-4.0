/**
 * BUGHUNT: Session __scenes Guard
 *
 * This test prevents reintroduction of P0 bug:
 * - delete ctx.session.__scenes breaks scene transitions
 * - Causes race condition when leave() followed by enter()
 *
 * Proper pattern: ctx.scene.leave() handles __scenes automatically
 */

import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const BOT_SRC = path.resolve(import.meta.dirname, '../../src');

// Recursively get all .js files
function getAllJsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules')) {
      getAllJsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Check file for pattern, excluding comments with specific keywords
function findViolations(filePath, pattern, excludeKeywords = ['REMOVED', 'FIX:', '//']) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    if (line.includes(pattern)) {
      // Skip if line contains exclusion keywords (comments about the fix)
      const hasExclusion = excludeKeywords.some((kw) => line.includes(kw));
      // Skip if line is a comment
      const isComment = line.trim().startsWith('//') || line.trim().startsWith('*');
      if (!hasExclusion && !isComment) {
        violations.push({
          file: filePath,
          line: index + 1,
          content: line.trim(),
        });
      }
    }
  });

  return violations;
}

// Check for exact pattern (deleting entire object, not properties)
function findExactViolations(filePath, pattern) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  // Pattern for deleting entire wizard.state (not properties like .refreshTimer)
  const regex = new RegExp(pattern.replace(/\./g, '\\.') + '\\s*[;$]');

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    // Skip lines with fix comments
    if (line.includes('REMOVED') || line.includes('FIX:')) return;

    if (regex.test(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        content: trimmed,
      });
    }
  });

  return violations;
}

describe('BUGHUNT: Session __scenes Guard', () => {
  const jsFiles = getAllJsFiles(BOT_SRC);

  it('should NOT have "delete ctx.session.__scenes" in any source file', () => {
    const allViolations = [];

    for (const file of jsFiles) {
      const violations = findViolations(file, 'delete ctx.session.__scenes');
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      console.error('\n❌ P0 VIOLATION: Found delete ctx.session.__scenes:');
      allViolations.forEach((v) =>
        console.error(`   ${v.file}:${v.line}: ${v.content}`)
      );
      console.error('\n   FIX: Use ctx.scene.leave() instead. Do not manually delete __scenes.');
    }

    expect(allViolations).toHaveLength(0);
  });

  it('should NOT have "delete ctx.wizard.state" (entire object, not properties)', () => {
    const allViolations = [];

    for (const file of jsFiles) {
      // Only flag "delete ctx.wizard.state;" (entire object)
      // NOT "delete ctx.wizard.state.someProperty;" (specific property - OK)
      const violations = findExactViolations(file, 'delete ctx.wizard.state');
      allViolations.push(...violations);
    }

    if (allViolations.length > 0) {
      console.error('\n❌ P0 VIOLATION: Found delete ctx.wizard.state:');
      allViolations.forEach((v) =>
        console.error(`   ${v.file}:${v.line}: ${v.content}`)
      );
      console.error('\n   FIX: Use ctx.wizard.state = {} instead of delete.');
      console.error('   NOTE: Deleting specific properties like ctx.wizard.state.timer is OK.');
    }

    expect(allViolations).toHaveLength(0);
  });

  it('should use assignment pattern in scene leave handlers', () => {
    const scenesDir = path.join(BOT_SRC, 'scenes');
    const sceneFiles = getAllJsFiles(scenesDir);
    let safePatternCount = 0;

    for (const file of sceneFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('ctx.wizard.state = {}')) {
        safePatternCount++;
      }
    }

    // We should have at least several scenes with safe cleanup
    expect(safePatternCount).toBeGreaterThan(5);
  });

  it('should have P0 FIX comments in scene leave handlers', () => {
    const scenesDir = path.join(BOT_SRC, 'scenes');
    const sceneFiles = getAllJsFiles(scenesDir);
    let fixCommentCount = 0;

    for (const file of sceneFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('P0 FIX:') || content.includes('P0 FIX REMOVED')) {
        fixCommentCount++;
      }
    }

    // Most scenes should have the fix documented
    expect(fixCommentCount).toBeGreaterThan(5);
  });
});
