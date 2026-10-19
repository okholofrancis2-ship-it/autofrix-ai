import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateUserId = url.searchParams.get('state'); // Passed as user_id in OAuth flow

    if (!code) {
      return NextResponse.redirect(new URL('/?error=NoCodeProvided', req.url));
    }

    const clientId = process.env.FACEBOOK_CLIENT_ID || '';
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET || '';
    const redirectUri = `${new URL(req.url).origin}/api/auth/callback/facebook`;

    // 1. Exchange code for Facebook Access Token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      throw new Error('Failed to exchange Facebook code for access token.');
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch User Pages & Instagram Accounts
    const accountsRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
    const accountsData = await accountsRes.json();

    let pageId = '';
    let pageName = 'Facebook Page';
    let pageAccessToken = accessToken;
    let instagramAccountId = '';

    if (accountsData.data && accountsData.data.length > 0) {
      const page = accountsData.data[0];
      pageId = page.id;
      pageName = page.name;
      pageAccessToken = page.access_token || accessToken;

      // Check for connected Instagram Business Account
      try {
        const igRes = await fetch(`https://graph.facebook.com/v18.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`);
        const igData = await igRes.json();
        if (igData.instagram_business_account) {
          instagramAccountId = igData.instagram_business_account.id;
        }
      } catch (e) {
        console.error('Failed to fetch IG account:', e);
      }
    }

    // 3. Save to Supabase `social_connections` table
    if (stateUserId) {
      await supabase.from('social_connections').upsert([
        {
          user_id: stateUserId,
          platform: 'facebook',
          account_name: pageName,
          access_token: pageAccessToken,
          page_id: pageId,
          instagram_account_id: instagramAccountId,
          updated_at: new Date().toISOString()
        },
        ...(instagramAccountId ? [{
          user_id: stateUserId,
          platform: 'instagram',
          account_name: `${pageName} (Instagram)`,
          access_token: pageAccessToken,
          page_id: pageId,
          instagram_account_id: instagramAccountId,
          updated_at: new Date().toISOString()
        }] : [])
      ], { onConflict: 'user_id,platform' });
    }

    return NextResponse.redirect(new URL('/?success=SocialConnected', req.url));
  } catch (err: any) {
    console.error('Facebook OAuth Error:', err);
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(err.message)}`, req.url));
  }
}