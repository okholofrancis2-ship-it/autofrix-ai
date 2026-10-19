import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSeriesRun(series: any, origin: string) {
  // 1. Generate video via auto-pilot API
  const autoPilotRes = await fetch(`${origin}/api/auto-pilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesName: series.series_name,
      niche: series.niche,
      tone: series.tone,
      voice: series.voice,
      aspectRatio: series.aspect_ratio || '9:16',
      bgmTrack: series.bgm_track || 'cinematic',
      captionColor: series.caption_color || 'yellow',
      duration: series.duration || '30-40 seconds (Standard Reel)',
      customPrompt: series.custom_prompt || `An amazing viral episode about ${series.niche}`
    })
  });

  const autoPilotData = await autoPilotRes.json();
  if (!autoPilotRes.ok || !autoPilotData.url) {
    throw new Error(autoPilotData.error || 'Auto-pilot video generation failed.');
  }

  // 2. Fetch connected social accounts and auto-publish
  const { data: socialAccounts } = await supabase
    .from('social_connections')
    .select('*')
    .eq('user_id', series.user_id);

  const publishingResults = [];
  const targetPlatforms = series.target_platforms || ['facebook', 'youtube', 'tiktok', 'instagram'];

  if (socialAccounts && socialAccounts.length > 0) {
    for (const acc of socialAccounts) {
      if (!targetPlatforms.includes(acc.platform)) continue;
      try {
        const pubRes = await fetch(`${origin}/api/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: acc.platform,
            accessToken: acc.access_token,
            pageId: acc.page_id,
            instagramAccountId: acc.instagram_account_id,
            videoUrl: autoPilotData.url,
            caption: `Episode: ${series.series_name} #shorts #viral #${series.niche.toLowerCase().replace(/[^a-z]/g, '')}`
          })
        });
        const pubData = await pubRes.json();
        publishingResults.push({ platform: acc.platform, success: pubRes.ok, data: pubData });
      } catch (pubErr: any) {
        publishingResults.push({ platform: acc.platform, success: false, error: pubErr.message });
      }
    }
  }

  // 3. Update last run timestamp
  await supabase
    .from('series_automation')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', series.id);

  return { seriesId: series.id, status: 'success', videoUrl: autoPilotData.url, publishingResults };
}

// GET: Automated Cron Job (Checks all active series based on frequency)
export async function GET(req: Request) {
  try {
    const { data: activeSeries, error } = await supabase
      .from('series_automation')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!activeSeries || activeSeries.length === 0) {
      return NextResponse.json({ message: 'No active series to run at this time.' });
    }

    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${protocol}://${host}`;

    const results = [];
    const now = Date.now();

    for (const series of activeSeries) {
      const lastRun = series.last_run_at ? new Date(series.last_run_at).getTime() : 0;
      const intervalMs = (series.frequency_hours || 24) * 3600 * 1000;

      if (now - lastRun >= intervalMs) {
        try {
          const res = await executeSeriesRun(series, origin);
          results.push(res);
        } catch (err: any) {
          results.push({ seriesId: series.id, status: 'failed', error: err.message });
        }
      }
    }

    return NextResponse.json({ success: true, executedCount: results.length, results });
  } catch (err: any) {
    console.error('Cron Worker Error:', err);
    return NextResponse.json({ error: err.message || 'Cron execution failed.' }, { status: 500 });
  }
}

// POST: Manual Trigger from Dashboard ("Run Now" button)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { seriesId } = body;

    if (!seriesId) {
      return NextResponse.json({ error: 'seriesId is required for manual trigger.' }, { status: 400 });
    }

    const { data: series, error } = await supabase
      .from('series_automation')
      .select('*')
      .eq('id', seriesId)
      .single();

    if (error || !series) {
      return NextResponse.json({ error: 'Series not found.' }, { status: 404 });
    }

    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${protocol}://${host}`;

    const result = await executeSeriesRun(series, origin);
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    console.error('Manual Series Run Error:', err);
    return NextResponse.json({ error: err.message || 'Manual execution failed.' }, { status: 500 });
  }
}