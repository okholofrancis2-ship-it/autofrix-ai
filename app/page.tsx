'use client';



import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createClient, type User } from '@supabase/supabase-js';



const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const supabase = createClient(

supabaseUrl || 'https://placeholder.supabase.co',

supabaseAnonKey || 'placeholder-anon-key',

);



interface Shot {

shotNumber: number;

narration: string;

visualPrompt: string;

searchKeywords: string;

durationSeconds: number;

videoUrl?: string | null;

imageUrl?: string | null;

url?: string | null;

}



interface HistoryItem {

id: string;

created_at?: string;

series_name: string;

niche: string;

script: string;

shots: Shot[];

audio_url?: string | null;

}



interface SeriesItem {

id: string;

series_name: string;

niche: string;

tone: string;

voice: string;

duration: string;

aspect_ratio: string;

bgm_track: string;

caption_color: string;

frequency_hours: number;

target_platforms?: string[];

custom_prompt?: string;

is_active: boolean;

last_run_at?: string;

}



interface SocialAccount {

id: string;

platform: string;

account_name: string;

avatar_url?: string;

status?: string;

}



type AppMode = 'autopilot' | 'series' | 'social' | 'manual';

type AuthView = 'signin' | 'signup' | 'forgot' | 'reset';

type ProfilePanel = 'overview' | 'settings' | 'security' | 'help';



const inputClass =

'w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-200';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-600';

const panelClass = 'space-y-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 md:p-8';



const niches = [

'True Crime & Mystery',

'Scary Stories & Horror',

'Fun Facts & Curiosities',

'Motivational & Mindset',

'Sci-Fi & Tech Explanations',

'Historical Untold Facts',

'Luxury, Wealth & Success',

'Business, Money & Investing',

'Health, Fitness & Longevity',

'Philosophy & Stoicism',

'Anime, Gaming & Pop Culture',

'Daily Life Hacks & Productivity',

];

const tones = [

'Dramatic, Suspenseful & Intense',

'Energetic & Fast-Paced (Viral Hook)',

'Calm, Deep & Storytelling',

'Humorous, Sarcastic & Witty',

'Epic, Cinematic & Inspiring',

'Dark, Whispering & Mysterious',

'Educational, Authoritative & Clear',

'Controversial & Thought-Provoking',

];

const voices = [

{ group: 'United States', options: [['en-US-JennyNeural', 'Jenny (US Female)'], ['en-US-GuyNeural', 'Guy (US Male)'], ['en-US-AriaNeural', 'Aria (US Female)'], ['en-US-ChristopherNeural', 'Christopher (US Male)']] },

{ group: 'United Kingdom', options: [['en-GB-SoniaNeural', 'Sonia (UK Female)'], ['en-GB-RyanNeural', 'Ryan (UK Male)']] },

{ group: 'Australia & Regional', options: [['en-AU-NatashaNeural', 'Natasha (Australian Female)'], ['en-AU-WilliamNeural', 'William (Australian Male)'], ['en-NG-EzinneNeural', 'Ezinne (Nigerian Female)'], ['en-NG-AbeoNeural', 'Abeo (Nigerian Male)']] },

];

const platforms = [

{ id: 'facebook', label: '📘 Facebook' },

{ id: 'youtube', label: '🔴 YouTube' },

{ id: 'tiktok', label: '🎵 TikTok' },

{ id: 'instagram', label: '📸 Instagram' },

];



async function readResponse<T = Record<string, unknown>>(response: Response): Promise<T> {

const text = await response.text();

let data: any = {};

try {

data = text ? JSON.parse(text) : {};

} catch {

data = { error: text || 'The server returned an invalid response.' };

}

if (!response.ok) {

throw new Error(data?.error || data?.message || `Request failed (${response.status}).`);

}

return data as T;

}



function Spinner({ label }: { label?: string }) {

return (

<span className="inline-flex items-center justify-center gap-2">

<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">

<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />

<path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />

</svg>

{label || 'Working…'}

</span>

);

}



function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {

return <div className={className}><label className={labelClass}>{label}</label>{children}</div>;

}



function SelectField({

label,

value,

onChange,

options,

}: {

label: string;

value: string;

onChange: (value: string) => void;

options: Array<[string, string]>;

}) {

return (

<Field label={label}>

<select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>

{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}

</select>

</Field>

);

}



export default function Home() {

const [appMode, setAppMode] = useState<AppMode>('autopilot');

const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);



// Authentication

const [user, setUser] = useState<User | null>(null);

const [authView, setAuthView] = useState<AuthView>('signin');

const [authEmail, setAuthEmail] = useState('');

const [authPassword, setAuthPassword] = useState('');

const [newPassword, setNewPassword] = useState('');

const [authLoading, setAuthLoading] = useState(false);

const [authNotice, setAuthNotice] = useState('');

const [profileMenuOpen, setProfileMenuOpen] = useState(false);

const [profilePanel, setProfilePanel] = useState<ProfilePanel>('overview');

const [profileModalOpen, setProfileModalOpen] = useState(false);

const [profileDisplayName, setProfileDisplayName] = useState('');

const [profileNotice, setProfileNotice] = useState('');

const [securityPassword, setSecurityPassword] = useState('');

const [securityLoading, setSecurityLoading] = useState(false);

const [notifyAutomation, setNotifyAutomation] = useState(true);

const [notifyPublishing, setNotifyPublishing] = useState(true);



// Content settings

const [seriesName, setSeriesName] = useState('');

const [niche, setNiche] = useState('True Crime & Mystery');

const [tone, setTone] = useState('Dramatic, Suspenseful & Intense');

const [voice, setVoice] = useState('en-US-JennyNeural');

const [duration, setDuration] = useState('30-40 seconds (Standard Reel)');

const [publishTime, setPublishTime] = useState('04:30 PM');

const [customPrompt, setCustomPrompt] = useState('');

const [aspectRatio, setAspectRatio] = useState('9:16');

const [bgmTrack, setBgmTrack] = useState('cinematic');

const [captionColor, setCaptionColor] = useState('yellow');

const [frequencyHours, setFrequencyHours] = useState(24);

const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['facebook', 'youtube', 'tiktok', 'instagram']);



// Series and social

const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);

const [isCreatingSeries, setIsCreatingSeries] = useState(false);

const [runningSeriesId, setRunningSeriesId] = useState<string | null>(null);

const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);

const [disconnectingId, setDisconnectingId] = useState<string | null>(null);



// Auto-pilot

const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);

const [autoPilotStatus, setAutoPilotStatus] = useState('');

const [autoPilotVideoUrl, setAutoPilotVideoUrl] = useState<string | null>(null);



// Manual studio

const [script, setScript] = useState('');

const [shots, setShots] = useState<Shot[]>([]);

const [audioUrl, setAudioUrl] = useState('');

const [videoProvider, setVideoProvider] = useState<'pixabay' | 'fal'>('pixabay');

const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

const [isGeneratingScript, setIsGeneratingScript] = useState(false);

const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);

const [isRenderingVideos, setIsRenderingVideos] = useState(false);

const [isStitching, setIsStitching] = useState(false);



// History and UI

const [history, setHistory] = useState<HistoryItem[]>([]);

const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

const [isLoadingHistory, setIsLoadingHistory] = useState(false);

const [isLoadedFromHistory, setIsLoadedFromHistory] = useState(false);

const [error, setError] = useState('');

const [isPlaying, setIsPlaying] = useState(false);

const [currentShotIndex, setCurrentShotIndex] = useState(0);

const playerAudioRef = useRef<HTMLAudioElement | null>(null);

const requestInFlight = useRef(false);



useEffect(() => {

if (typeof window === 'undefined') return;

try {

const saved = window.localStorage.getItem('autofrix-profile-preferences');

if (saved) {

const prefs = JSON.parse(saved);

if (typeof prefs.notifyAutomation === 'boolean') setNotifyAutomation(prefs.notifyAutomation);

if (typeof prefs.notifyPublishing === 'boolean') setNotifyPublishing(prefs.notifyPublishing);

if (typeof prefs.profileDisplayName === 'string') setProfileDisplayName(prefs.profileDisplayName);

}

} catch { /* Ignore invalid local preferences. */ }

}, []);



useEffect(() => {

if (!supabaseConfigured) return;

supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));

const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {

setUser(session?.user ?? null);

});

return () => subscription.unsubscribe();

}, []);



useEffect(() => {

if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {

setAuthView('reset');

setAuthNotice('Choose a new password for your account.');

}

}, []);



const fetchUserData = useCallback(async () => {

if (!user || !supabaseConfigured || requestInFlight.current) return;

requestInFlight.current = true;

setIsLoadingHistory(true);

try {

const [historyResult, seriesResult, socialResult] = await Promise.all([

supabase.from('scripts_v2').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),

supabase.from('series_automation').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),

// RLS should scope this table to the authenticated user's own connections.

supabase.from('social_connections').select('*').eq('user_id', user.id),

]);

if (historyResult.error) throw historyResult.error;

if (seriesResult.error) throw seriesResult.error;

if (socialResult.error) {

// Older schemas may not yet include user_id. Do not fall back to an unscoped query.

setSocialAccounts([]);

console.warn('Could not load social connections. Check the table schema and RLS policies.', socialResult.error.message);

} else {

setSocialAccounts((socialResult.data || []) as SocialAccount[]);

}

setHistory((historyResult.data || []) as HistoryItem[]);

setSeriesList((seriesResult.data || []) as SeriesItem[]);

} catch (err) {

console.error('Failed to load dashboard data:', err);

} finally {

setIsLoadingHistory(false);

requestInFlight.current = false;

}

}, [user]);



useEffect(() => {

void fetchUserData();

}, [fetchUserData]);



const handleAuth = async (event: React.FormEvent) => {

event.preventDefault();

if (!supabaseConfigured) {

setError('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment.');

return;

}

setAuthLoading(true);

setError('');

setAuthNotice('');

try {

if (authView === 'signup') {

const { error: authError } = await supabase.auth.signUp({

email: authEmail.trim(),

password: authPassword,

options: { emailRedirectTo: `${window.location.origin}/` },

});

if (authError) throw authError;

setAuthNotice('Account created. Check your email to confirm your address if email confirmation is enabled.');

setAuthView('signin');

setAuthPassword('');

} else if (authView === 'forgot') {

const { error: authError } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {

redirectTo: `${window.location.origin}/`,

});

if (authError) throw authError;

setAuthNotice('If an account exists for that email, a password-reset link has been sent.');

} else if (authView === 'reset') {

if (newPassword.length < 8) throw new Error('Your new password must be at least 8 characters.');

const { error: authError } = await supabase.auth.updateUser({ password: newPassword });

if (authError) throw authError;

setAuthNotice('Password updated successfully. You can continue using Autofrix AI.');

setNewPassword('');

setAuthView('signin');

window.history.replaceState({}, document.title, window.location.pathname);

} else {

const { error: authError } = await supabase.auth.signInWithPassword({

email: authEmail.trim(),

password: authPassword,

});

if (authError) throw authError;

}

} catch (err) {

setError(err instanceof Error ? err.message : 'Authentication failed.');

} finally {

setAuthLoading(false);

}

};



const handleLogout = async () => {

const { error: signOutError } = await supabase.auth.signOut();

if (signOutError) setError(signOutError.message);

else {

setUser(null);

setHistory([]);

setSeriesList([]);

setSocialAccounts([]);

}

};



const saveToSupabase = async (

currentScript: string,

currentShots: Shot[],

currentAudioUrl: string,

existingId?: string | null,

) => {

if (!user) return;

const payload = {

user_id: user.id,

series_name: seriesName.trim() || 'Untitled Series',

niche,

script: currentScript,

shots: currentShots || [],

audio_url: currentAudioUrl || null,

};

try {

if (existingId) {

const { error: updateError } = await supabase.from('scripts_v2').update(payload).eq('id', existingId).eq('user_id', user.id);

if (updateError) throw updateError;

} else {

const { data, error: insertError } = await supabase.from('scripts_v2').insert([payload]).select('id').single();

if (insertError) throw insertError;

if (data?.id) setActiveHistoryId(data.id);

}

await fetchUserData();

} catch (err) {

console.error('Could not save project:', err);

setError(err instanceof Error ? `Project generated, but saving failed: ${err.message}` : 'Project generated, but saving failed.');

}

};



const handleSelectHistoryItem = (item: HistoryItem) => {

setActiveHistoryId(item.id);

setSeriesName(item.series_name || '');

setNiche(item.niche || 'True Crime & Mystery');

setScript(item.script || '');

setShots(Array.isArray(item.shots) ? item.shots : []);

setAudioUrl(item.audio_url || '');

setFinalVideoUrl(null);

setIsLoadedFromHistory(true);

setAppMode('manual');

setCurrentStep(2);

setCurrentShotIndex(0);

setError('');

};



const clearLoadedHistory = () => {

setIsLoadedFromHistory(false);

setActiveHistoryId(null);

setScript('');

setShots([]);

setAudioUrl('');

setFinalVideoUrl(null);

setCurrentStep(1);

};



const handleCreateSeriesAutomation = async () => {

if (!user) return setError('Please sign in to create a series.');

if (!seriesName.trim()) return setError('Enter a name for your series.');

if (targetPlatforms.length === 0) return setError('Select at least one social media platform.');

setIsCreatingSeries(true);

setError('');

try {

const { error: insertError } = await supabase.from('series_automation').insert([{

user_id: user.id,

series_name: seriesName.trim(),

niche,

tone,

voice,

duration,

aspect_ratio: aspectRatio,

bgm_track: bgmTrack,

caption_color: captionColor,

frequency_hours: frequencyHours,

target_platforms: targetPlatforms,

custom_prompt: customPrompt,

is_active: true,

}]);

if (insertError) throw insertError;

setAuthNotice('Autonomous series created and saved.');

await fetchUserData();

} catch (err) {

setError(err instanceof Error ? err.message : 'Failed to create series automation.');

} finally {

setIsCreatingSeries(false);

}

};



const handleRunSeriesNow = async (seriesId: string) => {

setRunningSeriesId(seriesId);

setError('');

try {

const data = await readResponse<{ message?: string }>(await fetch('/api/cron/run-series', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ seriesId }),

}));

setAuthNotice(data.message || 'Series run was triggered. Check the job status and publishing logs for completion.');

await fetchUserData();

} catch (err) {

setError(err instanceof Error ? err.message : 'Error triggering series run.');

} finally {

setRunningSeriesId(null);

}

};



const handleAutoPilotGenerate = async () => {

setIsAutoPilotRunning(true);

setAutoPilotStatus('Generating script and shot list…');

setError('');

setAuthNotice('');

setAutoPilotVideoUrl(null);

try {

const data = await readResponse<{ url?: string; script: string; shots: Shot[]; audioUrl?: string }>(

await fetch('/api/auto-pilot', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({

seriesName, niche, tone, duration, publishTime, customPrompt,

voice, aspectRatio, bgmTrack, captionColor, targetPlatforms,

}),

}),

);

setAutoPilotStatus('Finalizing your video…');

if (!data.url) throw new Error('The auto-pilot endpoint completed without returning a video URL.');

setAutoPilotVideoUrl(data.url);

setScript(data.script || '');

setShots(data.shots || []);

setAudioUrl(data.audioUrl || '');

if (user) await saveToSupabase(data.script || '', data.shots || [], data.audioUrl || '', null);

} catch (err) {

setError(err instanceof Error ? err.message : 'Auto-pilot failed.');

} finally {

setIsAutoPilotRunning(false);

setAutoPilotStatus('');

}

};



const handleGenerateScript = async () => {

setIsGeneratingScript(true);

setError('');

setScript('');

setShots([]);

setAudioUrl('');

setFinalVideoUrl(null);

setActiveHistoryId(null);

setIsLoadedFromHistory(false);

try {

const data = await readResponse<{ script?: string; shots?: Shot[] }>(await fetch('/api/generate-script', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ seriesName, niche, tone, duration, publishTime, customPrompt }),

}));

const newScript = data.script || '';

const newShots = data.shots || [];

if (!newScript || newShots.length === 0) throw new Error('The script endpoint returned no script or scenes.');

setScript(newScript);

setShots(newShots);

if (user) await saveToSupabase(newScript, newShots, '', null);

setCurrentStep(2);

} catch (err) {

setError(err instanceof Error ? err.message : 'Error generating script.');

} finally {

setIsGeneratingScript(false);

}

};



const handleGenerateVoiceover = async () => {

if (!script.trim()) return setError('Generate or enter a script before creating a voiceover.');

setIsGeneratingVoice(true);

setError('');

try {

const data = await readResponse<{ audioUrl?: string }>(await fetch('/api/generate-voice', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ script, voice }),

}));

if (!data.audioUrl) throw new Error('The voice endpoint did not return an audio URL.');

setAudioUrl(data.audioUrl);

if (user) await saveToSupabase(script, shots, data.audioUrl, activeHistoryId);

} catch (err) {

setError(err instanceof Error ? err.message : 'Error generating voiceover.');

} finally {

setIsGeneratingVoice(false);

}

};



const handleRenderVideos = async () => {

if (!shots.length) return setError('Generate a script and scene list first.');

setIsRenderingVideos(true);

setError('');

try {

const endpoint = videoProvider === 'pixabay' ? '/api/fetch-video' : '/api/generate-video';

const data = await readResponse<{ shots?: Shot[] }>(await fetch(endpoint, {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ shots }),

}));

if (!data.shots?.length) throw new Error('The video endpoint returned no updated scenes.');

setShots(data.shots);

if (user) await saveToSupabase(script, data.shots, audioUrl, activeHistoryId);

} catch (err) {

setError(err instanceof Error ? err.message : 'Error fetching video clips.');

} finally {

setIsRenderingVideos(false);

}

};



const handleStitchVideo = async () => {

if (!shots.length || !hasAnyVideos) return setError('Fetch or generate at least one visual clip before stitching.');

setIsStitching(true);

setError('');

setFinalVideoUrl(null);

try {

const data = await readResponse<{ url?: string; path?: string }>(await fetch('/api/stitch-video', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ shots, audioUrl, bgmTrack, aspectRatio, captionColor }),

}));

const url = data.url || data.path;

if (!url) throw new Error('The stitch endpoint did not return a final video URL.');

setFinalVideoUrl(url);

} catch (err) {

setError(err instanceof Error ? err.message : 'Error stitching final video.');

} finally {

setIsStitching(false);

}

};



const togglePlatform = (platform: string) => {

setTargetPlatforms((current) => current.includes(platform)

? current.filter((item) => item !== platform)

: [...current, platform]);

};



const disconnectAccount = async (account: SocialAccount) => {

if (!window.confirm(`Disconnect ${account.account_name || account.platform}?`)) return;

setDisconnectingId(account.id);

setError('');

try {

// Delete by account ID and user ID; RLS must also enforce ownership server-side.

const { error: deleteError } = await supabase.from('social_connections')

.delete().eq('id', account.id).eq('user_id', user?.id);

if (deleteError) throw deleteError;

setSocialAccounts((current) => current.filter((item) => item.id !== account.id));

} catch (err) {

setError(err instanceof Error ? err.message : 'Failed to disconnect account.');

} finally {

setDisconnectingId(null);

}

};



const startYouTubeOAuth = () => {

const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID;

if (!clientId) {

setError('YouTube OAuth is not configured. Add NEXT_PUBLIC_YOUTUBE_CLIENT_ID and configure the server callback.');

return;

}

const redirectUri = `${window.location.origin}/api/auth/callback/youtube`;

const params = new URLSearchParams({

client_id: clientId,

redirect_uri: redirectUri,

response_type: 'code',

scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',

access_type: 'offline',

prompt: 'consent',

state: crypto.randomUUID(),

});

// OAuth state must be validated by the server callback (for example, via a signed, short-lived cookie).

window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);

};



const handleAudioTimeUpdate = () => {

if (!playerAudioRef.current || shots.length === 0) return;

const currentTime = playerAudioRef.current.currentTime;

let elapsed = 0;

for (let index = 0; index < shots.length; index += 1) {

elapsed += shots[index].durationSeconds || 5;

if (currentTime <= elapsed) {

setCurrentShotIndex(index);

return;

}

}

setCurrentShotIndex(shots.length - 1);

};



const handleAudioEnded = () => {

setIsPlaying(false);

setCurrentShotIndex(0);

};



const togglePlaySyncedReel = async () => {

const audio = playerAudioRef.current;

if (!audio) return setError('Generate a voiceover before playing the synced preview.');

if (isPlaying) {

audio.pause();

setIsPlaying(false);

} else {

try {

await audio.play();

setIsPlaying(true);

} catch {

setError('The audio preview could not start. Try pressing play again.');

}

}

};



const hasAnyVideos = useMemo(

() => shots.some((shot) => Boolean(shot.videoUrl || shot.url || shot.imageUrl)),

[shots],

);

const isStep2Complete = Boolean(audioUrl && hasAnyVideos);



const renderVoiceOptions = () => voices.map((group) => (

<optgroup key={group.group} label={group.group}>

{group.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}

</optgroup>

));



const renderSharedSettings = (includeFrequency = false) => (

<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">

<Field label="Series name">

<input value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. Mystery Vault" className={inputClass} />

</Field>

<SelectField label="Niche / category" value={niche} onChange={setNiche} options={niches.map((item) => [item, item] as [string, string])} />

<SelectField label="Tone & style" value={tone} onChange={setTone} options={tones.map((item) => [item, item] as [string, string])} />

<Field label="AI voice actor">

<select value={voice} onChange={(e) => setVoice(e.target.value)} className={inputClass}>{renderVoiceOptions()}</select>

</Field>

<SelectField label="Video duration" value={duration} onChange={setDuration} options={[

['15-20 seconds (Short Hook)', '15–20 seconds (Short Hook)'],

['30-40 seconds (Standard Reel)', '30–40 seconds (Standard Reel)'],

['50-60 seconds (Long Reel)', '50–60 seconds (Long Reel)'],

['2-3 minutes (Short Video)', '2–3 minutes (Short Video)'],

['4-5 minutes (Long Video)', '4–5 minutes (Long Video)'],

]} />

<Field label="Publish schedule time">

<input value={publishTime} onChange={(e) => setPublishTime(e.target.value)} placeholder="e.g. 04:30 PM" className={inputClass} />

</Field>

<SelectField label="Video format" value={aspectRatio} onChange={setAspectRatio} options={[

['9:16', '9:16 — Vertical video'], ['16:9', '16:9 — Landscape video'], ['1:1', '1:1 — Square video'],

]} />

<SelectField label="Background music mood" value={bgmTrack} onChange={setBgmTrack} options={[

['cinematic', 'Cinematic'], ['suspense', 'Suspense'], ['lofi', 'Lofi'], ['inspirational', 'Inspirational'],

]} />

<SelectField label="Subtitle color" value={captionColor} onChange={setCaptionColor} options={[

['yellow', 'Neon yellow'], ['white', 'Pure white'], ['green', 'Electric green'], ['cyan', 'Cyber cyan'],

]} />

{includeFrequency && (

<SelectField label="Posting frequency" value={String(frequencyHours)} onChange={(value) => setFrequencyHours(Number(value))} options={[

['12', 'Every 12 hours (2× daily)'], ['24', 'Every 24 hours (daily)'], ['48', 'Every 48 hours'],

]} />

)}

<Field label="Custom topic / angle" className="sm:col-span-2 xl:col-span-3">

<textarea rows={2} value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="e.g. Unsolved mysteries of the deep ocean…" className={inputClass} />

</Field>

</div>

);



if (!supabaseConfigured && !user) {

return (

<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">

<section className="w-full max-w-lg space-y-4 rounded-3xl border border-amber-200 bg-white p-6 shadow-xl sm:p-8">

<h1 className="text-3xl font-extrabold">Autofrix AI</h1>

<p className="text-sm text-slate-600">Supabase authentication is not configured yet.</p>

<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">

Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your local <code>.env.local</code> file, then restart the Next.js development server.

</div>

<p className="text-xs text-slate-500">Use only the Supabase anon/public key in browser code. Never expose a service-role key here.</p>

</section>

</main>

);

}



if (!user) {

const authTitle: Record<AuthView, string> = {

signin: 'Welcome back',

signup: 'Create your account',

forgot: 'Reset your password',

reset: 'Choose a new password',

};

return (

<main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">

<section className="w-full max-w-md space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">

<header className="space-y-2 text-center">

<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-2xl text-white">✦</div>

<h1 className="text-3xl font-extrabold tracking-tight">Autofrix AI</h1>

<p className="text-sm text-slate-500">{authTitle[authView]} — your cinematic content workspace</p>

</header>

{error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

{authNotice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{authNotice}</div>}

<form onSubmit={handleAuth} className="space-y-4">

{authView !== 'reset' && (

<Field label="Email address">

<input type="email" autoComplete="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className={inputClass} />

</Field>

)}

{(authView === 'signin' || authView === 'signup') && (

<Field label="Password">

<input type="password" autoComplete={authView === 'signup' ? 'new-password' : 'current-password'} minLength={8} required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className={inputClass} />

</Field>

)}

{authView === 'reset' && (

<Field label="New password">

<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />

</Field>

)}

<button type="submit" disabled={authLoading} className="w-full rounded-xl bg-purple-600 px-4 py-3.5 font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60">

{authLoading ? <Spinner /> : authView === 'signin' ? 'Sign in' : authView === 'signup' ? 'Create account' : authView === 'forgot' ? 'Send reset link' : 'Update password'}

</button>

</form>

<div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-sm">

{authView !== 'signin' && <button type="button" onClick={() => { setAuthView('signin'); setError(''); setAuthNotice(''); }} className="font-medium text-purple-700 hover:underline">Back to sign in</button>}

{authView === 'signin' && <>

<button type="button" onClick={() => { setAuthView('signup'); setError(''); setAuthNotice(''); }} className="font-medium text-purple-700 hover:underline">Create account</button>

<button type="button" onClick={() => { setAuthView('forgot'); setError(''); setAuthNotice(''); }} className="font-medium text-slate-600 hover:underline">Forgot password?</button>

</>}

{authView === 'signup' && <button type="button" onClick={() => { setAuthView('signin'); setError(''); }} className="font-medium text-slate-600 hover:underline">Already registered? Sign in</button>}

</div>

<footer className="text-center text-xs text-slate-400"><a href="/privacy" className="hover:text-purple-700 hover:underline">Privacy Policy</a></footer>

</section>

</main>

);

}



return (

<main className="min-h-screen bg-slate-50 px-3 py-4 font-sans text-slate-900 sm:px-5 sm:py-6 lg:px-8">

<div className="mx-auto w-full max-w-[1500px] space-y-6 sm:space-y-8">

<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

<div>

<div className="flex items-center gap-3">

<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-xl text-white">✦</div>

<h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Autofrix AI</h1>

</div>

<p className="mt-2 max-w-2xl text-sm text-slate-500">Automated cinematic scriptwriting, voiceover synthesis, and video creation.</p>

</div>

<div className="relative flex items-center justify-end">

<button

type="button"

aria-haspopup="menu"

aria-expanded={profileMenuOpen}

onClick={() => setProfileMenuOpen((open) => !open)}

className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-50"

>

<span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-700">{(profileDisplayName || user.email || 'A').charAt(0).toUpperCase()}</span>

<span className="hidden max-w-36 truncate sm:inline">{profileDisplayName || 'My Account'}</span>

<span aria-hidden="true">⌄</span>

</button>

{profileMenuOpen && (

<>

<button aria-label="Close account menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setProfileMenuOpen(false)} />

<div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">

<div className="border-b border-slate-100 px-3 py-3">

<p className="font-semibold text-slate-900">{profileDisplayName || 'Autofrix AI account'}</p>

<p className="mt-1 break-all text-xs text-slate-500">{user.email}</p>

</div>

{[

['overview', '👤', 'Profile & account'],

['settings', '⚙️', 'Preferences & notifications'],

['security', '🛡️', 'Security & password'],

['help', '❔', 'Help & support'],

].map(([panel, icon, label]) => (

<button key={panel} role="menuitem" onClick={() => openProfilePanel(panel as ProfilePanel)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-purple-50 hover:text-purple-700">

<span>{icon}</span><span>{label}</span><span className="ml-auto text-slate-400">›</span>

</button>

))}

<div className="my-1 border-t border-slate-100" />

<button role="menuitem" onClick={() => { setProfileMenuOpen(false); setAppMode('social'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-purple-50">🔗 Connected social accounts <span className="ml-auto text-xs text-slate-400">{socialAccounts.length}</span></button>

<button role="menuitem" onClick={() => { setProfileMenuOpen(false); void fetchUserData(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50">↻ Sync account data</button>

<button role="menuitem" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50">↪ Sign out</button>

</div>

</>

)}

</div>

</header>



{profileModalOpen && (

<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setProfileModalOpen(false); }}>

<section role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">

<div className="mb-5 flex items-start justify-between gap-4">

<div><p className="text-xs font-bold uppercase tracking-wider text-purple-700">Account centre</p><h2 id="profile-dialog-title" className="mt-1 text-xl font-extrabold">{profilePanel === 'overview' ? 'Profile & account' : profilePanel === 'settings' ? 'Preferences & notifications' : profilePanel === 'security' ? 'Security & password' : 'Help & support'}</h2></div>

<button aria-label="Close profile" onClick={() => setProfileModalOpen(false)} className="rounded-lg px-3 py-2 text-xl text-slate-500 hover:bg-slate-100">×</button>

</div>

<div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">

{([['overview', 'Profile'], ['settings', 'Preferences'], ['security', 'Security'], ['help', 'Help']] as [ProfilePanel, string][]).map(([panel, label]) => <button key={panel} onClick={() => { setProfilePanel(panel); setProfileNotice(''); }} className={`rounded-xl px-2 py-2.5 text-xs font-bold transition ${profilePanel === panel ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}

</div>

{profilePanel === 'overview' && <div className="space-y-4">

<div className="flex items-center gap-3 rounded-2xl bg-purple-50 p-4"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-200 text-xl font-bold text-purple-800">{(profileDisplayName || user.email || 'A').charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="font-bold">{profileDisplayName || 'Your Autofrix AI profile'}</p><p className="break-all text-sm text-slate-600">{user.email}</p></div></div>

<Field label="Display name"><input value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} placeholder="How should we label your profile?" className={inputClass} /></Field>

<div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Account status</p><p className="mt-1 font-semibold text-emerald-700">Signed in</p><p className="mt-1 text-xs text-slate-500">Your projects and automation data are loaded from your connected Autofrix AI account.</p></div>

<button onClick={saveProfilePreferences} className="w-full rounded-xl bg-purple-600 px-4 py-3 font-bold text-white hover:bg-purple-700">Save profile</button>

</div>}

{profilePanel === 'settings' && <div className="space-y-4">

<p className="text-sm text-slate-600">Choose which updates you want Autofrix AI to flag in this browser. These preferences are stored locally on this device.</p>

<label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={notifyAutomation} onChange={(e) => setNotifyAutomation(e.target.checked)} className="mt-1 h-4 w-4 accent-purple-600" /><span><span className="block font-semibold">Automation updates</span><span className="text-xs text-slate-500">Show notices about series and generation activity.</span></span></label>

<label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={notifyPublishing} onChange={(e) => setNotifyPublishing(e.target.checked)} className="mt-1 h-4 w-4 accent-purple-600" /><span><span className="block font-semibold">Publishing updates</span><span className="text-xs text-slate-500">Show notices about connected social publishing workflows.</span></span></label>

<div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Email or push notifications require a notification service and backend support; these switches currently save your preferences only.</div>

<button onClick={saveProfilePreferences} className="w-full rounded-xl bg-purple-600 px-4 py-3 font-bold text-white hover:bg-purple-700">Save preferences</button>

</div>}

{profilePanel === 'security' && <div className="space-y-4">

<div className="rounded-xl border border-slate-200 p-4"><p className="font-semibold">Signed-in email</p><p className="mt-1 break-all text-sm text-slate-600">{user.email}</p></div>

<Field label="Set a new password"><input type="password" autoComplete="new-password" minLength={8} value={securityPassword} onChange={(e) => setSecurityPassword(e.target.value)} placeholder="At least 8 characters" className={inputClass} /></Field>

<button disabled={securityLoading} onClick={() => void updateAccountPassword()} className="w-full rounded-xl bg-purple-600 px-4 py-3 font-bold text-white hover:bg-purple-700 disabled:opacity-60">{securityLoading ? 'Updating password…' : 'Update password'}</button>

<p className="text-xs text-slate-500">Keep your password private. For account deletion or session management, a secure server-side account workflow is required.</p>

</div>}

{profilePanel === 'help' && <div className="space-y-3">

<a href="mailto:support@autofrixai.com?subject=Autofrix%20AI%20Support" className="block rounded-xl border border-slate-200 p-4 transition hover:border-purple-300 hover:bg-purple-50"><p className="font-semibold">Contact support</p><p className="mt-1 text-sm text-slate-500">Email the support address to ask for help. Replace it with your real support email before launch if needed.</p></a>

<a href="/privacy" className="block rounded-xl border border-slate-200 p-4 transition hover:border-purple-300 hover:bg-purple-50"><p className="font-semibold">Privacy policy</p><p className="mt-1 text-sm text-slate-500">How account information should be handled.</p></a>

<a href="/terms" className="block rounded-xl border border-slate-200 p-4 transition hover:border-purple-300 hover:bg-purple-50"><p className="font-semibold">Terms of service</p><p className="mt-1 text-sm text-slate-500">Review the terms for using the platform.</p></a>

<button onClick={() => { setProfileModalOpen(false); setAppMode('social'); }} className="w-full rounded-xl border border-slate-200 p-4 text-left transition hover:border-purple-300 hover:bg-purple-50"><p className="font-semibold">Social account connections</p><p className="mt-1 text-sm text-slate-500">View or disconnect YouTube, TikTok, Instagram and Facebook.</p></button>

</div>}

{profileNotice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{profileNotice}</p>}

</section>

</div>

)}



<nav aria-label="Main navigation" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-4">

{([

['autopilot', '✨ Auto-Pilot'],

['series', '🔄 Series Scheduler'],

['social', `🔗 Social (${socialAccounts.length})`],

['manual', '🛠️ Manual Studio'],

] as [AppMode, string][]).map(([mode, label]) => (

<button key={mode} onClick={() => { setAppMode(mode); setError(''); }} className={`min-h-12 rounded-xl px-3 py-3 text-sm font-bold transition ${appMode === mode ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>

{label}

</button>

))}

</nav>



{error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')} className="font-bold">×</button></div>}

{authNotice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{authNotice}</span><button aria-label="Dismiss notice" onClick={() => setAuthNotice('')} className="font-bold">×</button></div>}



{appMode === 'autopilot' && (

<section className={panelClass}>

<div>

<h2 className="text-xl font-bold sm:text-2xl">🚀 1-Click Viral Reel Auto-Pilot</h2>

<p className="mt-1 text-sm text-slate-500">Choose your creative settings, then let your configured backend run the content pipeline.</p>

</div>

{renderSharedSettings()}

<button onClick={handleAutoPilotGenerate} disabled={isAutoPilotRunning} className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-4 text-base font-extrabold text-white shadow-md transition hover:opacity-95 disabled:opacity-60 sm:text-lg">

{isAutoPilotRunning ? <Spinner label={autoPilotStatus || 'Running auto-pilot…'} /> : '✨ Generate Complete Video'}

</button>

{autoPilotVideoUrl && (

<div className="flex flex-col items-center gap-4 border-t border-slate-100 pt-6">

<h3 className="text-lg font-bold text-emerald-700">Your video is ready</h3>

<video controls playsInline src={autoPilotVideoUrl} className="max-h-[70vh] w-full max-w-sm rounded-2xl border border-slate-200 bg-black" />

<a href={autoPilotVideoUrl} download="autofrix-autopilot-reel.mp4" className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-center font-bold text-white transition hover:bg-emerald-700 sm:w-auto">📥 Download MP4</a>

</div>

)}

</section>

)}



{appMode === 'series' && (

<section className={panelClass}>

<div>

<h2 className="text-xl font-bold sm:text-2xl">🔄 Autonomous Series Scheduler</h2>

<p className="mt-1 text-sm text-slate-500">Save recurring content presets. Automatic runs require a deployed, secured cron/background worker.</p>

</div>

{renderSharedSettings(true)}

<div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50/60 p-4">

<div>

<h3 className="text-sm font-bold uppercase tracking-wider text-purple-900">🎯 Target publishing channels</h3>

<p className="mt-1 text-xs text-slate-600">Select platforms for this series. Each platform must be connected and supported by your publishing backend.</p>

</div>

<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">

{platforms.map((platform) => {

const selected = targetPlatforms.includes(platform.id);

return <button type="button" key={platform.id} onClick={() => togglePlatform(platform.id)} aria-pressed={selected} className={`rounded-xl border p-3 text-sm font-bold transition ${selected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{platform.label} <span className="ml-1">{selected ? '✓' : '+'}</span></button>;

})}

</div>

</div>

<button onClick={handleCreateSeriesAutomation} disabled={isCreatingSeries} className="w-full rounded-xl bg-emerald-600 px-4 py-4 font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">

{isCreatingSeries ? <Spinner label="Creating series…" /> : '+ Create Autonomous Series'}

</button>

<div className="space-y-4 border-t border-slate-100 pt-6">

<div className="flex flex-wrap items-center justify-between gap-2">

<h3 className="text-sm font-bold uppercase tracking-wider text-purple-700">Saved series ({seriesList.length})</h3>

<button onClick={() => void fetchUserData()} disabled={isLoadingHistory} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">{isLoadingHistory ? 'Syncing…' : '↻ Refresh'}</button>

</div>

{seriesList.length === 0 ? <p className="py-4 text-sm italic text-slate-400">No series saved yet.</p> : (

<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">

{seriesList.map((series) => (

<article key={series.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">

<div className="flex flex-wrap items-start justify-between gap-2">

<h4 className="font-bold">{series.series_name}</h4>

<span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${series.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{series.is_active ? 'ACTIVE' : 'PAUSED'}</span>

</div>

<p className="text-xs text-slate-500">{series.niche} · {series.duration || 'Standard'} · Every {series.frequency_hours}h</p>

<div className="flex flex-wrap gap-1">{(series.target_platforms || []).map((platform) => <span key={platform} className="rounded-md bg-purple-100 px-2 py-1 text-[10px] font-bold uppercase text-purple-800">{platform}</span>)}</div>

{series.last_run_at && <p className="text-xs text-slate-500">Last run: {new Date(series.last_run_at).toLocaleString()}</p>}

<div className="flex justify-end border-t border-slate-200 pt-3">

<button onClick={() => void handleRunSeriesNow(series.id)} disabled={runningSeriesId === series.id || !series.is_active} className="rounded-lg bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50">

{runningSeriesId === series.id ? <Spinner label="Running…" /> : '⚡ Run Now'}

</button>

</div>

</article>

))}

</div>

)}

</div>

</section>

)}



{appMode === 'social' && (

<section className={panelClass}>

<div>

<h2 className="text-xl font-bold sm:text-2xl">🔗 Social Publishing Hub</h2>

<p className="mt-1 text-sm text-slate-500">Connect social accounts through the OAuth routes configured on your server.</p>

</div>

<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">

<button onClick={startYouTubeOAuth} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-5 transition hover:bg-red-100"><span className="text-2xl">🔴</span><span className="font-bold">Connect YouTube</span><span className="text-center text-xs text-slate-500">Google OAuth</span></button>

<button onClick={() => { window.location.assign('/api/auth/tiktok'); }} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-5 transition hover:bg-cyan-100"><span className="text-2xl">🎵</span><span className="font-bold">Connect TikTok</span><span className="text-center text-xs text-slate-500">TikTok OAuth route</span></button>

<button onClick={() => { window.location.assign('/api/auth/facebook'); }} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-pink-50 p-5 transition hover:bg-pink-100"><span className="text-2xl">📸</span><span className="font-bold">Connect Instagram</span><span className="text-center text-xs text-slate-500">Meta OAuth route</span></button>

<button onClick={() => { window.location.assign('/api/auth/facebook'); }} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-5 transition hover:bg-blue-100"><span className="text-2xl">📘</span><span className="font-bold">Connect Facebook</span><span className="text-center text-xs text-slate-500">Meta OAuth route</span></button>

</div>

<div className="space-y-4 border-t border-slate-100 pt-6">

<div className="flex flex-wrap items-center justify-between gap-2">

<h3 className="text-sm font-bold uppercase tracking-wider text-purple-700">Connected accounts ({socialAccounts.length})</h3>

<button onClick={() => void fetchUserData()} disabled={isLoadingHistory} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">{isLoadingHistory ? 'Syncing…' : '↻ Refresh'}</button>

</div>

{socialAccounts.length === 0 ? <p className="py-4 text-sm italic text-slate-400">No social accounts found. Complete OAuth setup and verify the database policies.</p> : (

<div className="grid grid-cols-1 gap-3 md:grid-cols-2">

{socialAccounts.map((account) => (

<article key={account.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">

<div className="flex min-w-0 items-center gap-3">

<img src={account.avatar_url || '/social-account-placeholder.svg'} className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover" alt="" onError={(e) => { e.currentTarget.src = '/favicon.ico'; }} />

<div className="min-w-0"><p className="font-semibold uppercase">{account.platform}</p><p className="break-words text-xs text-slate-500">{account.account_name}</p><p className="text-[10px] text-emerald-700">{account.status || 'Connected'}</p></div>

</div>

<button onClick={() => void disconnectAccount(account)} disabled={disconnectingId === account.id} className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">{disconnectingId === account.id ? 'Disconnecting…' : 'Disconnect'}</button>

</article>

))}

</div>

)}

</div>

</section>

)}



{appMode === 'manual' && (

<section className="space-y-5">

<nav aria-label="Manual studio steps" className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">

{([

[1, 'Setup & Script'],

[2, 'Voice & Clips'],

[3, 'Studio & Export'],

] as [1 | 2 | 3, string][]).map(([step, label]) => {

const disabled = (step === 2 && !script) || (step === 3 && !isStep2Complete);

return <button key={step} onClick={() => setCurrentStep(step)} disabled={disabled} className={`rounded-xl px-2 py-3 text-center transition sm:px-4 ${currentStep === step ? 'bg-purple-600 font-bold text-white' : disabled ? 'cursor-not-allowed bg-slate-50 text-slate-400' : 'bg-slate-50 text-purple-700 hover:bg-purple-50'}`}><span className="block text-xs uppercase tracking-wider">Step {step}</span><span className="mt-1 block text-xs sm:text-sm">{label}</span></button>;

})}

</nav>



{currentStep === 1 && (

<div className={panelClass}>

<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Manual Script & Shot Generation</h2>{isLoadedFromHistory && <button onClick={clearLoadedHistory} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Reset loaded project</button>}</div>

{renderSharedSettings()}

{script && <Field label="Script content (editable)"><textarea rows={7} value={script} onChange={(e) => setScript(e.target.value)} className={`${inputClass} font-mono`} /></Field>}

{shots.length > 0 && <div className="space-y-3"><h3 className="font-bold">🎬 Generated scenes ({shots.length})</h3><div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{shots.map((shot, index) => <article key={`${shot.shotNumber}-${index}`} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-purple-700">Scene #{shot.shotNumber || index + 1} · {shot.durationSeconds || 5}s</p><p className="text-sm text-slate-800">🗣️ {shot.narration}</p><p className="text-xs italic text-slate-500">🎥 {shot.visualPrompt}</p>{(shot.videoUrl || shot.url || shot.imageUrl) && <span className="inline-block rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Media attached</span>}</article>)}</div></div>}

<div className="flex flex-col gap-3 sm:flex-row">

<button onClick={() => void handleGenerateScript()} disabled={isGeneratingScript} className="flex-1 rounded-xl bg-purple-600 px-4 py-4 font-bold text-white hover:bg-purple-700 disabled:opacity-60">{isGeneratingScript ? <Spinner label="Generating script…" /> : '1. Generate Script & Scenes →'}</button>

{script && <button onClick={async () => { await saveToSupabase(script, shots, audioUrl, activeHistoryId); setCurrentStep(2); }} className="flex-1 rounded-xl bg-emerald-600 px-4 py-4 font-bold text-white hover:bg-emerald-700">Save & proceed to Step 2 →</button>}

</div>

</div>

)}



{currentStep === 2 && (

<div className="space-y-5">

<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

<div className={panelClass}>

<h3 className="border-b border-slate-100 pb-3 font-bold">🎙 Generate voiceover</h3>

<Field label="Voice actor"><select value={voice} onChange={(e) => setVoice(e.target.value)} className={inputClass}>{renderVoiceOptions()}</select></Field>

<button onClick={() => void handleGenerateVoiceover()} disabled={isGeneratingVoice || !script.trim()} className="w-full rounded-xl bg-blue-600 px-4 py-3.5 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{isGeneratingVoice ? <Spinner label="Synthesizing…" /> : '⚡ Generate Voiceover'}</button>

{audioUrl && <audio controls src={audioUrl} className="w-full" />}

</div>

<div className={panelClass}>

<h3 className="border-b border-slate-100 pb-3 font-bold">🎬 Fetch or generate clips</h3>

<Field label="Visual provider"><select value={videoProvider} onChange={(e) => setVideoProvider(e.target.value as 'pixabay' | 'fal')} className={inputClass}><option value="pixabay">Pixabay — stock footage</option><option value="fal">FAL — generated video (if configured)</option></select></Field>

<button onClick={() => void handleRenderVideos()} disabled={isRenderingVideos || shots.length === 0} className="w-full rounded-xl bg-emerald-600 px-4 py-3.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{isRenderingVideos ? <Spinner label="Processing scenes…" /> : videoProvider === 'pixabay' ? '🎥 Fetch clips via Pixabay' : '✨ Generate clips via FAL'}</button>

</div>

</div>

{shots.length > 0 && <div className={panelClass}><h3 className="font-bold">🖼️ Scene media preview</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{shots.map((shot, index) => {

const media = shot.videoUrl || shot.url || shot.imageUrl || '';

const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(media) || /video/i.test(media);

return <div key={`${shot.shotNumber}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2"><div className="flex h-32 items-center justify-center overflow-hidden rounded-lg bg-slate-900 sm:h-40">{media ? isVideo ? <video src={media} controls muted playsInline className="h-full w-full object-cover" /> : <img src={media} alt={`Scene ${index + 1}`} className="h-full w-full object-cover" /> : <span className="text-xs text-slate-400">No media yet</span>}</div><p className="mt-2 text-xs font-semibold text-slate-200">Scene #{shot.shotNumber || index + 1}</p></div>;

})}</div></div>}

<div className="flex justify-end"><button onClick={() => setCurrentStep(3)} disabled={!isStep2Complete} className="w-full rounded-xl bg-purple-600 px-6 py-4 font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Proceed to Studio Preview →</button></div>

</div>

)}



{currentStep === 3 && (

<div className={panelClass}>

<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4"><h2 className="text-xl font-bold sm:text-2xl">📱 Studio Preview & Final MP4</h2><button onClick={() => setCurrentStep(2)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold hover:bg-slate-200">← Back to Step 2</button></div>

{audioUrl && <audio ref={playerAudioRef} src={audioUrl} onTimeUpdate={handleAudioTimeUpdate} onEnded={handleAudioEnded} />}

<div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">

<div className="flex w-full flex-col items-center gap-4">

<div className="relative flex aspect-[9/16] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-3xl border-4 border-slate-200 bg-slate-950 shadow-xl">

{(() => {

const shot = shots[currentShotIndex];

const media = shot?.videoUrl || shot?.url || shot?.imageUrl || '';

if (!media) return <span className="text-xs text-slate-400">No media preview</span>;

const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(media) || /video/i.test(media);

return isVideo ? <video key={media} src={media} autoPlay loop muted playsInline className="h-full w-full object-cover" /> : <img src={media} alt="Current scene preview" className="h-full w-full object-cover" />;

})()}

{shots[currentShotIndex]?.narration && <div className="absolute inset-x-3 bottom-8 rounded-xl bg-black/80 p-3 text-center"><p className="text-xs font-bold text-yellow-300">{shots[currentShotIndex].narration}</p></div>}

</div>

<button onClick={() => void togglePlaySyncedReel()} className="w-full max-w-[300px] rounded-xl bg-purple-600 px-4 py-3 font-bold text-white hover:bg-purple-700">{isPlaying ? '⏸ Pause narration' : '▶ Play synced preview'}</button>

<p className="text-center text-xs text-slate-500">Scene {Math.min(currentShotIndex + 1, shots.length)} of {shots.length}</p>

</div>

<div className="space-y-5">

<div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">

<h3 className="font-bold uppercase tracking-wider text-slate-700">Export settings</h3>

<SelectField label="Aspect ratio" value={aspectRatio} onChange={setAspectRatio} options={[['9:16', '9:16 — Vertical'], ['16:9', '16:9 — Landscape'], ['1:1', '1:1 — Square']]} />

<SelectField label="Background music" value={bgmTrack} onChange={setBgmTrack} options={[['cinematic', 'Cinematic'], ['suspense', 'Suspense'], ['lofi', 'Lofi'], ['inspirational', 'Inspirational']]} />

<SelectField label="Caption color" value={captionColor} onChange={setCaptionColor} options={[['yellow', 'Neon yellow'], ['white', 'White'], ['green', 'Electric green'], ['cyan', 'Cyber cyan']]} />

</div>

<div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">

<button onClick={() => void handleStitchVideo()} disabled={isStitching || !hasAnyVideos} className="w-full rounded-xl bg-emerald-600 px-4 py-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{isStitching ? <Spinner label="Compiling video…" /> : '💾 Stitch & Compile Final Video'}</button>

{finalVideoUrl && <div className="space-y-3 border-t border-slate-200 pt-4"><video controls playsInline src={finalVideoUrl} className="max-h-[60vh] w-full rounded-xl bg-black" /><a href={finalVideoUrl} download="autofrix-ai-video.mp4" className="block rounded-xl bg-blue-600 px-4 py-3 text-center font-bold text-white hover:bg-blue-700">📥 Download final MP4</a></div>}

</div>

</div>

</div>

</div>

)}

</section>

)}



<section className={panelClass}>

<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">

<h2 className="text-base font-bold uppercase tracking-wider text-purple-700">📁 My Saved Projects ({history.length})</h2>

<button onClick={() => void fetchUserData()} disabled={isLoadingHistory} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50">{isLoadingHistory ? 'Syncing…' : '↻ Sync'}</button>

</div>

{history.length === 0 ? <p className="py-6 text-center text-sm italic text-slate-400">No saved projects found for this account.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{history.map((item) => <button key={item.id} onClick={() => handleSelectHistoryItem(item)} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-purple-300 hover:bg-purple-50/50"><p className="truncate font-bold">{item.series_name || 'Untitled project'}</p><p className="mt-1 truncate text-xs text-slate-500">{item.niche}</p>{item.created_at && <p className="mt-2 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString()}</p>}</button>)}</div>}

</section>



<footer className="flex flex-col items-center justify-between gap-2 border-t border-slate-200 py-5 text-xs text-slate-500 sm:flex-row">

<p>© {new Date().getFullYear()} Autofrix AI. Create more. Do less.</p>

<div className="flex flex-wrap items-center justify-center gap-4"><a href="/privacy" className="hover:text-purple-700 hover:underline">Privacy Policy</a><a href="/terms" className="hover:text-purple-700 hover:underline">Terms of Service</a></div>

</footer>

</div>

</main>

);

} 