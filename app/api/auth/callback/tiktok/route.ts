import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const codeVerifier = request.cookies.get('tiktok_code_verifier')?.value;

  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', request.url));
  }

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const origin = new URL(request.url).origin;

    // Maintain exact matching redirect URI configured in TikTok Portal
    let redirectUri = `${origin}/api/auth/callback/tiktok`;
    if (origin.includes('localhost')) {
      redirectUri = 'http://127.0.0.1:3000/api/auth/callback/tiktok';
    }

    const tokenParams = new URLSearchParams({
      client_key: clientKey || '',
      client_secret: clientSecret || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    if (codeVerifier) {
      tokenParams.append('code_verifier', codeVerifier);
    }

    // Exchange authorization code for access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('TikTok Token Exchange Error:', tokenData);
      return NextResponse.redirect(new URL('/?error=tiktok_token_failed', request.url));
    }

    // Fetch user profile info
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userRes.json();
    const tiktokUser = userData?.data?.user || {};
    const accountName = tiktokUser.display_name || 'TikTok User';
    const avatarUrl = tiktokUser.avatar_url || 'https://www.svgrepo.com/show/452114/tiktok.svg';
    const userId = state && state !== 'undefined' ? state : null;

    // Check if a connection for this platform already exists
    let existingQuery = supabase.from('social_connections').select('id').eq('platform', 'tiktok');
    if (userId) {
      existingQuery = existingQuery.eq('user_id', userId);
    }
    const { data: existingRecords } = await existingQuery;

    let dbError = null;

    if (existingRecords && existingRecords.length > 0) {
      // Update existing connection
      const { error } = await supabase
        .from('social_connections')
        .update({
          account_name: accountName,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRecords[0].id);
      dbError = error;
    } else {
      // Insert new connection
      const { error } = await supabase
        .from('social_connections')
        .insert([
          {
            user_id: userId,
            platform: 'tiktok',
            account_name: accountName,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || null,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
        ]);
      dbError = error;
    }

    if (dbError) {
      console.error('Supabase Connection Error:', dbError);
      return NextResponse.redirect(new URL('/?error=db_insert_failed', request.url));
    }

    const response = NextResponse.redirect(new URL('/?connected=tiktok', request.url));
    response.cookies.delete('tiktok_code_verifier');
    return response;
  } catch (err: any) {
    console.error('TikTok OAuth Callback Error:', err);
    return NextResponse.redirect(new URL('/?error=tiktok_callback_exception', request.url));
  }
}