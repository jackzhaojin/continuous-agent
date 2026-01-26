/**
 * Main entry point for the Continuous Executive Agent
 *
 * This re-exports the executive loop from its new location in core/
 */

// The actual loop is in core/executive-loop.ts
// This file exists so PM2 can still run "dist/index.js"
import './core/executive-loop.js';
