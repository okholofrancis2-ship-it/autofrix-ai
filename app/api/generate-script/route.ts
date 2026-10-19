import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface Shot {
  shotNumber: number;
  narration: string;
  visualPrompt: string;
  searchKeywords: string;
  durationSeconds: number;
}

// Bulletproof JSON extractor that handles markdown code blocks and conversational text
function extractAndParseJSON(rawContent: string) {
  try {
    return JSON.parse(rawContent);
  } catch (e) {
    let cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonSubstring = cleaned.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSubstring);
      }
      throw new Error('Could not parse AI JSON response.');
    }
  }
}

export async function POST(req: Request) {
  try {
    const { seriesName, niche, tone, duration, publishTime, customPrompt } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY is missing in your environment variables.' },
        { status: 500 }
      );
    }

    const systemPrompt = `You are an expert short-form viral scriptwriter for TikTok, Reels, and YouTube Shorts.
Create a high-retention cinematic script and shot list.
You MUST return ONLY a valid JSON object with no markdown formatting or backticks.

CRITICAL REQUIREMENTS:
1. "searchKeywords" must be HIGHLY SPECIFIC, concrete visual descriptions for stock media search (e.g. "bloodstained old paper envelope", "dusty antique wooden chest in dark attic", "abandoned coastal lighthouse at night", "glowing neon billboard in rain city"). NEVER use single generic words like "house" or "street".

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

    const userPrompt = `Series Name: ${seriesName || 'Viral Story'}
Niche: ${niche || 'True Crime & Mystery'}
Tone: ${tone || 'Dramatic, Suspenseful & Intense'}
Target Duration: ${duration || '30-40 seconds (Standard Reel)'}
Publish Time: ${publishTime || '04:30 PM'}
Custom Topic: ${customPrompt || 'Create a compelling narrative with a powerful hook.'}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Autofrix AI',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/free', // Uses OpenRouter's free auto-router at $0 cost
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenRouter API call failed.');
    }

    const rawContent = data.choices?.[0]?.message?.content || '{}';
    const parsed = extractAndParseJSON(rawContent);

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