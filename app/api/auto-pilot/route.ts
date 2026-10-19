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

// Initialize Supabase client
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

const BGM_LIBRARY: Record<string, string> = {
  cinematic: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=cinematic-time-lapse-115672.mp3',
  suspense: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=suspense-dark-ambient-115682.mp3',
  lofi: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf7f6.mp3?filename=lofi-study-112191.mp3',
  inspirational: 'https://cdn.pixabay.com/download/audio/2022/04/27/audio_031c26b47c.mp3?filename=inspirational-background-112290.mp3'
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

// Accurate subtitle generator synchronized with precise chunk durations
function generateAssSubtitleFile(shots: Shot[], filePath: string, width: number, height: number, captionColor: string) {
  const fontSize = width === 1920 ? 80 : 64;
  const marginV = height === 1080 ? 150 : 520;
  const primaryColor = getAssColorHex(captionColor);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ViralStyle,DejaVu Sans,${fontSize},${primaryColor},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,${marginV},1

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
      const chunkSize = 3; // 3-4 words for snappy viral pacing
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

export async function POST(req: Request) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofrix-autopilot-'));

  try {
    const { seriesName, niche, tone, duration, publishTime, customPrompt, voice, aspectRatio, bgmTrack, captionColor } = await req.json();

    // 1. GENERATE SCRIPT & SHOTS VIA OPENROUTER AI
    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '';
    const scriptPrompt = `Create a viral short-form video script for niche: "${niche}", series: "${seriesName || 'Viral Series'}". Tone: "${tone}". Duration: "${duration}". Custom instructions: "${customPrompt || 'None'}".
    Return ONLY valid JSON with this exact structure:
    {
      "script": "Full narration text...",
      "shots": [
        {
          "shotNumber": 1,
          "narration": "Exact spoken words for this scene",
          "visualPrompt": "Cinematic visual description",
          "searchKeywords": "keyword1, keyword2",
          "durationSeconds": 5
        }
      ]
    }`;

    const scriptAiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: scriptPrompt }],
        temperature: 0.7
      })
    });

    const scriptAiData = await scriptAiRes.json();
    const rawContent = scriptAiData.choices?.[0]?.message?.content || '{}';
    const cleanedJson = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedScript = JSON.parse(cleanedJson);

    const script = parsedScript.script || 'Engaging viral narration story.';
    const shots: Shot[] = parsedScript.shots || [];

    if (shots.length === 0) {
      throw new Error('AI failed to generate valid shot list.');
    }

    // 2. GENERATE VOICEOVER AUDIO (Using Edge TTS or Fallback)
    const audioPath = path.join(tmpDir, 'voiceover.mp3');
    try {
      const ttsRes = await fetch('https://edge-tts-api.vercel.app/api/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, voice: voice || 'en-US-JennyNeural' })
      });
      if (ttsRes.ok) {
        const audioBuffer = await ttsRes.arrayBuffer();
        fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
      } else {
        // Fallback silent or dummy audio generator if external TTS fails
        await execPromise(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 15 -c:a libmp3lame "${audioPath}"`);
      }
    } catch (err) {
      await execPromise(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 15 -c:a libmp3lame "${audioPath}"`);
    }

    // 3. FETCH VIDEO CLIPS VIA PIXABAY
    const pixabayKey = process.env.PIXABAY_API_KEY || '';
    const processedShots: Shot[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      let videoUrl: string | null = null;

      try {
        const query = encodeURIComponent(shot.searchKeywords || shot.visualPrompt || niche);
        const pixRes = await fetch(`https://pixabay.com/api/videos/?key=${pixabayKey}&q=${query}&per_page=3`);
        const pixData = await pixRes.json();
        if (pixData.hits && pixData.hits.length > 0) {
          videoUrl = pixData.hits[0].videos?.medium?.url || pixData.hits[0].videos?.small?.url;
        }
      } catch (err) {}

      processedShots.push({
        ...shot,
        videoUrl: videoUrl || null,
        imageUrl: null
      });
    }

    // 4. STITCH VIDEO WITH FFMPEG (Parallel Processing & Exact Duration Matching)
    let targetWidth = 1080;
    let targetHeight = 1920;
    if (aspectRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
    else if (aspectRatio === '1:1') { targetWidth = 1080; targetHeight = 1080; }

    const clipPromises = processedShots.map(async (shot: Shot, i: number) => {
      const mediaUrl = shot.videoUrl;
      const clipDuration = shot.durationSeconds || 5;
      const clipPath = path.join(tmpDir, `clip_${i}.mp4`);
      const normPath = path.join(tmpDir, `norm_${i}.mp4`);

      if (mediaUrl) {
        try {
          const res = await fetch(mediaUrl);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(clipPath, Buffer.from(buffer));
            await execPromise(
              `"${ffmpegPath}" -y -i "${clipPath}" -t ${clipDuration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=30" -c:v libx264 -preset ultrafast -an "${normPath}"`
            );
            return normPath;
          }
        } catch (err) {}
      }

      // Fallback background color block
      await execPromise(
        `"${ffmpegPath}" -y -f lavfi -i color=c=0x0f172a:s=${targetWidth}x${targetHeight}:r=30 -t ${clipDuration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
      );
      return normPath;
    });

    const downloadedClips = await Promise.all(clipPromises);

    // Fetch BGM
    let bgmPath = '';
    const selectedMood = bgmTrack && BGM_LIBRARY[bgmTrack] ? bgmTrack : 'cinematic';
    try {
      const bgmRes = await fetch(BGM_LIBRARY[selectedMood]);
      if (bgmRes.ok) {
        bgmPath = path.join(tmpDir, 'bgm.mp3');
        fs.writeFileSync(bgmPath, Buffer.from(await bgmRes.arrayBuffer()));
      }
    } catch (err) {}

    const listPath = path.join(tmpDir, 'files.txt');
    fs.writeFileSync(listPath, downloadedClips.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf8');

    const assPath = path.join(tmpDir, 'subtitles.ass');
    generateAssSubtitleFile(processedShots, assPath, targetWidth, targetHeight, captionColor || 'yellow');

    const outputFileName = `autopilot_${Date.now()}.mp4`;
    const outputPath = path.join(tmpDir, outputFileName);
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}"`;
    if (fs.existsSync(audioPath) && bgmPath) {
      ffmpegCmd += ` -i "${audioPath}" -i "${bgmPath}" -filter_complex "[0:v]ass=${escapedAssPath}[vout];[1:a]volume=1.0[voice];[2:a]volume=0.10[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 26 -b:v 2M -preset veryfast -c:a aac -b:a 128kg "${outputPath}"`;
    } else if (fs.existsSync(audioPath)) {
      ffmpegCmd += ` -i "${audioPath}" -vf "ass=${escapedAssPath}" -c:v libx264 -crf 26 -b:v 2M -preset veryfast -c:a aac -b:a 128k -shortest "${outputPath}"`;
    } else {
      ffmpegCmd += ` -vf "ass=${escapedAssPath}" -c:v libx264 -crf 26 -b:v 2M -preset veryfast "${outputPath}"`;
    }

    await execPromise(ffmpegCmd);

    // Upload final video directly to Supabase Storage bucket 'videos'
    const videoBuffer = fs.readFileSync(outputPath);
    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(outputFileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(outputFileName);

    fs.rmSync(tmpDir, { recursive: true, force: true });

    return NextResponse.json({
      url: publicUrlData.publicUrl,
      script,
      shots: processedShots,
      audioUrl: publicUrlData.publicUrl // or temporary audio URL
    });

  } catch (error: any) {
    console.error('Auto-Pilot Error:', error);
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: error?.message || 'Auto-pilot pipeline failed.' }, { status: 500 });
  }
}