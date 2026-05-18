import { readFileSync } from 'node:fs';
import { validateGraphAndPack } from '../packages/core/src/validate.ts';
import type { ValidationIssue } from '../packages/core/src/validate.ts';

const [graphPath, packPath] = process.argv.slice(2);

if (!graphPath || !packPath) {
  console.error('Usage: tsx scripts/validate-pack.ts <graph.json> <pack.json>');
  process.exit(1);
}

let graphText: string;
let packText: string;

try {
  graphText = readFileSync(graphPath, 'utf-8');
} catch (e) {
  console.error(`Cannot read graph file "${graphPath}": ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

try {
  packText = readFileSync(packPath, 'utf-8');
} catch (e) {
  console.error(`Cannot read pack file "${packPath}": ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const result = validateGraphAndPack(graphText, packText);

function label(issue: ValidationIssue): string {
  return `${issue.severity.toUpperCase().padEnd(7)} ${issue.scope.padEnd(5)} ${issue.path}: ${issue.message}`;
}

const errors = result.issues.filter(i => i.severity === 'error');
const warnings = result.issues.filter(i => i.severity === 'warning');

if (errors.length > 0) {
  console.log('Errors:');
  for (const issue of errors) console.log('  ' + label(issue));
}
if (warnings.length > 0) {
  console.log('Warnings:');
  for (const issue of warnings) console.log('  ' + label(issue));
}

console.log(`\n${errors.length} error${errors.length !== 1 ? 's' : ''}, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`);

process.exit(result.valid ? 0 : 1);
