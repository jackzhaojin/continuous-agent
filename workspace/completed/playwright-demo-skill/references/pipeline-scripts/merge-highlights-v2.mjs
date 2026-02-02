#!/usr/bin/env node
/**
 * Merge Highlights V2 — Freeze-Frame Approach
 *
 * Uses existing audio clips (no ElevenLabs calls). Inserts freeze frames
 * into the video wherever narration needs more time, so the video pauses
 * for the voice — never the other way around.
 *
 * Rules:
 *   - Audio clips NEVER overlap
 *   - Audio starts 500ms before its visual caption
 *   - Minimum 300ms silence gap between clips
 *   - If a clip would overlap the next, freeze the video to make room
 *
 * Usage:
 *   node demo/pipeline/merge-highlights-v2.mjs
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

const AUDIO_DIR = path.join(PROJECT_ROOT, 'demo/audio/highlights');
const VIDEO_INPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-captioned.webm');
const VIDEO_OUTPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-with-voice.mp4');

const AUDIO_SHIFT = -0.5; // Voice starts 500ms before visual caption
const MIN_GAP = 0.3;      // 300ms minimum silence between clips
const FPS = 25;            // Video framerate

// Original video timestamps for each caption (seconds into the source webm)
const CAPTIONS = [
  { id: 1,  startSec: 1.4  },
  { id: 2,  startSec: 5.5  },
  { id: 3,  startSec: 9.7  },
  { id: 4,  startSec: 12.8 },
  { id: 5,  startSec: 17.0 },
  { id: 6,  startSec: 21.5 },
  { id: 7,  startSec: 24.5 },
  { id: 8,  startSec: 27.0 },
  { id: 9,  startSec: 30.5 },
  { id: 10, startSec: 34.0 },
  { id: 11, startSec: 38.5 },
  { id: 12, startSec: 41.5 },
  { id: 13, startSec: 47.0 },
  { id: 14, startSec: 50.0 },
  { id: 15, startSec: 53.5 },
  { id: 16, startSec: 59.0 },
  { id: 17, startSec: 67.5 },
  { id: 18, startSec: 71.5 },
  { id: 19, startSec: 75.0 },
  { id: 20, startSec: 77.5 },
  { id: 21, startSec: 79.5 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) { return String(n).padStart(2, '0'); }

function audioPath(id) {
  return path.join(AUDIO_DIR, `caption_${pad(id)}.mp3`);
}

function getAudioDuration(filePath) {
  return parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' },
    ).trim(),
  );
}

// ---------------------------------------------------------------------------
// Step 1: Load audio durations
// ---------------------------------------------------------------------------

function loadDurations() {
  for (const cap of CAPTIONS) {
    cap.audioPath = audioPath(cap.id);
    if (!fs.existsSync(cap.audioPath)) {
      throw new Error(`Missing audio: ${cap.audioPath}`);
    }
    cap.audioDuration = getAudioDuration(cap.audioPath);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Calculate freeze points and new audio timestamps
//
// Walk captions in order. For each one:
//   - ideal audio start = (visual time in new timeline) + AUDIO_SHIFT
//   - earliest start    = previous clip end + MIN_GAP
//   - if earliest > ideal → insert freeze frame of (earliest - ideal) seconds
//     right before this caption's visual moment
// ---------------------------------------------------------------------------

function calculateFreezes() {
  let videoShift = 0;   // cumulative freeze time inserted
  let prevEnd = -Infinity;
  const freezes = [];

  for (const cap of CAPTIONS) {
    const visualNew = cap.startSec + videoShift;
    let idealStart = visualNew + AUDIO_SHIFT;
    const earliest = prevEnd + MIN_GAP;

    if (idealStart < earliest) {
      // Need a freeze frame to let previous clip finish
      const freezeDur = Math.ceil((earliest - idealStart) * 10) / 10; // round up to 0.1s
      freezes.push({
        originalTime: cap.startSec,  // where to freeze in the source video
        duration: freezeDur,
      });
      videoShift += freezeDur;
      idealStart = earliest;
    }

    cap.newAudioStart = Math.max(idealStart, 0);
    prevEnd = cap.newAudioStart + cap.audioDuration;
  }

  return freezes;
}

// ---------------------------------------------------------------------------
// Step 3: Build ffmpeg filter to insert freeze frames into video
//
// For each freeze point, we:
//   1. Take the normal video segment up to the freeze point
//   2. Grab one frame at the freeze point, clone it for the freeze duration
//   3. Continue with the next normal segment
// Then concat everything.
// ---------------------------------------------------------------------------

function buildVideoFilter(freezes) {
  const parts = [];
  const labels = [];
  let idx = 0;
  let lastCut = 0;

  for (const f of freezes) {
    // Normal segment: lastCut → freeze point
    parts.push(
      `[0:v]trim=start=${lastCut}:end=${f.originalTime},setpts=PTS-STARTPTS[seg${idx}]`,
    );
    labels.push(`[seg${idx}]`);
    idx++;

    // Freeze frame: grab frame at freeze point, clone for duration
    parts.push(
      `[0:v]trim=start=${f.originalTime}:end=${(f.originalTime + 0.08).toFixed(2)},setpts=PTS-STARTPTS,tpad=stop_duration=${f.duration}:stop_mode=clone[seg${idx}]`,
    );
    labels.push(`[seg${idx}]`);
    idx++;

    lastCut = f.originalTime;
  }

  // Final segment: last freeze point → end
  parts.push(
    `[0:v]trim=start=${lastCut},setpts=PTS-STARTPTS[seg${idx}]`,
  );
  labels.push(`[seg${idx}]`);
  idx++;

  // Concat all segments
  parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vfrozen]`);

  return parts;
}

// ---------------------------------------------------------------------------
// Step 4: Build ffmpeg filter for audio placement + merge
// ---------------------------------------------------------------------------

function buildFullCommand(freezes) {
  const videoFilter = buildVideoFilter(freezes);

  // Audio delay filters
  const audioFilters = CAPTIONS.map((cap, i) => {
    const delayMs = Math.round(cap.newAudioStart * 1000);
    return `[${i + 1}]adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=mono[a${i + 1}]`;
  });

  const mixLabels = CAPTIONS.map((_, i) => `[a${i + 1}]`).join('');
  audioFilters.push(
    `${mixLabels}amix=inputs=${CAPTIONS.length}:normalize=0,apad=pad_dur=5[voice]`,
  );

  const allFilters = [...videoFilter, ...audioFilters].join(';\n');

  const inputs = [
    `-i "${VIDEO_INPUT}"`,
    ...CAPTIONS.map((c) => `-i "${c.audioPath}"`),
  ];

  return [
    'ffmpeg -y',
    ...inputs,
    `-filter_complex "${allFilters}"`,
    '-map "[vfrozen]" -map "[voice]"',
    '-c:v libx264 -crf 20 -preset medium',
    '-c:a aac -b:a 192k',
    '-shortest',
    `"${VIDEO_OUTPUT}"`,
  ].join(' \\\n  ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Merge Highlights V2 (freeze-frame approach) ===\n');

  // Load durations
  console.log('Loading audio durations...');
  loadDurations();

  // Calculate freezes
  const freezes = calculateFreezes();

  const totalFreeze = freezes.reduce((s, f) => s + f.duration, 0);
  console.log(`\nFreeze points (${freezes.length}):`);
  for (const f of freezes) {
    console.log(`  Video pauses at ${f.originalTime}s for ${f.duration}s`);
  }
  console.log(`Total freeze time: ${totalFreeze.toFixed(1)}s`);
  console.log(`New video duration: ~${(84.2 + totalFreeze).toFixed(1)}s`);

  // Show timing report
  console.log('\nAudio placement (no overlaps):');
  for (const cap of CAPTIONS) {
    const end = cap.newAudioStart + cap.audioDuration;
    const next = CAPTIONS.find((c) => c.id === cap.id + 1);
    const gap = next ? next.newAudioStart - end : 0;
    const gapStr = next ? `  gap=${gap.toFixed(1)}s` : '';
    console.log(`  Caption ${pad(cap.id)}: ${cap.newAudioStart.toFixed(1)}s → ${end.toFixed(1)}s  (${cap.audioDuration.toFixed(1)}s)${gapStr}`);
  }

  // Build and run
  console.log('\nBuilding ffmpeg command...');
  const cmd = buildFullCommand(freezes);
  console.log('\n' + cmd + '\n');

  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT });

  const stats = fs.statSync(VIDEO_OUTPUT);
  console.log(`\nDone! ${VIDEO_OUTPUT}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
}

main();
