#!/usr/bin/env node
/**
 * Voice Pipeline — Highlights Demo
 *
 * Generates an MP4 with ElevenLabs voice narration overlaid on the
 * highlights-captioned.webm video. Each of the 21 on-screen captions
 * gets its own TTS audio clip, placed at the estimated video timestamp
 * using ffmpeg adelay filters.
 *
 * Usage:
 *   node demo/pipeline/generate-highlights-voice.mjs
 *
 * Prerequisites:
 *   - .env with ELEVAN_LABS_API_KEY
 *   - ffmpeg installed
 *   - demo/videos/highlights-captioned.webm (run npm run video:highlights first)
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

const VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda — Knowledgeable, Professional (premade, free tier)
const MODEL_ID = 'eleven_turbo_v2_5';
const API_BASE = 'https://api.elevenlabs.io/v1';

const AUDIO_DIR = path.join(PROJECT_ROOT, 'demo/audio/highlights');
const VIDEO_INPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-captioned.webm');
const VIDEO_OUTPUT = path.join(PROJECT_ROOT, 'demo/videos/highlights-with-voice.mp4');

// ---------------------------------------------------------------------------
// 21 captions with estimated video start timestamps (seconds)
//
// Timestamps derived by tracing waitForTimeout calls through
// highlights-with-captions.spec.ts. All pauses are deterministic.
// Actual recorded video is ~84s; estimates calibrated to match.
// ---------------------------------------------------------------------------

const CAPTIONS = [
  // Section 1: Dashboard Landing
  { id: 1,  text: 'Welcome to ProjectHub — a modern project management dashboard.',   startSec: 1.4  },
  { id: 2,  text: 'Interactive stat cards show key metrics at a glance.',              startSec: 5.5  },

  // Section 2: Charts & Activity Feed
  { id: 3,  text: 'Data visualization powered by Recharts.',                           startSec: 9.7  },
  { id: 4,  text: 'Hover tooltips reveal exact data points.',                          startSec: 12.8 },
  { id: 5,  text: 'The activity feed tracks team actions in real time.',                startSec: 17.0 },

  // Section 3: Projects Page
  { id: 6,  text: 'Next — the Projects page.',                                         startSec: 21.5 },
  { id: 7,  text: 'Search, sorting, and pagination — all built in.',                   startSec: 24.5 },
  { id: 8,  text: 'Real-time filtering as you type.',                                  startSec: 27.0 },
  { id: 9,  text: 'Sortable column headers toggle direction.',                         startSec: 30.5 },
  { id: 10, text: 'Creating a new project via modal form.',                             startSec: 34.0 },
  { id: 11, text: 'Success — the new project appears instantly.',                       startSec: 38.5 },

  // Section 4: Kanban Board
  { id: 12, text: 'The Kanban board — drag-and-drop task management.',                  startSec: 41.5 },
  { id: 13, text: 'Moving a task from To Do to In Progress.',                           startSec: 47.0 },
  { id: 14, text: 'And from In Progress to Done.',                                      startSec: 50.0 },

  // Section 5: Dark Mode
  { id: 15, text: 'Dark mode — one click transforms the entire interface.',             startSec: 53.5 },
  { id: 16, text: 'Every chart and card adapts to the dark palette.',                   startSec: 59.0 },

  // Section 6: Responsive Design
  { id: 17, text: 'Responsive design — from desktop to mobile.',                        startSec: 67.5 },
  { id: 18, text: 'Mobile at 375 pixels — everything adapts.',                          startSec: 71.5 },
  { id: 19, text: 'Tablet — the sidebar collapses to icons.',                           startSec: 75.0 },
  { id: 20, text: 'Back to desktop — full layout restored.',                            startSec: 77.5 },

  // Outro
  { id: 21, text: 'ProjectHub — React 18, TypeScript, Tailwind CSS. No backend required. Thanks for watching.', startSec: 79.5 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadApiKey() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env not found at ${envPath}`);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(/ELEVAN_LABS_API_KEY=(.+)/) || content.match(/ELEVEN_LABS_API_KEY=(.+)/);
  if (!match) throw new Error('API key not found in .env (expected ELEVAN_LABS_API_KEY)');
  return match[1].trim().replace(/^["']|["']$/g, ''); // strip surrounding quotes
}

function getAudioDuration(filePath) {
  const output = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
    { encoding: 'utf-8' },
  ).trim();
  return parseFloat(output);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function captionPath(id) {
  return path.join(AUDIO_DIR, `caption_${pad(id)}.mp3`);
}

// ---------------------------------------------------------------------------
// Step 1: Generate audio for each caption via ElevenLabs API
// ---------------------------------------------------------------------------

async function generateAudio(apiKey, caption, prevText, nextText) {
  const outPath = captionPath(caption.id);

  // Skip if already generated (saves credits on re-runs)
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    console.log(`  [cached] Caption ${pad(caption.id)}: "${caption.text.slice(0, 50)}..."`);
    return outPath;
  }

  const body = {
    text: caption.text,
    model_id: MODEL_ID,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  };
  if (prevText) body.previous_text = prevText;
  if (nextText) body.next_text = nextText;

  const response = await fetch(`${API_BASE}/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`ElevenLabs API error (caption ${caption.id}): ${response.status}\n${errBody}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  console.log(`  [new]    Caption ${pad(caption.id)}: "${caption.text.slice(0, 50)}..." (${(buffer.length / 1024).toFixed(0)} KB)`);
  return outPath;
}

// ---------------------------------------------------------------------------
// Step 2: Build ffmpeg command to merge all audio at correct timestamps
// ---------------------------------------------------------------------------

function buildFfmpegCommand(timingData) {
  // Input files: video + 21 caption mp3s
  const inputs = [
    `-i "${VIDEO_INPUT}"`,
    ...timingData.map((t) => `-i "${t.audioPath}"`),
  ];

  // Filter: delay each caption to its video timestamp, then mix
  const filterLines = timingData.map((t, i) => {
    const delayMs = Math.round(t.startSec * 1000);
    return `[${i + 1}]adelay=${delayMs}|${delayMs},aformat=sample_rates=44100:channel_layouts=mono[a${i + 1}]`;
  });

  const mixLabels = timingData.map((_, i) => `[a${i + 1}]`).join('');
  filterLines.push(`${mixLabels}amix=inputs=${timingData.length}:normalize=0,apad=pad_dur=3[voice]`);

  const filterComplex = filterLines.join(';\n');

  const cmd = [
    'ffmpeg -y',
    ...inputs,
    `-filter_complex "${filterComplex}"`,
    '-map 0:v -map "[voice]"',
    '-c:v libx264 -crf 20 -preset medium',
    '-c:a aac -b:a 192k',
    '-shortest',
    `"${VIDEO_OUTPUT}"`,
  ].join(' \\\n  ');

  return cmd;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = loadApiKey();
  const totalChars = CAPTIONS.reduce((sum, c) => sum + c.text.length, 0);

  console.log('=== Highlights Voice Pipeline ===');
  console.log(`Voice: Deborah (${VOICE_ID})`);
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Captions: ${CAPTIONS.length}`);
  console.log(`Total chars: ${totalChars} (~${Math.ceil(totalChars * 0.5)} credits at Turbo rate)`);
  console.log(`Video input: ${VIDEO_INPUT}`);
  console.log(`Output: ${VIDEO_OUTPUT}`);
  console.log();

  // Verify video exists
  if (!fs.existsSync(VIDEO_INPUT)) {
    throw new Error(`Video not found: ${VIDEO_INPUT}\nRun: npm run video:highlights`);
  }

  // Create audio dir
  fs.mkdirSync(AUDIO_DIR, { recursive: true });

  // --- Step 1: Generate audio ---
  console.log('Step 1/3: Generating audio from ElevenLabs...');
  for (let i = 0; i < CAPTIONS.length; i++) {
    const prev = i > 0 ? CAPTIONS[i - 1].text : undefined;
    const next = i < CAPTIONS.length - 1 ? CAPTIONS[i + 1].text : undefined;
    await generateAudio(apiKey, CAPTIONS[i], prev, next);
  }
  console.log();

  // --- Step 2: Analyze durations ---
  console.log('Step 2/3: Analyzing audio durations...');
  const timingData = [];
  for (const caption of CAPTIONS) {
    const audioPath = captionPath(caption.id);
    const duration = getAudioDuration(audioPath);
    timingData.push({ ...caption, audioDuration: duration, audioPath });

    const endSec = caption.startSec + duration;
    const nextStart = CAPTIONS.find((c) => c.id === caption.id + 1)?.startSec;
    const overlap = nextStart ? endSec - nextStart : 0;
    const status = overlap > 0.3 ? ` ⚠️  overlaps next by ${overlap.toFixed(1)}s` : '';
    console.log(`  Caption ${pad(caption.id)}: audio=${duration.toFixed(1)}s  starts@${caption.startSec}s  ends@${endSec.toFixed(1)}s${status}`);
  }
  console.log();

  // --- Step 3: Merge with ffmpeg ---
  console.log('Step 3/3: Merging audio with video via ffmpeg...');
  const cmd = buildFfmpegCommand(timingData);
  console.log();
  console.log(cmd);
  console.log();

  execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT });

  const stats = fs.statSync(VIDEO_OUTPUT);
  console.log();
  console.log(`Done! ${VIDEO_OUTPUT}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
