import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSeriesProcess(req: Request, specificSeriesId?: string) {
  let query = supabase.from('series_automation').select('*').eq('is_active', true);
  
  if (specificSeriesId) {
    query = query.eq('id', specificSeriesId);
  }

  const { data: activeSeries, error } = await query;

  if (error) throw error;
  if (!activeSeries || activeSeries.length === 0) {
    return { message: 'No active series to run at this time.' };
  }

  const origin = new URL(req.url).origin;
  const results = [];

  for (const series of activeSeries) {
    const lastRun = series.last_run_at ? new Date(series.last_run_at).getTime() : 0;
    const intervalMs = (series.frequency_hours || 24) * 3600 * 1000;
    const now = Date.now();

    if (specificSeriesId || (now - lastRun >= intervalMs)) {
      try {
        // 1. Trigger real auto-pilot generation (with extended timeout handling)
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
          }),
          // Pass signal or allow extended execution
        });

        const autoPilotData = await autoPilotRes.json();

        if (autoPilotRes.ok && autoPilotData.url) {
          // 2. Fetch connected social accounts for this user
          const { data: socialAccounts } = await supabase
            .from('social_connections')
            .select('*')
            .eq('user_id', series.user_id);

          const publishingResults = [];
          
          if (socialAccounts && socialAccounts.length > 0) {
            // Filter accounts by the series' target platforms checkboxes
            const targetPlatforms: string[] = series.target_platforms || ['facebook', 'youtube', 'tiktok', 'instagram'];
            const filteredAccounts = socialAccounts.filter(acc => 
              targetPlatforms.includes(acc.platform?.toLowerCase())
            );

            for (const acc of filteredAccounts) {
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

          // 3. Update last run timestamp in database
          await supabase
            .from('series_automation')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', series.id);

          results.push({ seriesId: series.id, status: 'success', videoUrl: autoPilotData.url, publishingResults });
        } else {
          results.push({ seriesId: series.id, status: 'failed', error: autoPilotData.error || 'Auto-pilot generation failed' });
        }
      } catch (genErr: any) {
        results.push({ seriesId: series.id, status: 'failed', error: genErr.message });
      }
    }
  }

  return { success: true, executedCount: results.length, results };
}

export async function GET(req: Request) {
  try {
    const data = await runSeriesProcess(req);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Cron Worker GET Error:', err);
    return NextResponse.json({ error: err.message || 'Cron execution failed.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { seriesId } = body;
    const data = await runSeriesProcess(req, seriesId);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Cron Worker POST Error:', err);
    return NextResponse.json({ error: err.message || 'Cron execution failed.' }, { status: 500 });
  }
}