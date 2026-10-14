import { NextResponse } from 'next/server';

const AZURE_VOICE_MAP: Record<string, string> = {
  // Technical / Fallback keys
  'kore_us': 'en-US-JennyNeural',
  'aoede_ca': 'en-CA-ClaraNeural',
  'lucia_es': 'es-ES-ElviraNeural',
  'chloe_fr': 'fr-FR-DeniseNeural',
  'puck_gb': 'en-GB-RyanNeural',
  'charon_au': 'en-AU-WilliamNeural',
  'fenrir_in': 'en-IN-PrabhatNeural',
};

// Converts characters that break Azure's SSML XML parser
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawScript = body.script || body.text || '';
    const voiceChoice = body.voice || 'en-US-JennyNeural';

    if (!rawScript.trim()) {
      return NextResponse.json({ error: 'No script text was provided.' }, { status: 400 });
    }

    const apiKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;

    if (!apiKey || !region) {
      return NextResponse.json(
        { error: 'AZURE_SPEECH_KEY or AZURE_SPEECH_REGION is missing in .env.local' },
        { status: 500 }
      );
    }

    // Use the voice choice directly (since frontend sends 'en-US-GuyNeural'), 
    // or fallback to the map/default if it's an old legacy key.
    const selectedVoice = AZURE_VOICE_MAP[voiceChoice] || voiceChoice;

    // Dynamically extract the language code for the XML tag (e.g., 'en-GB' from 'en-GB-RyanNeural')
    const langMatch = selectedVoice.match(/^[a-z]{2}-[A-Z]{2}/);
    const xmlLang = langMatch ? langMatch[0] : 'en-US';

    // Strip visual cues and formatting
    const cleanedText = rawScript
      .replace(/\[Visual:[\s\S]*?\]/gi, '')
      .replace(/\[Audio:[\s\S]*?\]/gi, '')
      .replace(/\*\*.*?\*\*/g, '')
      .replace(/#+/g, '')
      .replace(/VO\s*.*?:/gi, '')
      .trim();

    // XML-escape the text to prevent 400 Bad Request errors
    const spokenText = escapeXml(cleanedText);

    // SSML Payload with dynamic region code and selected voice
    const ssml = `<speak version='1.0' xml:lang='${xmlLang}'><voice name='${selectedVoice}'>${spokenText}</voice></speak>`;

    const azureUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const response = await fetch(azureUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'OlodoAI',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Azure API Error (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');
    const audioDataUrl = `data:audio/mp3;base64,${base64Audio}`;

    return NextResponse.json({ audioUrl: audioDataUrl });
  } catch (error: any) {
    console.error('Azure Voiceover Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate voice using Azure Speech.' },
      { status: 500 }
    );
  }
}