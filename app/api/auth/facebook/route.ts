import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.FACEBOOK_CLIENT_ID;
  const redirectUri = 'http://localhost:3000/api/auth/callback/facebook';

  // Base scopes for Facebook Pages
  const scope = ['public_profile', 'pages_show_list', 'pages_manage_posts'].join(',');

  const fbAuthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=${scope}&response_type=code`;

  return NextResponse.redirect(fbAuthUrl);
}