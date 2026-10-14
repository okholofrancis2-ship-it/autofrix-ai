import { NextResponse } from 'next/server';

function getSimplifiedKeywords(keywords: string) {
  const words = keywords
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);
  return words.slice(0, 2).join(' ');
}

export async function POST(req: Request) {
  try {
    const { shots } = await req.json();
    const apiKey = process.env.PIXABAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'PIXABAY_API_KEY is missing in your .env.local file.' }, { status: 500 });
    }

    if (!shots || !Array.isArray(shots)) {
      return NextResponse.json({ error: 'Invalid payload: shots array is missing.' }, { status: 400 });
    }

    const updatedShots = await Promise.all(
      shots.map(async (shot: any) => {
        const rawKeywords = shot.searchKeywords || 'cinematic dark';
        const exactQuery = encodeURIComponent(rawKeywords);
        const simplifiedQuery = encodeURIComponent(getSimplifiedKeywords(rawKeywords)) || exactQuery;
        
        // Helper to query either video or image endpoints
        const fetchPixabay = async (type: 'video' | 'image', query: string, orientation: string = 'vertical') => {
          const endpoint = type === 'video' ? 'videos/' : '';
          const url = `https://pixabay.com/api/${endpoint}?key=${apiKey}&q=${query}&safesearch=true&order=relevant&orientation=${orientation}&per_page=3`;
          
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data.hits && data.hits.length > 0 ? data.hits[0] : null;
          } catch (e) {
            return null;
          }
        };

        // 1. Try fetching videos first
        let hit = await fetchPixabay('video', exactQuery, 'vertical');
        if (!hit) hit = await fetchPixabay('video', simplifiedQuery, 'vertical');
        if (!hit) hit = await fetchPixabay('video', simplifiedQuery, 'all');

        let videoUrl = '';
        let imageUrl = '';

        if (hit && hit.videos) {
          // Found a video
          videoUrl = hit.videos.medium?.url || hit.videos.large?.url || hit.videos.small?.url || '';
        } else {
          // 2. If no video, fall back to fetching images
          hit = await fetchPixabay('image', exactQuery, 'vertical');
          if (!hit) hit = await fetchPixabay('image', simplifiedQuery, 'vertical');
          if (!hit) hit = await fetchPixabay('image', simplifiedQuery, 'all');
          
          if (hit) {
            // Found an image
            imageUrl = hit.largeImageURL || hit.webformatURL || '';
          }
        }

        return {
          ...shot,
          videoUrl: videoUrl || null,
          imageUrl: imageUrl || null,
        };
      })
    );

    return NextResponse.json({ shots: updatedShots });
  } catch (error: any) {
    console.error('Fetch Media Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch media clips.' }, { status: 500 });
  }
}