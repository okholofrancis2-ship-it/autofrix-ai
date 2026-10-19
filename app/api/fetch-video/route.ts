import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getSmartKeywords(keywords: string, niche: string = '') {
  // Clean special characters and split into words
  const rawWords = (keywords || niche || 'cinematic background')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2); // Keeps words with 3+ letters (e.g., "car", "dark", "tech")

  // Take up to 3 descriptive words for optimal Pixabay search relevance
  const selected = rawWords.slice(0, 3).join(' ');
  return selected || niche || 'cinematic abstract';
}

export async function POST(req: Request) {
  try {
    const { shots, niche } = await req.json();
    const apiKey = process.env.PIXABAY_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'PIXABAY_API_KEY is missing in your environment variables.' }, { status: 500 });
    }

    if (!shots || !Array.isArray(shots)) {
      return NextResponse.json({ error: 'Invalid payload: shots array is missing.' }, { status: 400 });
    }

    const updatedShots = await Promise.all(
      shots.map(async (shot: any) => {
        const smartQuery = getSmartKeywords(shot.searchKeywords || shot.visualPrompt, niche);
        const encodedQuery = encodeURIComponent(smartQuery);
        const fallbackQuery = encodeURIComponent(niche || 'cinematic background');

        // Helper to query Pixabay video or image endpoints
        const fetchPixabay = async (type: 'video' | 'image', query: string, orientation: string = 'vertical') => {
          const endpoint = type === 'video' ? 'videos/' : '';
          const url = `https://pixabay.com/api/${endpoint}?key=${apiKey}&q=${query}&safesearch=true&order=relevant&orientation=${orientation}&per_page=5`;
          
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const data = await res.json();
            return data.hits && data.hits.length > 0 ? data.hits[0] : null;
          } catch (e) {
            return null;
          }
        };

        let hit = null;
        let videoUrl = '';
        let imageUrl = '';

        // 1. Try vertical video with smart query
        hit = await fetchPixabay('video', encodedQuery, 'vertical');
        // 2. Try all orientations video with smart query
        if (!hit) hit = await fetchPixabay('video', encodedQuery, 'all');
        // 3. Try fallback niche video
        if (!hit) hit = await fetchPixabay('video', fallbackQuery, 'vertical');

        if (hit && hit.videos) {
          videoUrl = hit.videos.medium?.url || hit.videos.large?.url || hit.videos.small?.url || '';
        } else {
          // Fallback to high-quality images if video search yields nothing
          hit = await fetchPixabay('image', encodedQuery, 'vertical');
          if (!hit) hit = await fetchPixabay('image', encodedQuery, 'all');
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