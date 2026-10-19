import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getSmartKeywords(keywords: string, niche: string = '', index: number = 0) {
  const rawWords = (keywords || niche || 'cinematic abstract')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  const selected = rawWords.slice(0, 3).join(' ');
  return selected || niche || 'cinematic background';
}

export async function POST(req: Request) {
  try {
    const { shots, niche } = await req.json();
    const apiKey = process.env.PIXABAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'PIXABAY_API_KEY is missing.' }, { status: 500 });
    }

    if (!shots || !Array.isArray(shots)) {
      return NextResponse.json({ error: 'Invalid payload: shots array is missing.' }, { status: 400 });
    }

    const updatedShots = await Promise.all(
      shots.map(async (shot: any, index: number) => {
        const smartQuery = encodeURIComponent(getSmartKeywords(shot.searchKeywords || shot.visualPrompt, niche, index));
        const fallbackQuery = encodeURIComponent(niche || 'cinematic background');

        const fetchPixabay = async (type: 'video' | 'image', query: string, orientation: string = 'vertical') => {
          const endpoint = type === 'video' ? 'videos/' : '';
          const randomPage = Math.floor(Math.random() * 3) + 1;
          const url = `https://pixabay.com/api/${endpoint}?key=${apiKey}&q=${query}&safesearch=true&order=popular&orientation=${orientation}&page=${randomPage}&per_page=10`;
          
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            if (data.hits && data.hits.length > 0) {
              const randomIndex = Math.floor(Math.random() * Math.min(data.hits.length, 6));
              return data.hits[randomIndex];
            }
            return null;
          } catch (e) {
            return null;
          }
        };

        let hit = null;
        let videoUrl = '';
        let imageUrl = '';

        hit = await fetchPixabay('video', smartQuery, 'vertical');
        if (!hit) hit = await fetchPixabay('video', smartQuery, 'all');
        if (!hit) hit = await fetchPixabay('video', fallbackQuery, 'vertical');

        if (hit && hit.videos) {
          videoUrl = hit.videos.medium?.url || hit.videos.large?.url || hit.videos.small?.url || '';
        } else {
          hit = await fetchPixabay('image', smartQuery, 'vertical');
          if (!hit) hit = await fetchPixabay('image', smartQuery, 'all');
          if (!hit) hit = await fetchPixabay('image', fallbackQuery, 'vertical');

          if (hit) {
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