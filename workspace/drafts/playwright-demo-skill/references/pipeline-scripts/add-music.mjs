#!/usr/bin/env node
/**
 * Add Background Music — Mix royalty-free track under existing voice+video
 *
 * Takes the final voiced video (highlights-with-voice.mp4) and overlays
 * a background music track at ~15% volume (-18dB) so voice stays dominant.
 *
 * No API calls needed. Uses ffmpeg only.
 *
 * Usage:
 *   node demo/pipeline/add-music.mjs
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VIDEO_INPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-with-voice.mp4');
const MUSIC_INPUT = path.join(PROJECT_ROOT, 'demo/music/upbeat-corporate-technology-191949.mp3');
const VIDEO_OUTPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-voice-music-mixed-v1.mp4');

const MUSIC_VOLUME = 0.15; // ~15% volume (~-18dB), keeps music ambient under voice

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDuration(filePath) {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Add Background Music ===\n');

  // Validate inputs
  if (!fs.existsSync(VIDEO_INPUT)) {
    throw new Error(`Missing video: ${VIDEO_INPUT}`);
  }
  if (!fs.existsSync(MUSIC_INPUT)) {
    throw new Error(`Missing music: ${MUSIC_INPUT}`);
  }

  const videoDuration = getDuration(VIDEO_INPUT);
  const musicDuration = getDuration(MUSIC_INPUT);

  console.log(`Video: ${VIDEO_INPUT}`);
  console.log(`  Duration: ${videoDuration.toFixed(1)}s`);
  console.log(`Music: ${MUSIC_INPUT}`);
  console.log(`  Duration: ${musicDuration.toFixed(1)}s`);
  console.log(`  Volume: ${(MUSIC_VOLUME * 100).toFixed(0)}%`);
  console.log(`  Loop: ${musicDuration < videoDuration ? 'yes (track shorter than video)' : 'no (track longer than video)'}`);

  // Build ffmpeg command
  // -stream_loop -1: loop music indefinitely (trimmed by duration=first)
  // volume filter: reduce music to 15%
  // amix duration=first: cut music to match video length
  // -c:v copy: no video re-encode (fast, lossless)
  const cmd = [
    'ffmpeg -y',
    `-i "${VIDEO_INPUT}"`,
    `-stream_loop -1 -i "${MUSIC_INPUT}"`,
    `-filter_complex "[1:a]volume=${MUSIC_VOLUME}[music];[0:a][music]amix=inputs=2:duration=first[aout]"`,
    '-map 0:v -map "[aout]"',
    '-c:v copy -c:a aac -b:a 192k',
    `"${VIDEO_OUTPUT}"`,
  ].join(' \\\n  ');

  console.log(`\nOutput: ${VIDEO_OUTPUT}`);
  console.log('\n' + cmd + '\n');

  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT });

  const stats = fs.statSync(VIDEO_OUTPUT);
  const outputDuration = getDuration(VIDEO_OUTPUT);
  console.log(`\nDone! ${VIDEO_OUTPUT}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duration: ${outputDuration.toFixed(1)}s`);
}

main();
