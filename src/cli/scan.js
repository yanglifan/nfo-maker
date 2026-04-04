#!/usr/bin/env node

/**
 * CLI script for batch scanning media library and generating NFO files.
 * Designed to be called from crontab or run manually.
 *
 * Usage:
 *   node src/cli/scan.js --dir "/path/to/media"
 *   node src/cli/scan.js --dir "/path/movies" --dir "/path/tvshows"
 *   node src/cli/scan.js --dir "/path/to/media" --interval 5 --limit 10
 *   node src/cli/scan.js --dir "/path/to/media" --dry-run
 */

const { scanDirectory } = require('../services/batchScanner');

function printUsage() {
  console.log(`
NFO Maker - Batch Scanner
=========================

Usage:
  node src/cli/scan.js --dir <directory> [options]

Options:
  --dir <path>        Media directory to scan (can be specified multiple times)
  --interval <sec>    Seconds between requests (default: 3)
  --limit <num>       Maximum number of files to process (default: unlimited)
  --dry-run           Show what would be done without actually doing it
  --help              Show this help message

Examples:
  # Scan single directory
  node src/cli/scan.js --dir "/path/to/media"

  # Scan multiple directories
  node src/cli/scan.js --dir "/path/movies" --dir "/path/tvshows"

  # Set 5 second interval between requests
  node src/cli/scan.js --dir "/path/to/media" --interval 5

  # Dry run to see what would be processed
  node src/cli/scan.js --dir "/path/to/media" --dry-run

  # Process only first 10 files
  node src/cli/scan.js --dir "/path/to/media" --limit 10

Crontab Example (daily at 2 AM):
  0 2 * * * cd /path/to/nfo-maker && node src/cli/scan.js --dir "/path/to/media" --interval 5 >> /var/log/nfo-scan.log 2>&1
`);
}

function parseArgs(args) {
  const options = {
    dirs: [],
    interval: 3,
    limit: Infinity,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dir':
        options.dirs.push(args[++i]);
        break;
      case '--interval':
        options.interval = parseInt(args[++i], 10) || 3;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10) || Infinity;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.dirs.length === 0) {
    console.error('Error: At least one --dir is required');
    printUsage();
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('*** DRY RUN MODE - No files will be modified ***\n');
  }

  const overallStats = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0
  };

  for (const dir of options.dirs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Scanning: ${dir}`);
    console.log('='.repeat(60));

    try {
      const stats = await scanDirectory(dir, {
        dryRun: options.dryRun,
        requestInterval: options.interval,
        limit: options.limit
      });

      overallStats.total += stats.total;
      overallStats.processed += stats.processed;
      overallStats.success += stats.success;
      overallStats.failed += stats.failed;
    } catch (err) {
      console.error(`Error scanning ${dir}: ${err.message}`);
    }
  }

  if (options.dirs.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('Overall Summary');
    console.log('='.repeat(60));
    console.log(`Total: ${overallStats.total}`);
    console.log(`Processed: ${overallStats.processed}`);
    console.log(`Success: ${overallStats.success}`);
    console.log(`Failed: ${overallStats.failed}`);
    console.log('='.repeat(60));
  }

  // Exit with error code if any failures
  if (overallStats.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
