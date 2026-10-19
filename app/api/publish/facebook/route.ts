import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { videoUrl, caption, userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    // Fetch connected Facebook/Instagram account tokens for user
    const { data: accounts, error: dbError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .in('platform', ['facebook', 'instagram']);

    if (dbError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'No connected Facebook or Instagram accounts found for this user.' }, { status: 400 });
    }

    const results = [];

    for (const acc of accounts) {
      const accessToken = acc.access_token;
      const pageId = acc.page_id;
      const igId = acc.instagram_account_id;

      if (acc.platform === 'facebook' && pageId) {
        // Publish video to Facebook Page Feed
        const fbRes = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: videoUrl,
            description: caption,
            access_token: accessToken
          })
        });
        const fbData = await fbRes.json();
        results.push({ platform: 'facebook', success: fbRes.ok, data: fbData });
      } else if (acc.platform === 'instagram' && igId) {
        // Publish video to Instagram Reels via Graph API
        const containerRes = await fetch(`https://graph.facebook.com/v18.0/${igId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'REELS',
            video_url: videoUrl,
            caption: caption,
            access_token: accessToken
          })
        });
        const containerData = await containerRes.json();

        if (containerData.id) {
          // Publish container
          const publishRes = await fetch(`https://graph.facebook.com/v18.0/${igId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              creation_id: containerData.id,
              access_token: accessToken
            })
          });
          const publishData = await publishRes.json();
          results.push({ platform: 'instagram', success: publishRes.ok, data: publishData });
        } else {
          results.push({ platform: 'instagram', success: false, data: containerData });
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Publish Facebook/Instagram Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to auto-publish video.' }, { status: 500 });
  }
}