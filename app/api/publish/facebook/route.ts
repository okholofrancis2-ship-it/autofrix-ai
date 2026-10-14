import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { pageId, message, link } = await req.json();

    if (!pageId || !message) {
      return NextResponse.json({ error: 'Missing pageId or message' }, { status: 400 });
    }

    // Retrieve saved Page Access Token from Supabase
    const { data: conn, error } = await supabase
      .from('social_connections')
      .select('access_token')
      .eq('platform', 'facebook')
      .eq('account_id', pageId)
      .single();

    if (error || !conn) {
      return NextResponse.json({ error: 'Facebook page connection not found' }, { status: 404 });
    }

    // Publish to Page Feed via Graph API
    const postUrl = `https://graph.facebook.com/v20.0/${pageId}/feed`;
    const bodyParams: Record<string, string> = {
      message,
      access_token: conn.access_token,
    };

    if (link) {
      bodyParams.link = link;
    }

    const fbRes = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyParams),
    });

    const result = await fbRes.json();

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, postId: result.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}