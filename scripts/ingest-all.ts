#!/usr/bin/env tsx
/**
 * Master Ingestion Script
 * Runs all ingestion scripts in the correct order
 */

import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const scripts = [
  { name: 'Counties', script: 'ingest-counties.ts', critical: true },
  { name: 'Metroplexes', script: 'ingest-metroplexes.ts', critical: true },
  { name: 'Sales Tax', script: 'ingest-sales-tax.ts', critical: false },
  { name: 'Enrichments', script: 'ingest-enrichments.ts', critical: false },
  { name: 'Beverage Receipts', script: 'ingest-beverage-receipts.ts', critical: true },
];

async function runScript(scriptName: string, scriptPath: string, critical: boolean): Promise<boolean> {
  console.log(chalk.blue(`\n${'='.repeat(60)}`));
  console.log(chalk.blue(`📦 Running ${scriptName} ingestion...`));
  console.log(chalk.blue(`${'='.repeat(60)}\n`));

  try {
    const { stdout, stderr } = await execAsync(`tsx scripts/${scriptPath}`);
    
    if (stdout) {
      console.log(stdout);
    }
    
    if (stderr && !stderr.includes('warning')) {
      console.error(chalk.yellow(stderr));
    }

    console.log(chalk.green(`\n✓ ${scriptName} ingestion completed successfully\n`));
    return true;
  } catch (error: any) {
    console.error(chalk.red(`\n✗ ${scriptName} ingestion failed: ${error.message}\n`));
    
    if (critical) {
      console.error(chalk.red(`\n⚠️  ${scriptName} is a critical script. Stopping ingestion process.\n`));
      return false;
    } else {
      console.warn(chalk.yellow(`⚠️  ${scriptName} is non-critical. Continuing with next script...\n`));
      return true; // Continue even if non-critical fails
    }
  }
}

async function ingestAll() {
  console.log(chalk.blue.bold('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║     THIRST METRICS TEXAS - MASTER INGESTION SCRIPT         ║'));
  console.log(chalk.blue.bold('╚═══════════════════════════════════════════════════════════╝\n'));

  const startTime = Date.now();
  const results: { name: string; success: boolean }[] = [];

  for (const { name, script, critical } of scripts) {
    const success = await runScript(name, script, critical);
    results.push({ name, success });

    if (!success && critical) {
      console.error(chalk.red.bold('\n❌ INGESTION FAILED'));
      console.error(chalk.red(`Critical script "${name}" failed. Process stopped.\n`));
      process.exit(1);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(0);
  const minutes = Math.floor(parseInt(duration) / 60);
  const seconds = parseInt(duration) % 60;

  // Final summary
  console.log(chalk.blue.bold('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.blue.bold('║                    INGESTION SUMMARY                       ║'));
  console.log(chalk.blue.bold('╚═══════════════════════════════════════════════════════════╝\n'));

  results.forEach(({ name, success }) => {
    if (success) {
      console.log(chalk.green(`  ✓ ${name}`));
    } else {
      console.log(chalk.yellow(`  ⚠ ${name} (failed - non-critical)`));
    }
  });

  console.log(chalk.cyan(`\n  Duration: ${minutes}m ${seconds}s\n`));
  console.log(chalk.green.bold('✅ ALL INGESTIONS COMPLETE\n'));
}

// Run all ingestions
ingestAll().catch(error => {
  console.error(chalk.red(`\nFatal error: ${error}`));
  process.exit(1);
});
