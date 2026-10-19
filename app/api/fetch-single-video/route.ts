import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { keyword, niche } = await req.json();
    const apiKey = process.env.PIXABAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'PIXABAY_API_KEY is missing.' }, { status: 500 });
    }

    const query = encodeURIComponent((keyword || niche || 'cinematic background').trim());
    const randomPage = Math.floor(Math.random() * 3) + 1;
    const url = `https://pixabay.com/api/videos/?key=${apiKey}&q=${query}&safesearch=true&order=popular&orientation=vertical&page=${randomPage}&per_page=10`;

    let videoUrl = '';
    let imageUrl = '';

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.hits && data.hits.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(data.hits.length, 6));
        const hit = data.hits[randomIndex];
        videoUrl = hit.videos?.medium?.url || hit.videos?.large?.url || hit.videos?.small?.url || '';
      }
    } catch (e) {}

    // Fallback to image if no video found
    if (!videoUrl) {
      try {
        const imgUrl = `https://pixabay.com/api/?key=${apiKey}&q=${query}&safesearch=true&order=popular&orientation=vertical&page=${randomPage}&per_page=10`;
        const imgRes = await fetch(imgUrl);
        const imgData = await imgRes.json();
        if (imgData.hits && imgData.hits.length > 0) {
          const hit = imgData.hits[0];
          imageUrl = hit.largeImageURL || hit.webformatURL || '';
        }
      } catch (e) {}
    }

    return NextResponse.json({ 
      videoUrl: videoUrl || null, 
      imageUrl: imageUrl || null 
    });
  } catch (error: any) {
    console.error('Fetch Single Video Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch video.' }, { status: 500 });
  }
}