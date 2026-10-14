import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execPromise = promisify(exec);

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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olodo-autopilot-'));

  try {
    const body = await req.json();
    const { seriesName, niche, tone, duration, publishTime, customPrompt, voice, aspectRatio, bgmTrack, captionColor } = body;
    const origin = req.headers.get('origin') || 'http://localhost:3000';

    // 1. GENERATE SCRIPT & SHOTS VIA OPENROUTER
    const scriptRes = await fetch(`${origin}/api/generate-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seriesName, niche, tone, duration, publishTime, customPrompt })
    });
    const scriptData = await scriptRes.json();
    if (!scriptRes.ok) throw new Error(scriptData.error || 'Auto-pilot script generation failed.');
    
    const script = scriptData.script;
    let shots: Shot[] = scriptData.shots || [];

    // 2. GENERATE VOICEOVER AUDIO
    const voiceRes = await fetch(`${origin}/api/generate-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, voice: voice || 'en-US-JennyNeural' })
    });
    const voiceData = await voiceRes.json();
    if (!voiceRes.ok) throw new Error(voiceData.error || 'Auto-pilot voiceover synthesis failed.');
    const audioUrl = voiceData.audioUrl;

    // 3. FETCH VIDEO CLIPS VIA PIXABAY
    const videoRes = await fetch(`${origin}/api/fetch-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shots })
    });
    const videoData = await videoRes.json();
    if (!videoRes.ok) throw new Error(videoData.error || 'Auto-pilot video clip fetching failed.');
    shots = videoData.shots || shots;

    // 4. DOWNLOAD VOICEOVER & PROBE EXACT AUDIO DURATION
    let audioPath = '';
    let totalAudioDuration = 0;
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

      try {
        const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        totalAudioDuration = parseFloat(stdout.trim());
      } catch (err) {}
    }

    // 5. MATCH SHOT DURATIONS EXACTLY TO AUDIO LENGTH
    if (totalAudioDuration > 2 && shots.length > 0) {
      const durationPerShot = totalAudioDuration / shots.length;
      shots = shots.map((s) => ({ ...s, durationSeconds: durationPerShot }));
    }

    let targetWidth = 1080;
    let targetHeight = 1920;
    if (aspectRatio === '16:9') { targetWidth = 1920; targetHeight = 1080; }
    else if (aspectRatio === '1:1') { targetWidth = 1080; targetHeight = 1080; }

    const downloadedClips: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const mediaUrl = shot.videoUrl || shot.imageUrl;
      const clipDuration = shot.durationSeconds || 5;
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
                `ffmpeg -y -i "${clipPath}" -t ${clipDuration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},fps=30" -c:v libx264 -preset ultrafast -an "${normPath}"`
              );
            } else {
              const totalFrames = clipDuration * 30;
              const sourceCanvasSize = Math.max(targetWidth, targetHeight) * 2;
              await execPromise(
                `ffmpeg -y -loop 1 -i "${clipPath}" -vf "scale=${sourceCanvasSize}:${sourceCanvasSize}:force_original_aspect_ratio=decrease,zoompan=z='min(zoom+0.0012,1.3)':d=${totalFrames}:x='iw/2-(iw/zoom)/2':y='ih/2-(iw/zoom)/2':s=${targetWidth}x${targetHeight},fps=30" -t ${clipDuration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
              );
            }
            downloadedClips.push(normPath);
            continue;
          }
        } catch (err) {}
      }

      await execPromise(
        `ffmpeg -y -f lavfi -i color=c=0x0f172a:s=${targetWidth}x${targetHeight}:r=30 -t ${clipDuration} -c:v libx264 -preset ultrafast -pix_fmt yuv420p "${normPath}"`
      );
      downloadedClips.push(normPath);
    }

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
    generateAssSubtitleFile(shots, assPath, targetWidth, targetHeight, captionColor || 'yellow');

    const publicDir = path.join(process.cwd(), 'public', 'exports');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    const outputFileName = `autopilot_${Date.now()}.mp4`;
    const outputPath = path.join(publicDir, outputFileName);
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    let ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}"`;
    if (audioPath && bgmPath) {
      ffmpegCmd += ` -i "${audioPath}" -i "${bgmPath}" -filter_complex "[0:v]subtitles='${escapedAssPath}'[vout];[1:a]volume=1.0[voice];[2:a]volume=0.10[bgm];[voice][bgm]amix=inputs=2:duration=first[aout]" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -c:a aac -shortest "${outputPath}"`;
    } else if (audioPath) {
      ffmpegCmd += ` -i "${audioPath}" -vf "subtitles='${escapedAssPath}'" -c:v libx264 -preset fast -c:a aac -shortest "${outputPath}"`;
    } else {
      ffmpegCmd += ` -vf "subtitles='${escapedAssPath}'" -c:v libx264 -preset fast "${outputPath}"`;
    }

    await execPromise(ffmpegCmd);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return NextResponse.json({
      url: `/exports/${outputFileName}`,
      script,
      shots,
      audioUrl
    });
  } catch (error: any) {
    console.error('Auto-Pilot Error:', error);
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    return NextResponse.json({ error: error?.message || 'Auto-pilot pipeline failed.' }, { status: 500 });
  }
}