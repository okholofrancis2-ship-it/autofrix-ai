TypeScript

import { NextResponse } from 'next/server';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import ffmpegStatic from 'ffmpeg-static';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

const execFile = promisify(execFileCallback);
const FFMPEG = ffmpegStatic || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

// Use the service-role key only on the server. Never expose it to the client.
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

interface Shot {
  shotNumber: number;
  narration: string;
  visualPrompt: string;
  searchKeywords: string;
  durationSeconds: number;
  videoUrl?: string | null;
  imageUrl?: string | null;
}

interface DurationSettings {
  targetDurationSec: number;
  shotCount: number;
  shotDuration: number;
}

const BGM_LIBRARY: Record<string, string[]> = {
  cinematic: [
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=cinematic-time-lapse-115672.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=cinematic-documentary-119471.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/16/audio_db60b09337.mp3?filename=epic-cinematic-trailer-111454.mp3',
  ],
  suspense: [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=suspense-dark-ambient-115682.mp3',
    'https://cdn.pixabay.com/download/audio/2022/08/03/audio_14569527fe.mp3?filename=dark-mystery-trailer-113576.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/03/audio_c60144d188.mp3?filename=horror-suspense-ambient-123285.mp3',
  ],
  lofi: [
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf7f6.mp3?filename=lofi-study-112191.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/16/audio_959f635c03.mp3?filename=lofi-chill-111425.mp3',
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_6504a370e2.mp3?filename=lofi-beat-110915.mp3',
  ],
  inspirational: [
    'https://cdn.pixabay.com/download/audio/2022/04/27/audio_031c26b47c.mp3?filename=inspirational-background-112290.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_179426cb78.mp3?filename=uplifting-corporate-112219.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/10/audio_515949e2cf.mp3?filename=successful-corporate-125026.mp3',
  ],
};

const FETCH_TIMEOUT_MS = 25_000;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_SHOTS = 45;

function assertConfiguration() {
  const missing: string[] = [];

  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!OPENROUTER_KEY) missing.push('OPENROUTER_API_KEY');

  if (missing.length) {
    throw new Error(`Missing server environment variables: ${missing.join(', ')}`);
  }
}

function parseDurationSettings(value: string): DurationSettings {
  const text = String(value || '50-60 seconds')
    .toLowerCase()
    .trim();

  // Explicit minute ranges must be checked before generic numbers.
  const minuteRange = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*min/);

  if (minuteRange) {
    const min = Number(minuteRange[1]);
    const max = Number(minuteRange[2]);
    const target = Math.round(((min + max) / 2) * 60);
    const count = Math.min(MAX_SHOTS, Math.max(3, Math.round(target / 6)));

    return {
      targetDurationSec: count * 6,
      shotCount: count,
      shotDuration: 6,
    };
  }

  const secondsRange = text.match(/(\d+)\s*(?:-|to)\s*(\d+)\s*(?:sec|second)/);

  if (secondsRange) {
    const min = Number(secondsRange[1]);
    const max = Number(secondsRange[2]);
    const target = Math.round((min + max) / 2);
    const count = Math.min(MAX_SHOTS, Math.max(3, Math.round(target / 6)));

    return {
      targetDurationSec: count * 6,
      shotCount: count,
      shotDuration: 6,
    };
  }

  const single = text.match(/(\d+)\s*(min|minute|sec|second)?/);

  if (single) {
    const valueNumber = Number(single[1]);
    const isMinutes = /min|minute/.test(single[2] || '');
    const target = isMinutes ? valueNumber * 60 : valueNumber;

    if (!Number.isFinite(target) || target < 1) {
      throw new Error('Invalid video duration.');
    }

    const count = Math.min(MAX_SHOTS, Math.max(3, Math.round(target / 6)));

    return {
      targetDurationSec: count * 6,
      shotCount: count,
      shotDuration: 6,
    };
  }

  // Backward-compatible defaults for labels such as "Standard Reel".
  return {
    targetDurationSec: 36,
    shotCount: 6,
    shotDuration: 6,
  };
}

function cleanText(value: unknown, maxLength = 3000): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function getSmartKeywords(value: string, fallback: string): string {
  const words = cleanText(value || fallback, 300)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 5);

  return words.join(' ') || 'cinematic documentary';
}

function normaliseShots(
  input: unknown,
  count: number,
  duration: number,
  niche: string,
): Shot[] {
  const source = Array.isArray(input) ? input : [];

  if (source.length === 0) {
    throw new Error('The AI returned no usable shots. Please retry generation.');
  }

  const valid: Shot[] = source
    .slice(0, count)
    .map((item: any, index: number) => ({
      shotNumber: index + 1,
      narration: cleanText(item?.narration, 1500),
      visualPrompt: cleanText(item?.visualPrompt, 1000) || niche,
      searchKeywords: cleanText(item?.searchKeywords, 300) || niche,
      durationSeconds: duration,
      videoUrl: null,
      imageUrl: null,
    }));

  // Reuse the last valid shot rather than indexing an empty array.
  while (valid.length < count) {
    const previous = valid[valid.length - 1];

    valid.push({
      ...previous,
      shotNumber: valid.length + 1,
      durationSeconds: duration,
      videoUrl: null,
      imageUrl: null,
    });
  }

  if (valid.some((shot) => !shot.narration)) {
    throw new Error('One or more generated shots have empty narration.');
  }

  return valid;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(
  url: string,
  maxBytes = MAX_MEDIA_BYTES,
): Promise<Buffer> {
  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`Media download failed with HTTP ${response.status}.`);
  }

  const declaredSize = Number(response.headers.get('content-length') || 0);

  if (declaredSize > maxBytes) {
    throw new Error('Media file exceeds the configured size limit.');
  }

  if (!response.body) {
    throw new Error('The media server returned an empty response.');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Media file exceeds the configured size limit.');
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (!total) {
    throw new Error('Downloaded media is empty.');
  }

  return Buffer.concat(chunks);
}

async function runFfmpeg(args: string[], cwd: string): Promise<void> {
  try {
    await execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], {
      cwd,
      timeout: 180_000,
      maxBuffer: 5 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error: any) {
    const stderr = String(error?.stderr || error?.message || 'Unknown FFmpeg error');
    console.error('FFmpeg failed:', stderr.slice(-5000));
    throw new Error(`FFmpeg processing failed: ${stderr.slice(-700, -1) || stderr.slice(-700)}`);
  }
}

async function probeMedia(filePath: string, cwd: string): Promise<any> {
  const { stdout } = await execFile(
    FFPROBE,
    [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate',
      '-of', 'json',
      filePath,
    ],
    {
      cwd,
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    },
  );

  return JSON.parse(stdout);
}

function hasStream(probe: any, type: string): boolean {
  return Array.isArray(probe?.streams) &&
    probe.streams.some((stream: any) => stream.codec_type === type);
}

function formatAssTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.floor(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

function assEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function getAssColor(color: string): string {
  switch (String(color || '').toLowerCase()) {
    case 'yellow': return '&H0000FFFF';
    case 'green': return '&H0000FF00';
    case 'cyan': return '&H00FFFF00';
    case 'white': return '&H00FFFFFF';
    default: return '&H0000FFFF';
  }
}

function generateAssSubtitles(
  shots: Shot[],
  outputPath: string,
  width: number,
  height: number,
  captionColor: string,
): void {
  const fontSize = width >= 1920 ? 68 : 54;
  const marginV = height > width ? Math.round(height * 0.20) : Math.round(height * 0.12);
  const primaryColor = getAssColor(captionColor);

  const header = `[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ViralStyle,Arial,${fontSize},${primaryColor},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let time = 0;
  let events = '';

  for (const shot of shots) {
    const duration = shot.durationSeconds || 6;
    const words = assEscape(shot.narration)
      .split(/\s+/)
      .filter(Boolean);

    // Three words per caption is readable on mobile.
    const chunks: string[][] = [];

    for (let index = 0; index < words.length; index += 3) {
      chunks.push(words.slice(index, index + 3));
    }

    let chunkTime = time;
    const wordCount = Math.max(1, words.length);

    for (const chunk of chunks) {
      const chunkDuration = duration * chunk.length / wordCount;
      const end = Math.min(time + duration, chunkTime + chunkDuration);

      if (end > chunkTime) {
        events += `Dialogue: 0,${formatAssTime(chunkTime)},${formatAssTime(end)},ViralStyle,,0,0,0,,${chunk.join(' ').toUpperCase()}\n`;
      }

      chunkTime = end;
    }

    time += duration;
  }

  fs.writeFile(outputPath, header + events, 'utf8').catch((error) => {
    throw error;
  });
}

async function createSubtitles(
  shots: Shot[],
  outputPath: string,
  width: number,
  height: number,
  captionColor: string,
): Promise<void> {
  const fontSize = width >= 1920 ? 68 : 54;
  const marginV = height > width ? Math.round(height * 0.20) : Math.round(height * 0.12);

  const header = `[Script Info]
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ViralStyle,Arial,${fontSize},${getAssColor(captionColor)},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let time = 0;
  let events = '';

  for (const shot of shots) {
    const duration = shot.durationSeconds || 6;
    const words = assEscape(shot.narration).split(/\s+/).filter(Boolean);
    const chunks: string[][] = [];

    for (let index = 0; index < words.length; index += 3) {
      chunks.push(words.slice(index, index + 3));
    }

    const totalWords = Math.max(1, words.length);
    let chunkStart = time;

    for (const chunk of chunks) {
      const chunkDuration = duration * chunk.length / totalWords;
      const chunkEnd = Math.min(time + duration, chunkStart + chunkDuration);

      if (chunkEnd > chunkStart) {
        events += `Dialogue: 0,${formatAssTime(chunkStart)},${formatAssTime(chunkEnd)},ViralStyle,,0,0,0,,${chunk.join(' ').toUpperCase()}\n`;
      }

      chunkStart = chunkEnd;
    }

    time += duration;
  }

  await fs.writeFile(outputPath, header + events, 'utf8');

  if (!events.trim()) {
    throw new Error('Subtitle generation produced no caption events.');
  }
}

async function generateVoiceover(
  script: string,
  voice: string,
  targetDuration: number,
  cwd: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    'https://edge-tts-api.vercel.app/api/text-to-speech',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: script,
        voice: voice || 'en-US-JennyNeural',
      }),
    },
    60_000,
  );

  if (!response.ok) {
    throw new Error(`Voiceover service failed with HTTP ${response.status}.`);
  }

  const raw = Buffer.from(await response.arrayBuffer());

  if (raw.length < 1000) {
    throw new Error('Voiceover service returned an empty or invalid audio file.');
  }

  const rawPath = path.join(cwd, 'voiceover_raw.mp3');
  const finalPath = path.join(cwd, 'voiceover.mp3');

  await fs.writeFile(rawPath, raw);

  const rawProbe = await probeMedia(rawPath, cwd);

  if (!hasStream(rawProbe, 'audio')) {
    throw new Error('The generated voiceover contains no readable audio stream.');
  }

  const rawDuration = Number(rawProbe?.format?.duration || 0);

  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error('Unable to determine the voiceover duration.');
  }

  // Fit unusually long narration into the video duration without speeding it
  // up aggressively. Short narration is padded with silence after the speech.
  const atempo = Math.max(0.75, Math.min(1.35, rawDuration / targetDuration));

  await runFfmpeg(
    [
      '-i', rawPath,
      '-af', `atempo=${atempo.toFixed(4)},apad`,
      '-t', String(targetDuration),
      '-ar', '44100',
      '-ac', '2',
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-y', finalPath,
    ],
    cwd,
  );

  const finalProbe = await probeMedia(finalPath, cwd);

  if (!hasStream(finalProbe, 'audio')) {
    throw new Error('FFmpeg failed to produce a valid voiceover audio stream.');
  }

  return finalPath;
}

async function searchPixabay(
  type: 'video' | 'image',
  query: string,
): Promise<any | null> {
  if (!PIXABAY_KEY) return null;

  const endpoint = type === 'video'
    ? 'https://pixabay.com/api/videos/'
    : 'https://pixabay.com/api/';

  const url = new URL(endpoint);
  url.searchParams.set('key', PIXABAY_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('safesearch', 'true');
  url.searchParams.set('per_page', '10');
  url.searchParams.set('page', String(Math.floor(Math.random() * 3) + 1));

  if (type === 'video') {
    url.searchParams.set('video_type', 'film');
  }

  try {
    const response = await fetchWithTimeout(url.toString());

    if (!response.ok) return null;

    const data = await response.json();
    const hits = Array.isArray(data?.hits) ? data.hits : [];

    if (!hits.length) return null;

    return hits[Math.floor(Math.random() * hits.length)];
  } catch {
    return null;
  }
}

async function findShotMedia(shot: Shot, niche: string): Promise<Shot> {
  const query = getSmartKeywords(
    shot.searchKeywords || shot.visualPrompt,
    niche,
  );

  const fallback = getSmartKeywords(niche, 'cinematic documentary');

  let hit = await searchPixabay('video', query);

  if (!hit) hit = await searchPixabay('video', fallback);

  if (hit?.videos) {
    const videoUrl =
      hit.videos.medium?.url ||
      hit.videos.large?.url ||
      hit.videos.small?.url;

    if (videoUrl) return { ...shot, videoUrl, imageUrl: null };
  }

  hit = await searchPixabay('image', query);

  if (!hit) hit = await searchPixabay('image', fallback);

  const imageUrl = hit?.largeImageURL || hit?.webformatURL || null;

  return { ...shot, videoUrl: null, imageUrl };
}

async function createNormalisedClip(
  shot: Shot,
  index: number,
  width: number,
  height: number,
  cwd: string,
): Promise<string> {
  const outputName = `normalised_${index}.mp4`;
  const outputPath = path.join(cwd, outputName);
  const duration = shot.durationSeconds || 6;

  const mediaUrl = shot.videoUrl || shot.imageUrl;

  if (mediaUrl) {
    try {
      const imageOrVideo = await fetchBuffer(mediaUrl);
      const isVideo = Boolean(shot.videoUrl);
      const inputPath = path.join(cwd, `source_${index}.${isVideo ? 'mp4' : 'jpg'}`);

      await fs.writeFile(inputPath, imageOrVideo);

      if (isVideo) {
        await runFfmpeg(
          [
            '-i', inputPath,
            '-t', String(duration),
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30,format=yuv420p`,
            '-an',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-y', outputPath,
          ],
          cwd,
        );
      } else {
        await runFfmpeg(
          [
            '-loop', '1',
            '-framerate', '30',
            '-i', inputPath,
            '-t', String(duration),
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,zoompan=z='min(zoom+0.001,1.12)':d=${Math.ceil(duration * 30)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30,format=yuv420p`,
            '-an',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-y', outputPath,
          ],
          cwd,
        );
      }

      const probe = await probeMedia(outputPath, cwd);

      if (hasStream(probe, 'video')) return outputName;
    } catch (error) {
      console.warn(`Shot ${index + 1} media failed; using fallback background.`, error);
    }
  }

  // A valid fallback clip ensures the timeline remains complete.
  await runFfmpeg(
    [
      '-f', 'lavfi',
      '-i', `color=c=0x101827:s=${width}x${height}:r=30`,
      '-t', String(duration),
      '-vf', 'format=yuv420p',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-y', outputPath,
    ],
    cwd,
  );

  return outputName;
}

function buildConcatList(clips: string[]): string {
  return clips.map((name) => `file '${name}'`).join('\n') + '\n';
}

export async function POST(req: Request) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autofrix-'));
  let uploadedVideoPath: string | null = null;
  let uploadedAudioPath: string | null = null;

  try {
    assertConfiguration();

    const body = await req.json();

    const seriesName = cleanText(body.seriesName, 200) || 'Viral Story';
    const niche = cleanText(body.niche, 300) || 'Facts & Curiosities';
    const tone = cleanText(body.tone, 300) || 'Cinematic and engaging';
    const duration = cleanText(body.duration, 100) || '30-40 seconds';
    const customPrompt = cleanText(body.customPrompt, 3000) ||
      'Create a compelling narrative with a powerful hook.';
    const voice = cleanText(body.voice, 100) || 'en-US-JennyNeural';
    const aspectRatio = cleanText(body.aspectRatio, 10) || '9:16';
    const bgmTrack = cleanText(body.bgmTrack, 50) || 'cinematic';
    const captionColor = cleanText(body.captionColor, 30) || 'yellow';

    const {
      targetDurationSec,
      shotCount,
      shotDuration,
    } = parseDurationSettings(duration);

    let width = 1080;
    let height = 1920;

    if (aspectRatio === '16:9') {
      width = 1920;
      height = 1080;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    }

    // 1. Generate the script and shot list.
    const systemPrompt = `You are an expert cinematic short-form scriptwriter.
Create a complete narration and exactly ${shotCount} sequential shots.
Each shot must contain narration, visualPrompt and searchKeywords.
Each shot lasts exactly ${shotDuration} seconds.
The narration in script must equal the combined narration of all shots in the same order.
Write natural spoken language, with punctuation and no markdown.
Return ONLY valid JSON:
{
  "script": "Complete narration",
  "shots": [
    {
      "shotNumber": 1,
      "narration": "Spoken narration",
      "visualPrompt": "Detailed visual description",
      "searchKeywords": "Searchable visual keywords",
      "durationSeconds": ${shotDuration}
    }
  ]
}`;

    const aiResponse = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Autofrix AI',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openrouter/free',
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Series: ${seriesName}\nNiche: ${niche}\nTone: ${tone}\nTarget duration: ${targetDurationSec} seconds\nTopic: ${customPrompt}`,
            },
          ],
        }),
      },
      60_000,
    );

    const aiData = await aiResponse.json().catch(() => null);

    if (!aiResponse.ok) {
      throw new Error(
        `OpenRouter request failed (${aiResponse.status}): ${
          cleanText(aiData?.error?.message, 400) || 'Unknown provider error'
        }`,
      );
    }

    const rawContent = aiData?.choices?.[0]?.message?.content;

    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new Error('OpenRouter returned an empty script.');
    }

    const cleanedJson = rawContent
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: any;

    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      const start = cleanedJson.indexOf('{');
      const end = cleanedJson.lastIndexOf('}');

      if (start < 0 || end <= start) {
        throw new Error('The AI response was not valid JSON. Please retry.');
      }

      try {
        parsed = JSON.parse(cleanedJson.slice(start, end + 1));
      } catch {
        throw new Error('Could not parse the AI-generated script.');
      }
    }

    const shots = normaliseShots(
      parsed.shots,
      shotCount,
      shotDuration,
      niche,
    );

    const script = shots.map((shot) => shot.narration).join(' ');

    if (!script.trim()) {
      throw new Error('Generated narration is empty.');
    }

    // 2. Generate and validate real voiceover audio.
    const audioPath = await generateVoiceover(
      script,
      voice,
      targetDurationSec,
      tmpDir,
    );

    // 3. Find stock media for every shot.
    const processedShots: Shot[] = [];

    // Limit parallel downloads/searches to reduce API and memory pressure.
    for (let i = 0; i < shots.length; i += 3) {
      const group = shots.slice(i, i + 3);
      const results = await Promise.all(
        group.map((shot) => findShotMedia(shot, niche)),
      );

      processedShots.push(...results);
    }

    // 4. Normalise all clips to the same resolution and frame rate.
    const clipNames: string[] = [];

    for (let i = 0; i < processedShots.length; i++) {
      const clipName = await createNormalisedClip(
        processedShots[i],
        i,
        width,
        height,
        tmpDir,
      );

      clipNames.push(clipName);
    }

    // 5. Create subtitle file and concatenate the clips.
    const subtitlePath = path.join(tmpDir, 'subtitles.ass');

    await createSubtitles(
      processedShots,
      subtitlePath,
      width,
      height,
      captionColor,
    );

    const concatPath = path.join(tmpDir, 'files.txt');
    await fs.writeFile(concatPath, buildConcatList(clipNames), 'utf8');

    const silentVideoPath = path.join(tmpDir, 'silent_video.mp4');

    await runFfmpeg(
      [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatPath,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-y', silentVideoPath,
      ],
      tmpDir,
    );

    // 6. Burn subtitles into the video before audio mixing.
    const captionedVideoPath = path.join(tmpDir, 'captioned_video.mp4');

    await runFfmpeg(
      [
        '-i', silentVideoPath,
        '-vf', 'ass=subtitles.ass',
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-y', captionedVideoPath,
      ],
      tmpDir,
    );

    // 7. Download optional background music.
    let bgmPath: string | null = null;
    const tracks = BGM_LIBRARY[bgmTrack] || BGM_LIBRARY.cinematic;
    const selectedTrack = tracks[Math.floor(Math.random() * tracks.length)];

    try {
      const bgmBuffer = await fetchBuffer(selectedTrack, 25 * 1024 * 1024);
      const candidatePath = path.join(tmpDir, 'background_music.mp3');

      await fs.writeFile(candidatePath, bgmBuffer);

      const probe = await probeMedia(candidatePath, tmpDir);

      if (hasStream(probe, 'audio')) {
        bgmPath = candidatePath;
      }
    } catch (error) {
      console.warn('Background music unavailable; continuing with voiceover only.', error);
    }

    // 8. Explicitly map the voiceover and mix optional background music.
    const outputPath = path.join(tmpDir, 'final_video.mp4');

    const finalArgs = [
      '-i', captionedVideoPath,
      '-i', audioPath,
    ];

    if (bgmPath) {
      finalArgs.push(
        '-stream_loop', '-1',
        '-i', bgmPath,
        '-filter_complex',
        '[1:a]aresample=44100,volume=1.0[voice];[2:a]aresample=44100,volume=0.12[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0,alimiter=limit=0.95[aout]',
      );
    } else {
      finalArgs.push(
        '-filter_complex',
        '[1:a]aresample=44100,volume=1.0[aout]',
      );
    }

    finalArgs.push(
      '-map', '0:v:0',
      '-map', '[aout]',
      '-t', String(targetDurationSec),
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-movflags', '+faststart',
      '-shortest',
      '-y', outputPath,
    );

    await runFfmpeg(finalArgs, tmpDir);

    // 9. Verify the actual final file before uploading.
    const finalProbe = await probeMedia(outputPath, tmpDir);

    if (!hasStream(finalProbe, 'video')) {
      throw new Error('Final render is missing its video stream.');
    }

    if (!hasStream(finalProbe, 'audio')) {
      throw new Error('Final render is missing its audio stream.');
    }

    const subtitleContent = await fs.readFile(subtitlePath, 'utf8');

    if (!subtitleContent.includes('Dialogue:')) {
      throw new Error('Final render has no subtitle events to display.');
    }

    const videoBuffer = await fs.readFile(outputPath);
    const audioBuffer = await fs.readFile(audioPath);

    if (videoBuffer.length < 10_000) {
      throw new Error('Final video file is unexpectedly small.');
    }

    // 10. Upload the MP4 and voiceover separately.
    const outputId = randomUUID();
    uploadedVideoPath = `autopilot/${outputId}.mp4`;
    uploadedAudioPath = `voiceovers/${outputId}.mp3`;

    const { error: videoUploadError } = await supabase!
      .storage
      .from('videos')
      .upload(uploadedVideoPath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      });

    if (videoUploadError) {
      throw new Error(`Video upload failed: ${videoUploadError.message}`);
    }

    const { error: audioUploadError } = await supabase!
      .storage
      .from('videos')
      .upload(uploadedAudioPath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (audioUploadError) {
      // Avoid leaving an orphaned video when the companion audio upload fails.
      await supabase!.storage.from('videos').remove([uploadedVideoPath]);
      uploadedVideoPath = null;

      throw new Error(`Voiceover upload failed: ${audioUploadError.message}`);
    }

    const { data: videoUrlData } = supabase!
      .storage
      .from('videos')
      .getPublicUrl(uploadedVideoPath);

    const { data: audioUrlData } = supabase!
      .storage
      .from('videos')
      .getPublicUrl(uploadedAudioPath);

    return NextResponse.json({
      url: videoUrlData.publicUrl,
      audioUrl: audioUrlData.publicUrl,
      script,
      shots: processedShots,
      durationSeconds: targetDurationSec,
      hasAudio: true,
      hasSubtitles: true,
    });
  } catch (error: any) {
    console.error('Autofrix Auto-Pilot Error:', error);

    if (uploadedVideoPath && supabase) {
      await supabase.storage.from('videos').remove([uploadedVideoPath]).catch(() => {});
    }

    if (uploadedAudioPath && supabase) {
      await supabase.storage.from('videos').remove([uploadedAudioPath]).catch(() => {});
    }

    return NextResponse.json(
      {
        error: cleanText(error?.message, 1000) || 'Auto-pilot pipeline failed.',
      },
      { status: 500 },
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

