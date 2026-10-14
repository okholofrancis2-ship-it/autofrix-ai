import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const userId = searchParams.get('state');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing YouTube OAuth Credentials');
      return NextResponse.redirect(new URL('/?error=missing_credentials', request.url));
    }

    // 1. Exchange code for OAuth tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'http://localhost:3000/api/auth/callback/youtube',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error('Token Exchange Error:', tokens);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    // 2. Fetch YouTube Channel details
    let channelName = 'YouTube Channel';
    let avatarUrl = 'https://www.svgrepo.com/show/13671/youtube.svg';

    try {
      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const channelData = await channelRes.json();
      if (channelData.items?.[0]?.snippet) {
        channelName = channelData.items[0].snippet.title || channelName;
        avatarUrl = channelData.items[0].snippet.thumbnails?.default?.url || avatarUrl;
      }
    } catch (e) {
      console.warn('Could not fetch channel profile, using defaults:', e);
    }

    // 3. Foolproof save: Delete old record for youtube, then insert fresh
    await supabase.from('social_connections').delete().eq('platform', 'youtube');

    const { error: insertError } = await supabase.from('social_connections').insert({
      user_id: userId || null,
      platform: 'youtube',
      account_name: channelName,
      avatar_url: avatarUrl,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      status: 'active',
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('Supabase Insert Error:', insertError);
      return NextResponse.redirect(new URL('/?error=db_insert_failed', request.url));
    }

    return NextResponse.redirect(new URL('/?connected=youtube', request.url));
  } catch (error) {
    console.error('Callback Server Error:', error);
    return NextResponse.redirect(new URL('/?error=server_error', request.url));
  }
}