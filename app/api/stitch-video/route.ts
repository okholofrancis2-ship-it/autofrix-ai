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

// Initialize Supabase client for server-side upload
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Shot {
  shotNumber: number;
  narration: string;
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
Style: ViralStyle,Arial,${fontSize},${primaryColor},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,${marginV},1

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
      const chunkSize = 4;
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofrix-stitch-'));

  try {
    const { shots, audioUrl, bgmTrack, aspectRatio, captionColor } = await req.json();

    if (!shots || !Array.isArray(shots) || shots.length === 0) {
      return NextResponse.json({ error: 'No shots provided for stitching.' }, { status: 400 });
    }

    let targetWidth = 1080;
    let targetHeight = 1920;

    if (aspectRatio === '16:9') {
      targetWidth = 1920;
      targetHeight = 1080;
    } else if (aspectRatio === '1:1') {
      targetWidth = 1080;
      targetHeight = 1080;
    }

    const downloadedClips: string[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const mediaUrl = shot.videoUrl || shot.imageUrl;
      const duration = shot.durationSeconds || 5;
      const clipPath = path.join(tmpDir, `clip_${i}.${shot.videoUrl ? 'mp4' : 'jpg'}`);
      const normPath = path.join(tmpDir, `norm_${i}.mp4`);

      if (mediaUrl) {
        try {
          const res = await fetch(mediaUrl);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync(clipPath, Buffer.from(buffer));

            if (shot.videoUrl) {
              await execPromise(
                `"${ffmpegPath}" -y -i "${clipPath}" -t ${duration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=30" -c:v libx264 -preset ultrafast -an "${normPath}"`
              );
            } else {
              const totalFrames = duration * 30;
              const sourceCanvasSize = Math.max(targetWidth, targetHeight) * 2;
              await execPromise(
                `"${ffmpegPath}" -y -loop 1 -i "${clipPath}" -vf "scale=${sourceCanvasSize}:${sourceCanvasSize}:force_original_aspect_ratio=decrease,zoompan=z='min(zoom+0.0012,1.3)':d=${totalFrames}:x='iw/2-(iw/zoom)/2':y='ih/2-(iw/zoom)/2':s=${targetWidth}x${targetHeight},fps=30" -t ${duration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
              );
            }

            downloadedClips.push(normPath);
            continue;
          }
        } catch (err) {}
      }

      await execPromise(
        `"${ffmpegPath}" -y -f lavfi -i color=c=0x0f172a:s=${targetWidth}x${targetHeight}:r=30 -t ${duration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
      );
      downloadedClips.push(normPath);
    }

    let audioPath = '';
    if (audioUrl) {
      audioPath = path.join(tmpDir, 'voiceover.mp3');
      if (audioUrl.startsWith('data:audio')) {
        const base64Data = audioUrl.split(',')[1];
        fs.writeFileSync(audioPath, Buffer.from(base64Data, 'base64'));
      } else {
        const res = await fetch(audioUrl);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(audioPath, Buffer.from(buffer));
      }
    }

    let bgmPath = '';
    const selectedMood = bgmTrack && BGM_LIBRARY[bgmTrack] ? bgmTrack : 'cinematic';
    const bgmUrl = BGM_LIBRARY[selectedMood];
   
    try {
      const bgmRes = await fetch(bgmUrl);
      if (bgmRes.ok) {
        bgmPath = path.join(tmpDir, 'bgm.mp3');
        const bgmBuffer = await bgmRes.arrayBuffer();
        fs.writeFileSync(bgmPath, Buffer.from(bgmBuffer));
      }
    } catch (err) {}

    const listPath = path.join(tmpDir, 'files.txt');
    const fileListContent = downloadedClips.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listPath, fileListContent, 'utf8');

    const assPath = path.join(tmpDir, 'subtitles.ass');
    generateAssSubtitleFile(shots, assPath, targetWidth, targetHeight, captionColor);

    const outputFileName = `video_${Date.now()}.mp4`;
    const outputPath = path.join(tmpDir, outputFileName);
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}"`;

    if (audioPath && bgmPath) {
      ffmpegCmd += ` -i "${audioPath}" -i "${bgmPath}" -filter_complex "[0:v]subtitles='${escapedAssPath}'[vout];[1:a]volume=1.0[voice];[2:a]volume=0.10[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -crf 26 -b:v 2M -preset fast -c:a aac -b:a 128k "${outputPath}"`;
    } else if (audioPath) {
      ffmpegCmd += ` -i "${audioPath}" -vf "subtitles='${escapedAssPath}'" -c:v libx264 -crf 26 -b:v 2M -preset fast -c:a aac -b:a 128k -shortest "${outputPath}"`;
    } else {
      ffmpegCmd += ` -vf "subtitles='${escapedAssPath}'" -c:v libx264 -crf 26 -b:v 2M -preset fast "${outputPath}"`;
    }

    await execPromise(ffmpegCmd);

    // Read the compiled video from tmp and upload to Supabase Storage bucket 'videos'
    const videoBuffer = fs.readFileSync(outputPath);
    const { data: uploadData, error: uploadError } = await supabase.storage
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

    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (error: any) {
    console.error('Stitch Video Error:', error);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to compile final video.' },
      { status: 500 }
    );
  }
}