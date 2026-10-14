import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { platform, accessToken, pageId, instagramAccountId, videoUrl, caption, title, tags } = await req.json();

    if (!accessToken || !videoUrl) {
      return NextResponse.json({ error: 'Missing access token or video URL.' }, { status: 400 });
    }

    const publicVideoUrl = videoUrl.startsWith('http') ? videoUrl : `${new URL(req.url).origin}${videoUrl}`;

    if (platform === 'tiktok') {
      const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title: caption || title || 'Viral Video #fyp #autofrixai',
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: publicVideoUrl,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'TikTok publishing failed.');
      return NextResponse.json({ success: true, platform: 'tiktok', data });
    } 
    
    else if (platform === 'youtube') {
      const shortTitle = (title || 'Viral Short') + ' #Shorts #autofrixai';
      const metadata = {
        snippet: {
          title: shortTitle,
          description: caption || 'Automated cinematic short created with Autofrix AI.',
          tags: tags || ['shorts', 'viral', 'autofrixai'],
          categoryId: '24',
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      };

      const uploadInitRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
        },
        body: JSON.stringify(metadata),
      });

      const uploadSessionUri = uploadInitRes.headers.get('Location');
      if (!uploadSessionUri) throw new Error('Failed to initialize YouTube upload session.');

      const videoRes = await fetch(publicVideoUrl);
      const videoBuffer = await videoRes.arrayBuffer();

      const uploadRes = await fetch(uploadSessionUri, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(videoBuffer.byteLength),
        },
        body: videoBuffer,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error?.message || 'YouTube upload failed.');
      return NextResponse.json({ success: true, platform: 'youtube', data: uploadData });
    }

    else if (platform === 'instagram' || platform === 'facebook') {
      const targetId = platform === 'instagram' ? instagramAccountId : pageId;
      if (!targetId) throw new Error(`Missing ${platform === 'instagram' ? 'Instagram Account ID' : 'Facebook Page ID'}.`);

      const containerRes = await fetch(`https://graph.facebook.com/v18.0/${targetId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: publicVideoUrl,
          caption: caption || title || 'Automated Reel via Autofrix AI #reels #autofrixai',
          access_token: accessToken,
        }),
      });

      const containerData = await containerRes.json();
      if (!containerRes.ok || !containerData.id) {
        throw new Error(containerData.error?.message || `Failed to create ${platform} media container.`);
      }

      const creationId = containerData.id;

      const publishRes = await fetch(`https://graph.facebook.com/v18.0/${targetId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
      });

      const publishData = await publishRes.json();
      if (!publishRes.ok) throw new Error(publishData.error?.message || `Failed to publish ${platform} reel.`);

      return NextResponse.json({ success: true, platform, data: publishData });
    }

    return NextResponse.json({ error: 'Unsupported publishing platform.' }, { status: 400 });
  } catch (err: any) {
    console.error('Publishing Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to publish video.' }, { status: 500 });
  }
}