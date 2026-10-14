import { NextResponse } from 'next/server';


export async function POST(req: Request) {
  try {
    const { seriesName, niche, tone, duration, publishTime, customPrompt } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;


    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is missing in your .env.local file.' },
        { status: 500 }
      );
    }


    const prompt = `You are an expert short-form viral scriptwriter for TikTok, Reels, and YouTube Shorts.
Create a high-retention cinematic script and shot list.


Series Name: ${seriesName || 'Viral Story'}
Niche: ${niche}
Tone: ${tone}
Target Duration: ${duration}
Publish Time: ${publishTime}
Custom Topic: ${customPrompt || 'Create a compelling narrative with a powerful hook.'}


CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON with no markdown formatting or backticks.
2. "searchKeywords" must be HIGHLY SPECIFIC, concrete visual descriptions for stock media search (e.g. "bloodstained old paper envelope", "dusty antique wooden chest in dark attic", "abandoned coastal lighthouse at night", "glowing neon billboard in rain city"). NEVER use single generic words like "house" or "street".


Follow this exact JSON structure:
{
  "script": "Full continuous narration script here...",
  "shots": [
    {
      "shotNumber": 1,
      "narration": "First sentence spoken in voiceover...",
      "visualPrompt": "Detailed cinematic visual description...",
      "searchKeywords": "bloodstained old paper envelope",
      "durationSeconds": 5
    }
  ]
}`;


    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'olodo-ai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
      }),
    });


    const data = await response.json();


    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenRouter API call failed.');
    }


    let rawContent = data.choices?.[0]?.message?.content || '';
    rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();


    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI output could not be parsed as JSON.');
    }


    const parsed = JSON.parse(jsonMatch[0]);


    return NextResponse.json({
      script: parsed.script || '',
      shots: parsed.shots || [],
    });
  } catch (error: any) {
    console.error('Generate Script Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate script.' },
      { status: 500 }
    );
  }
}

