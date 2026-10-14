import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect('http://localhost:3000/dashboard?error=facebook_auth_failed');
  }

  const clientId = process.env.FACEBOOK_CLIENT_ID!;
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET!;
  const redirectUri = 'http://localhost:3000/api/auth/callback/facebook';

  try {
    // 1. Exchange auth code for short-lived User Access Token
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${clientSecret}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) throw new Error(tokenData.error.message);

    const shortLivedToken = tokenData.access_token;

    // 2. Exchange for Long-Lived User Token (valid for ~60 days)
    const longLivedUrl = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;

    const llRes = await fetch(longLivedUrl);
    const llData = await llRes.json();
    const longLivedToken = llData.access_token || shortLivedToken;

    // 3. Fetch user's managed Facebook Pages and Page Access Tokens
    const pagesRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.data && pagesData.data.length > 0) {
      // Loop over managed pages and store connections in Supabase
      for (const page of pagesData.data) {
        await supabase.from('social_connections').upsert(
          {
            platform: 'facebook',
            account_id: page.id,
            account_name: page.name,
            access_token: page.access_token, // Page-level token
            user_access_token: longLivedToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'platform,account_id' }
        );
      }
    }

    return NextResponse.redirect('http://localhost:3000/dashboard?success=facebook_connected');
  } catch (err: any) {
    console.error('Facebook Auth Callback Error:', err.message);
    return NextResponse.redirect('http://localhost:3000/dashboard?error=facebook_token_error');
  }
}