#!/usr/bin/env node
import { main } from '../src/cli.js';

// A reader such as `head` may close the pipe before everything is written.
// That is not a failure of this command, so leave quietly instead of
// letting the unhandled stream error print a stack trace.
process.stdout.on('error', (error) => {
  if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EPIPE') process.exit(0);
  throw error;
});

process.exitCode = await main(process.argv.slice(2));
