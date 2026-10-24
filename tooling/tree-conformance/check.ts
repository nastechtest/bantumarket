#!/usr/bin/env bun
/**
 * Structural gate entry point. See `README.md` for the eight rules.
 *
 * Run: bun tooling/tree-conformance/check.ts [--root DIR] [--self-test] [--verbose] [--json]
 */

import { runCli } from './src/cli.js';

process.exit(runCli(process.argv.slice(2), import.meta.dir));
