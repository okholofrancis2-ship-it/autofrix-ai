import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const origin = new URL(request.url).origin;

  // Dynamically resolve redirect URI to match exact string configured in TikTok Portal
  let redirectUri = `${origin}/api/auth/callback/tiktok`;
  if (origin.includes('localhost')) {
    redirectUri = 'http://127.0.0.1:3000/api/auth/callback/tiktok';
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('hex');

  // CSRF state token
  const csrfState = crypto.randomBytes(16).toString('hex');

  // Build TikTok OAuth authorization URL
  const tiktokAuthUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  tiktokAuthUrl.searchParams.set('client_key', clientKey || '');
  tiktokAuthUrl.searchParams.set('scope', 'user.info.basic,video.publish,video.upload');
  tiktokAuthUrl.searchParams.set('response_type', 'code');
  tiktokAuthUrl.searchParams.set('redirect_uri', redirectUri);
  tiktokAuthUrl.searchParams.set('state', csrfState);
  tiktokAuthUrl.searchParams.set('code_challenge', codeChallenge);
  tiktokAuthUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(tiktokAuthUrl.toString());

  // Store code_verifier in an HTTP-only cookie for PKCE validation in callback
  response.cookies.set('tiktok_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}