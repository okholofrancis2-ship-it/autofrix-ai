import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

const execPromise = promisify(exec);
const ffmpegPath = ffmpegStatic || 'ffmpeg';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Shot {
  shotNumber: number;
  narration: string;
  visualPrompt: string;
  searchKeywords: string;
  durationSeconds: number;
  videoUrl?: string | null;
  imageUrl?: string | null;
}

const BGM_LIBRARY: Record<string, string[]> = {
  cinematic: [
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=cinematic-time-lapse-115672.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=cinematic-documentary-119471.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/16/audio_db60b09337.mp3?filename=epic-cinematic-trailer-111454.mp3'
  ],
  suspense: [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=suspense-dark-ambient-115682.mp3',
    'https://cdn.pixabay.com/download/audio/2022/08/03/audio_14569527fe.mp3?filename=dark-mystery-trailer-113576.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/03/audio_c60144d188.mp3?filename=horror-suspense-ambient-123285.mp3'
  ],
  lofi: [
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf7f6.mp3?filename=lofi-study-112191.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/16/audio_959f635c03.mp3?filename=lofi-chill-111425.mp3',
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_6504a370e2.mp3?filename=lofi-beat-110915.mp3'
  ],
  inspirational: [
    'https://cdn.pixabay.com/download/audio/2022/04/27/audio_031c26b47c.mp3?filename=inspirational-background-112290.mp3',
    'https://cdn.pixabay.com/download/audio/2022/05/27/audio_179426cb78.mp3?filename=uplifting-corporate-112219.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/10/audio_515949e2cf.mp3?filename=successful-corporate-125026.mp3'
  ]
};

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function getAssColorHex(colorName: string): string {
  switch (colorName) {
    case 'yellow': return '&H0000FFFF';
    case 'green': return '&H0000FF00';
    case 'cyan': return '&H00FFFF00';
    case 'white':
    default:
      return '&H00FFFFFF';
  }
}

function generateAssSubtitleFile(shots: Shot[], filePath: string, width: number, height: number, captionColor: string) {
  const fontSize = width === 1920 ? 76 : 58;
  const marginV = height === 1080 ? 140 : 480;
  const primaryColor = getAssColorHex(captionColor);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ViralStyle,Arial,${fontSize},${primaryColor},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let dialogues = '';
  let currentTime = 0;

  shots.forEach((shot) => {
    const shotDuration = shot.durationSeconds || 5;
    const narration = (shot.narration || '').trim();

    if (narration) {
      const words = narration.split(/\s+/);
      const chunkSize = 3;
      const chunks: string[] = [];

      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
      }

      const totalWords = words.length || 1;
      let chunkStart = currentTime;

      chunks.forEach((chunk) => {
        const chunkWordCount = chunk.split(/\s+/).length;
        const chunkDuration = (chunkWordCount / totalWords) * shotDuration;
        const chunkEnd = chunkStart + chunkDuration;

        const startFormatted = formatAssTime(chunkStart);
        const endFormatted = formatAssTime(chunkEnd);

        const uppercaseChunk = chunk.toUpperCase();
        dialogues += `Dialogue: 0,${startFormatted},${endFormatted},ViralStyle,,0,0,0,,${uppercaseChunk}\n`;

        chunkStart = chunkEnd;
      });
    }
    currentTime += shotDuration;
  });

  fs.writeFileSync(filePath, header + dialogues, 'utf8');
}

function extractAndParseJSON(rawContent: string, niche: string, seriesName: string) {
  try {
    return JSON.parse(rawContent);
  } catch (e) {
    let cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch (e3) {}
      }
      // Bulletproof fallback so autoplay never fails
      return {
        script: `Welcome to ${seriesName || 'this incredible journey'}. Discover the fascinating world of ${niche || 'amazing facts'} that will blow your mind. Watch until the end to see the most shocking details!`,
        shots: [
          { shotNumber: 1, narration: `Welcome to ${seriesName || 'this incredible journey'}.`, visualPrompt: niche || 'cinematic background', searchKeywords: niche || 'cinematic', durationSeconds: 6 },
          { shotNumber: 2, narration: `Discover the fascinating world of ${niche || 'amazing facts'}.`, visualPrompt: niche || 'epic view', searchKeywords: niche || 'epic', durationSeconds: 6 },
          { shotNumber: 3, narration: `That will completely blow your mind today.`, visualPrompt: 'stunning visual abstract', searchKeywords: 'abstract', durationSeconds: 6 },
          { shotNumber: 4, narration: `Watch until the end to see the most shocking details!`, visualPrompt: 'cinematic closing shot', searchKeywords: 'cinematic', durationSeconds: 7 }
        ]
      };
    }
  }
}

function getSmartKeywords(keywords: string, niche: string = '') {
  const rawWords = (keywords || niche || 'cinematic background')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
  return rawWords.slice(0, 3).join(' ') || niche || 'cinematic abstract';
}

export async function POST(req: Request) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofrix-autopilot-'));

  try {
    const { seriesName, niche, tone, duration, publishTime, customPrompt, voice, aspectRatio, bgmTrack, captionColor } = await req.json();
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterKey) {
      throw new Error('OPENROUTER_API_KEY is missing.');
    }

    const systemPrompt = `You are an expert short-form viral scriptwriter for TikTok, Reels, and YouTube Shorts.
Create a high-retention cinematic script and shot list.
Return ONLY valid JSON with no markdown formatting or backticks.
Structure:
{
  "script": "Full continuous narration script here...",
  "shots": [
    {
      "shotNumber": 1,
      "narration": "First sentence spoken in voiceover...",
      "visualPrompt": "Detailed cinematic visual description...",
      "searchKeywords": "electric car",
      "durationSeconds": 6
    }
  ]
}`;

    const userPrompt = `Series Name: ${seriesName || 'Viral Story'}
Niche: ${niche || 'True Crime & Mystery'}
Tone: ${tone || 'Dramatic, Suspenseful & Intense'}
Target Duration: ${duration || '30-40 seconds (Standard Reel)'}
Custom Topic: ${customPrompt || 'Create a compelling narrative with a powerful hook.'}`;

    const scriptAiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Autofrix AI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const scriptAiData = await scriptAiRes.json();
    const rawContent = scriptAiData.choices?.[0]?.message?.content || '{}';
    const parsedScript = extractAndParseJSON(rawContent, niche, seriesName);

    const script = parsedScript.script || 'Viral narration story.';
    const shots: Shot[] = parsedScript.shots || [];
    if (shots.length === 0) throw new Error('AI failed to generate valid shot list.');

    // 1. Generate Voiceover Audio via Edge TTS
    const audioPath = path.join(tmpDir, 'voiceover.mp3');
    try {
      const ttsRes = await fetch('https://edge-tts-api.vercel.app/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, voice: voice || 'en-US-JennyNeural' })
      });
      if (ttsRes.ok) {
        fs.writeFileSync(audioPath, Buffer.from(await ttsRes.arrayBuffer()));
      } else {
        await execPromise(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 25 -c:a libmp3lame "${audioPath}"`);
      }
    } catch (err) {
      await execPromise(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 25 -c:a libmp3lame "${audioPath}"`);
    }

    // 2. Fetch Video Clips via Pixabay with Smart Keywords & Varied Pagination
    const pixabayKey = process.env.PIXABAY_API_KEY || '';
    const processedShots: Shot[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      let videoUrl: string | null = null;
      let imageUrl: string | null = null;

      const smartQuery = encodeURIComponent(getSmartKeywords(shot.searchKeywords || shot.visualPrompt, niche));
      const fallbackQuery = encodeURIComponent(niche || 'cinematic background');

      const fetchPixabay = async (type: 'video' | 'image', query: string, orientation: string = 'vertical') => {
        const endpoint = type === 'video' ? 'videos/' : '';
        const randomPage = Math.floor(Math.random() * 3) + 1;
        const url = `https://pixabay.com/api/${endpoint}?key=${pixabayKey}&q=${query}&safesearch=true&order=popular&orientation=${orientation}&page=${randomPage}&per_page=10`;
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.json();
          if (data.hits && data.hits.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(data.hits.length, 6));
            return data.hits[randomIndex];
          }
          return null;
        } catch (e) {
          return null;
        }
      };

      let hit = await fetchPixabay('video', smartQuery, 'vertical');
      if (!hit) hit = await fetchPixabay('video', smartQuery, 'all');
      if (!hit) hit = await fetchPixabay('video', fallbackQuery, 'vertical');

      if (hit && hit.videos) {
        videoUrl = hit.videos.medium?.url || hit.videos.large?.url || hit.videos.small?.url || '';
      } else {
        hit = await fetchPixabay('image', smartQuery, 'vertical');
        if (!hit) hit = await fetchPixabay('image', smartQuery, 'all');
        if (!hit) hit = await fetchPixabay('image', fallbackQuery, 'vertical');
        if (hit) {
          imageUrl = hit.largeImageURL || hit.webformatURL || '';
        }
      }

      processedShots.push({
        ...shot,
        videoUrl: videoUrl || null,
        imageUrl: imageUrl || null
      });
    }

    // 3. Stitch Video with FFmpeg in Parallel
    let targetWidth = 1080;
    let targetHeight = 1920;
    if (aspectRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
    else if (aspectRatio === '1:1') { targetWidth = 1080; targetHeight = 1080; }

    const clipPromises = processedShots.map(async (shot: Shot, i: number) => {
      const mediaUrl = shot.videoUrl || shot.imageUrl;
      const clipDuration = shot.durationSeconds || 5;
      const isVideo = Boolean(shot.videoUrl);
      const clipPath = path.join(tmpDir, `clip_${i}.${isVideo ? 'mp4' : 'jpg'}`);
      const normPath = path.join(tmpDir, `norm_${i}.mp4`);

      if (mediaUrl) {
        try {
          const res = await fetch(mediaUrl);
          if (res.ok) {
            fs.writeFileSync(clipPath, Buffer.from(await res.arrayBuffer()));
            if (isVideo) {
              await execPromise(
                `"${ffmpegPath}" -y -i "${clipPath}" -t ${clipDuration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=30" -c:v libx264 -preset ultrafast -an "${normPath}"`
              );
            } else {
              const totalFrames = clipDuration * 30;
              const sourceCanvasSize = Math.max(targetWidth, targetHeight) * 2;
              await execPromise(
                `"${ffmpegPath}" -y -loop 1 -i "${clipPath}" -vf "scale=${sourceCanvasSize}:${sourceCanvasSize}:force_original_aspect_ratio=decrease,zoompan=z='min(zoom+0.0012,1.3)':d=${totalFrames}:x='iw/2-(iw/zoom)/2':y='ih/2-(iw/zoom)/2':s=${targetWidth}x${targetHeight},fps=30" -t ${clipDuration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
              );
            }
            return normPath;
          }
        } catch (err) {}
      }

      await execPromise(
        `"${ffmpegPath}" -y -f lavfi -i color=c=0x0f172a:s=${targetWidth}x${targetHeight}:r=30 -t ${clipDuration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
      );
      return normPath;
    });

    const downloadedClips = await Promise.all(clipPromises);

    // 4. Randomized BGM Selection
    let bgmPath = '';
    const moodTracks = BGM_LIBRARY[bgmTrack] || BGM_LIBRARY['cinematic'];
    const randomBgmUrl = moodTracks[Math.floor(Math.random() * moodTracks.length)];
    try {
      const bgmRes = await fetch(randomBgmUrl);
      if (bgmRes.ok) {
        bgmPath = path.join(tmpDir, 'bgm.mp3');
        fs.writeFileSync(bgmPath, Buffer.from(await bgmRes.arrayBuffer()));
      }
    } catch (err) {}

    const listPath = path.join(tmpDir, 'files.txt');
    fs.writeFileSync(listPath, downloadedClips.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');

    const assPath = path.resolve(path.join(tmpDir, 'subtitles.ass'));
    generateAssSubtitleFile(processedShots, assPath, targetWidth, targetHeight, captionColor || 'yellow');

    const outputFileName = `autopilot_${Date.now()}.mp4`;
    const outputPath = path.join(tmpDir, outputFileName);
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}"`;
    if (fs.existsSync(audioPath) && bgmPath) {
      ffmpegCmd += ` -i "${audioPath}" -i "${bgmPath}" -filter_complex "[0:v]ass=${escapedAssPath}[vout];[1:a]volume=1.0[voice];[2:a]volume=0.10[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 26 -b:v 2M -preset veryfast -c:a aac -b:a 128k -shortest "${outputPath}"`;
    } else if (fs.existsSync(audioPath)) {
      ffmpegCmd += ` -i "${audioPath}" -vf "ass=${escapedAssPath}" -c:v libx264 -crf 26 -b:v 2M -preset veryfast -c:a aac -b:a 128k -shortest "${outputPath}"`;
    } else {
      ffmpegCmd += ` -vf "ass=${escapedAssPath}" -c:v libx264 -crf 26 -b:v 2M -preset veryfast "${outputPath}"`;
    }

    await execPromise(ffmpegCmd);

    const videoBuffer = fs.readFileSync(outputPath);
    const { error: uploadError } = await supabase.storage.from('videos').upload(outputFileName, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(outputFileName);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      script,
      shots: processedShots,
      audioUrl: publicUrlData.publicUrl
    });
  } catch (error: any) {
    console.error('Auto-Pilot Error:', error);
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: error?.message || 'Auto-pilot pipeline failed.' }, { status: 500 });
  }
}