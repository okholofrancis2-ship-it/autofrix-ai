'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
  audio_url?: string;
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

export default function Home() {
  const [appMode, setAppMode] = useState<'autopilot' | 'series' | 'social' | 'manual'>('autopilot');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Auth State
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthModeSignup, setIsAuthModeSignup] = useState(false);
  const [isAuthModeForgot, setIsAuthModeForgot] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Profile Modal State
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Full Parameters State
  const [seriesName, setSeriesName] = useState('');
  const [niche, setNiche] = useState('True Crime & Mystery');
  const [tone, setTone] = useState('Dramatic, Suspenseful & Intense');
  const [voice, setVoice] = useState('en-US-JennyNeural');
  const [duration, setDuration] = useState('30-40 seconds (Standard Reel)');
  const [publishTime, setPublishTime] = useState('04:30 PM');
  const [customPrompt, setCustomPrompt] = useState('');

  // Export & Customization State
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [bgmTrack, setBgmTrack] = useState('cinematic');
  const [captionColor, setCaptionColor] = useState('yellow');
  const [frequencyHours, setFrequencyHours] = useState(24);

  // Target Platforms Selection State
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['facebook', 'youtube', 'tiktok', 'instagram']);

  // Series Scheduler & Social Hub State
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [isCreatingSeries, setIsCreatingSeries] = useState(false);
  const [runningSeriesId, setRunningSeriesId] = useState<string | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);

  // Auto-Pilot Execution State
  const [isAutoPilotRunning, setIsAutoPilotRunning] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState('');
  const [autoPilotVideoUrl, setAutoPilotVideoUrl] = useState<string | null>(null);

  // Manual Generation Data State
  const [script, setScript] = useState('');
  const [shots, setShots] = useState<Shot[]>([]);
  const [audioUrl, setAudioUrl] = useState('');
  const [videoProvider, setVideoProvider] = useState<'pixabay' | 'fal'>('pixabay');
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Supabase History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadedFromHistory, setIsLoadedFromHistory] = useState(false);

  // UI States
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isRenderingVideos, setIsRenderingVideos] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [error, setError] = useState('');

  // Studio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const playerAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');
    try {
      if (isAuthModeSignup) {
        const { error: signUpErr } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        if (signUpErr) throw signUpErr;
        alert('Account created! You can now log in.');
        setIsAuthModeSignup(false);
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (signInErr) throw signInErr;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) {
      setError('Please enter your email address first.');
      return;
    }
    setAuthLoading(true);
    setError('');
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(authEmail, {
        redirectTo: `${window.location.origin}/`,
      });
      if (resetErr) throw resetErr;
      alert('Password reset link sent! Check your inbox.');
      setIsAuthModeForgot(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsProfileOpen(false);
  };

  const fetchUserData = async () => {
    try {
      setIsLoadingHistory(true);
      const { data: socialData } = await supabase.from('social_connections').select('*');
      if (socialData) setSocialAccounts(socialData);

      if (!user) return;

      const { data: histData } = await supabase
        .from('scripts_v2')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12);
      if (histData) setHistory(histData);

      const { data: seriesData } = await supabase
        .from('series_automation')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (seriesData) setSeriesList(seriesData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchUserData();
    const interval = setInterval(() => {
      fetchUserData();
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const disconnectAccount = async (platform: string) => {
    try {
      await supabase.from('social_connections').delete().eq('platform', platform);
      setSocialAccounts(prev => prev.filter(acc => acc.platform !== platform));
    } catch (err) {
      console.error('Failed to disconnect account:', err);
    }
  };

  const togglePlatform = (platform: string) => {
    setTargetPlatforms(prev => 
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const saveToSupabase = async (currentScript: string, currentShots: Shot[], currentAudioUrl: string, existingId?: string | null) => {
    if (!user) return;
    try {
      const payload = {
        user_id: user.id,
        series_name: seriesName || 'Untitled Series',
        niche,
        script: currentScript,
        shots: currentShots || [],
        audio_url: currentAudioUrl || null,
      };
      if (existingId) {
        await supabase.from('scripts_v2').update(payload).eq('id', existingId);
      } else {
        const { data } = await supabase.from('scripts_v2').insert([payload]).select();
        if (data && data[0]) setActiveHistoryId(data[0].id);
      }
      fetchUserData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setActiveHistoryId(item.id);
    setSeriesName(item.series_name || '');
    setNiche(item.niche || 'True Crime & Mystery');
    setScript(item.script || '');
    setShots(item.shots || []);
    setAudioUrl(item.audio_url || '');
    setFinalVideoUrl(null);
    setIsLoadedFromHistory(true);
    setAppMode('manual');
    setCurrentStep(2);
    setError('');
  };

  const clearLoadedHistory = () => {
    setIsLoadedFromHistory(false);
    setActiveHistoryId(null);
    setScript('');
    setShots([]);
    setAudioUrl('');
  };

  const handleCreateSeriesAutomation = async () => {
    if (!user) return;
    if (targetPlatforms.length === 0) {
      setError('Please select at least one social media platform for this series.');
      return;
    }
    setIsCreatingSeries(true);
    setError('');
    try {
      const { error: err } = await supabase.from('series_automation').insert([{
        user_id: user.id,
        series_name: seriesName,
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
        is_active: true
      }]);
      if (err) throw err;
      alert('Autonomous series created and saved with Autofrix AI presets!');
      fetchUserData();
    } catch (err: any) {
      setError(err.message || 'Failed to create series automation.');
    } finally {
      setIsCreatingSeries(false);
    }
  };

  const handleRunSeriesNow = async (seriesId: string) => {
    try {
      setRunningSeriesId(seriesId);
      setError('');
      const res = await fetch('/api/cron/run-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger run-series endpoint.');
      alert('Series episode generation & publishing triggered successfully!');
      fetchUserData();
    } catch (err: any) {
      setError(err.message || 'Error triggering run.');
    } finally {
      setRunningSeriesId(null);
    }
  };

  const handleAutoPilotGenerate = async () => {
    setIsAutoPilotRunning(true);
    setAutoPilotStatus('🧠 Generating viral AI script & shot list...');
    setError('');
    setAutoPilotVideoUrl(null);

    try {
      setAutoPilotStatus('🎙 Synthesizing AI voiceover & fetching media assets...');
      const res = await fetch('/api/auto-pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesName, niche, tone, duration, publishTime, customPrompt,
          voice, aspectRatio, bgmTrack, captionColor
        }),
      });

      setAutoPilotStatus('🎬 Compiling video with FFmpeg, Ken Burns & BGM...');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-pilot execution failed.');

      setAutoPilotVideoUrl(data.url);
      setScript(data.script);
      setShots(data.shots);
      setAudioUrl(data.audioUrl);
      if (user) await saveToSupabase(data.script, data.shots, data.audioUrl, null);
    } catch (err: any) {
      setError(err.message || 'Auto-pilot failed.');
    } finally {
      setIsAutoPilotRunning(false);
      setAutoPilotStatus('');
    }
  };

  const handleGenerateScript = async () => {
    try {
      setIsGeneratingScript(true);
      setError('');
      setScript('');
      setShots([]);
      setAudioUrl('');
      setFinalVideoUrl(null);
      setActiveHistoryId(null);
      setIsLoadedFromHistory(false);

      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesName, niche, tone, duration, publishTime, customPrompt }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate script.');

      const newScript = data.script || '';
      const newShots = data.shots || [];
      setScript(newScript);
      setShots(newShots);

      if (user) await saveToSupabase(newScript, newShots, '', null);
      setCurrentStep(2);
    } catch (err: any) {
      setError(err.message || 'Error generating script.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    try {
      if (!script) return;
      setIsGeneratingVoice(true);
      setError('');

      const res = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voice }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate voiceover.');

      setAudioUrl(data.audioUrl);
      if (user) await saveToSupabase(script, shots, data.audioUrl, activeHistoryId);
    } catch (err: any) {
      setError(err.message || 'Error generating voiceover.');
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleRenderVideos = async () => {
    try {
      if (!shots || shots.length === 0) return;
      setIsRenderingVideos(true);
      setError('');

      const endpoint = videoProvider === 'pixabay' ? '/api/fetch-video' : '/api/generate-video';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to render video clips.');

      const updatedShots = data.shots || [];
      setShots(updatedShots);
      if (user) await saveToSupabase(script, updatedShots, audioUrl, activeHistoryId);
    } catch (err: any) {
      setError(err.message || 'Error fetching video clips.');
    } finally {
      setIsRenderingVideos(false);
    }
  };

  const handleStitchVideo = async () => {
    try {
      if (!shots || shots.length === 0) {
        setError('No shot list available to stitch.');
        return;
      }
      setIsStitching(true);
      setError('');
      setFinalVideoUrl(null);

      const res = await fetch('/api/stitch-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots, audioUrl, bgmTrack, aspectRatio, captionColor }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stitch video.');

      setFinalVideoUrl(data.url || data.path || null);
    } catch (err: any) {
      setError(err.message || 'Error stitching final video.');
    } finally {
      setIsStitching(false);
    }
  };

  const togglePlaySyncedReel = () => {
    if (!playerAudioRef.current) return;
    if (isPlaying) {
      playerAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      playerAudioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (!playerAudioRef.current || shots.length === 0) return;
    const currentTime = playerAudioRef.current.currentTime;
    let accumulatedTime = 0;
    for (let i = 0; i < shots.length; i++) {
      accumulatedTime += shots[i].durationSeconds || 5;
      if (currentTime <= accumulatedTime) {
        if (currentShotIndex !== i) setCurrentShotIndex(i);
        break;
      }
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentShotIndex(0);
  };

  const hasAnyVideos = shots.some((s) => s.videoUrl || s.url || s.imageUrl);
  const isStep2Complete = Boolean(audioUrl && hasAnyVideos);

  const LoadingSpinner = () => (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  // Unauthenticated View
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-between p-4 font-sans antialiased">
        <div className="w-full max-w-md my-auto bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Autofrix AI</h1>
            <p className="text-slate-500 text-sm">
              {isAuthModeForgot ? 'Reset your account password' : 'Sign in to access your cinematic automation dashboard'}
            </p>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-xs">{error}</div>}

          {isAuthModeForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="your@email.com" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>
              <button type="submit" disabled={authLoading} className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition shadow-md h-12">
                {authLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <div className="text-center pt-2">
                <button type="button" onClick={() => setIsAuthModeForgot(false)} className="text-xs text-purple-600 hover:text-purple-700 font-medium">
                  Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Email</label>
                <input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="your@email.com" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Password</label>
                  {!isAuthModeSignup && (
                    <button type="button" onClick={() => setIsAuthModeForgot(true)} className="text-xs text-purple-600 hover:underline font-medium">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input type="password" required value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>
              <button type="submit" disabled={authLoading} className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition shadow-md h-12">
                {authLoading ? 'Loading...' : isAuthModeSignup ? 'Create Account' : 'Sign In'}
              </button>
            </form>
          )}

          {!isAuthModeForgot && (
            <div className="text-center pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setIsAuthModeSignup(!isAuthModeSignup)} className="text-xs text-purple-600 hover:text-purple-700 font-medium py-2">
                {isAuthModeSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          )}
        </div>

        <footer className="w-full py-4 text-center text-xs text-slate-500">
          <p>
            By continuing, you agree to our{' '}
            <a href="#privacy" onClick={(e) => { e.preventDefault(); alert('Privacy Policy: Autofrix AI stores your encrypted automation presets and scheduled workflows securely.'); }} className="text-purple-600 hover:underline">Privacy Policy</a> &{' '}
            <a href="#terms" onClick={(e) => { e.preventDefault(); alert('Terms of Service: Use responsibly for automated cinematic video creation.'); }} className="text-purple-600 hover:underline">Terms of Service</a>.
          </p>
        </footer>
      </main>
    );
  }

  // Authenticated Dashboard View
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 md:p-8 lg:p-10 font-sans antialiased pb-12">
      <div className="max-w-[1500px] w-full mx-auto space-y-8">
       
        {/* Header & Mode Tabs */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Autofrix AI</h1>
              <p className="text-slate-500 text-sm mt-1">Automated cinematic scriptwriting, voiceover synthesis, and video pipeline</p>
            </div>
            
            {/* Professional Profile Button replacing loose email & sign out */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="flex items-center gap-2.5 text-xs text-slate-700 font-medium bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm hover:bg-slate-50 transition group"
              >
                <div className="w-7 h-7 rounded-xl bg-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                  {user.email ? user.email[0].toUpperCase() : 'U'}
                </div>
                <span className="truncate max-w-[150px] sm:max-w-xs">{user.email}</span>
                <span className="text-slate-400 group-hover:text-slate-600 text-[10px]">▼</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
            <button onClick={() => setAppMode('autopilot')} className={`py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition ${appMode === 'autopilot' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              ✨ 1-Click Auto-Pilot
            </button>
            <button onClick={() => setAppMode('series')} className={`py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition ${appMode === 'series' ? 'bg-purple-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              🔄 Series Scheduler
            </button>
            <button onClick={() => setAppMode('social')} className={`py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition ${appMode === 'social' ? 'bg-purple-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              🔗 Social Publishing ({socialAccounts.length})
            </button>
            <button onClick={() => setAppMode('manual')} className={`py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition ${appMode === 'manual' ? 'bg-purple-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-50'}`}>
              🛠️ Manual Studio
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

        {/* ============================================================== */}
        {/* 1-CLICK AUTO-PILOT MODE */}
        {/* ============================================================== */}
        {appMode === 'autopilot' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">🚀 1-Click Viral Reel Auto-Pilot Generator</h2>
           
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Series Name</label>
                <input type="text" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. Mystery Vault" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Niche / Category</label>
                <select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="True Crime & Mystery">True Crime & Mystery</option>
                  <option value="Scary Stories & Horror">Scary Stories & Horror</option>
                  <option value="Fun Facts & Curiosities">Fun Facts & Curiosities</option>
                  <option value="Motivational & Mindset">Motivational & Mindset</option>
                  <option value="Sci-Fi & Tech Explanations">Sci-Fi & Tech Explanations</option>
                  <option value="Historical Untold Facts">Historical Untold Facts</option>
                  <option value="Luxury, Wealth & Success">Luxury, Wealth & Success</option>
                  <option value="Business, Money & Investing">Business, Money & Investing</option>
                  <option value="Health, Fitness & Longevity">Health, Fitness & Longevity</option>
                  <option value="Philosophy & Stoicism">Philosophy & Stoicism</option>
                  <option value="Anime, Gaming & Pop Culture">Anime, Gaming & Pop Culture</option>
                  <option value="Daily Life Hacks & Productivity">Daily Life Hacks & Productivity</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Tone & Style</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="Dramatic, Suspenseful & Intense">Dramatic, Suspenseful & Intense</option>
                  <option value="Energetic & Fast-Paced (Viral Hook)">Energetic & Fast-Paced (Viral Hook)</option>
                  <option value="Calm, Deep & Storytelling">Calm, Deep & Storytelling</option>
                  <option value="Humorous, Sarcastic & Witty">Humorous, Sarcastic & Witty</option>
                  <option value="Epic, Cinematic & Inspiring">Epic, Cinematic & Inspiring</option>
                  <option value="Dark, Whispering & Mysterious">Dark, Whispering & Mysterious</option>
                  <option value="Educational, Authoritative & Clear">Educational, Authoritative & Clear</option>
                  <option value="Controversial & Thought-Provoking">Controversial & Thought-Provoking</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">AI Voice Actor Catalog</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <optgroup label="United States Voices">
                    <option value="en-US-JennyNeural">Jenny (US Female - Natural/Friendly)</option>
                    <option value="en-US-GuyNeural">Guy (US Male - Professional/Deep)</option>
                    <option value="en-US-AriaNeural">Aria (US Female - Expressive/Dramatic)</option>
                    <option value="en-US-ChristopherNeural">Christopher (US Male - Authoritative)</option>
                  </optgroup>
                  <optgroup label="United Kingdom Voices">
                    <option value="en-GB-SoniaNeural">Sonia (UK Female - Professional/Classic)</option>
                    <option value="en-GB-RyanNeural">Ryan (UK Male - Crisp/Deep)</option>
                  </optgroup>
                  <optgroup label="Australia & Regional Voices">
                    <option value="en-AU-NatashaNeural">Natasha (Australian Female - Friendly)</option>
                    <option value="en-AU-WilliamNeural">William (Australian Male - Natural)</option>
                    <option value="en-NG-EzinneNeural">Ezinne (Nigerian Female - Dynamic)</option>
                    <option value="en-NG-AbeoNeural">Abeo (Nigerian Male - Energetic)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Video Duration</label>
                <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="15-20 seconds (Short Hook)">15-20 seconds (Short Hook)</option>
                  <option value="30-40 seconds (Standard Reel)">30-40 seconds (Standard Reel)</option>
                  <option value="50-60 seconds (Long Reel)">50-60 seconds (Long Reel)</option>
                  <option value="2-3 minutes (Short Video)">2-3 minutes (Short Video)</option>
                  <option value="4-5 minutes (Long Video)">4-5 minutes (Long Video)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Publish Schedule Time</label>
                <input type="text" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" placeholder="e.g. 04:30 PM" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Video Format (Aspect Ratio)</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="9:16">9:16 (TikTok, Reels, Shorts)</option>
                  <option value="16:9">16:9 (YouTube Landscape)</option>
                  <option value="1:1">1:1 (Square Post)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Background Music Mood</label>
                <select value={bgmTrack} onChange={(e) => setBgmTrack(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="cinematic">Cinematic</option>
                  <option value="suspense">Suspense</option>
                  <option value="lofi">Lofi</option>
                  <option value="inspirational">Inspirational</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Subtitle Color Style</label>
                <select value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="yellow">Neon Yellow (Viral Standard)</option>
                  <option value="white">Pure White</option>
                  <option value="green">Electric Green</option>
                  <option value="cyan">Cyber Cyan</option>
                </select>
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Custom Topic / Angle Description</label>
                <input type="text" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" placeholder="e.g. Unsolved mysteries of the deep ocean..." />
              </div>
            </div>

            <button onClick={handleAutoPilotGenerate} disabled={isAutoPilotRunning} className="w-full py-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 text-white font-extrabold text-lg rounded-2xl shadow-md flex items-center justify-center gap-3 hover:opacity-95 transition">
              {isAutoPilotRunning ? <><LoadingSpinner /> {autoPilotStatus}</> : '✨ Generate 1-Click Viral Reel Now'}
            </button>

            {autoPilotVideoUrl && (
              <div className="pt-8 border-t border-slate-100 space-y-6 flex flex-col items-center">
                <h3 className="text-lg font-bold text-emerald-600">🎉 Your 1-Click Viral Reel is Ready!</h3>
                <div className="w-full max-w-sm rounded-3xl overflow-hidden border-4 border-slate-200 bg-slate-950 shadow-xl">
                  <video controls autoPlay src={autoPilotVideoUrl} className="w-full h-auto max-h-[550px] object-contain" />
                </div>
                <a href={autoPilotVideoUrl} download="autofrix-autopilot-reel.mp4" className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md transition">
                  📥 Download Final MP4 Video
                </a>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* SERIES SCHEDULER MODE */}
        {/* ============================================================== */}
        {appMode === 'series' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">🔄 24/7 Autonomous Series Scheduler</h2>
            <p className="text-xs text-slate-500">Configure your channel presets and target platforms. Our background cron worker will generate and post new episodes automatically to your selected channels.</p>
           
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Series Name</label>
                <input type="text" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. Daily Facts" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Niche / Category</label>
                <select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="True Crime & Mystery">True Crime & Mystery</option>
                  <option value="Scary Stories & Horror">Scary Stories & Horror</option>
                  <option value="Fun Facts & Curiosities">Fun Facts & Curiosities</option>
                  <option value="Motivational & Mindset">Motivational & Mindset</option>
                  <option value="Sci-Fi & Tech Explanations">Sci-Fi & Tech Explanations</option>
                  <option value="Historical Untold Facts">Historical Untold Facts</option>
                  <option value="Luxury, Wealth & Success">Luxury, Wealth & Success</option>
                  <option value="Business, Money & Investing">Business, Money & Investing</option>
                  <option value="Health, Fitness & Longevity">Health, Fitness & Longevity</option>
                  <option value="Philosophy & Stoicism">Philosophy & Stoicism</option>
                  <option value="Anime, Gaming & Pop Culture">Anime, Gaming & Pop Culture</option>
                  <option value="Daily Life Hacks & Productivity">Daily Life Hacks & Productivity</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Tone & Style</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="Dramatic, Suspenseful & Intense">Dramatic, Suspenseful & Intense</option>
                  <option value="Energetic & Fast-Paced (Viral Hook)">Energetic & Fast-Paced (Viral Hook)</option>
                  <option value="Calm, Deep & Storytelling">Calm, Deep & Storytelling</option>
                  <option value="Humorous, Sarcastic & Witty">Humorous, Sarcastic & Witty</option>
                  <option value="Epic, Cinematic & Inspiring">Epic, Cinematic & Inspiring</option>
                  <option value="Dark, Whispering & Mysterious">Dark, Whispering & Mysterious</option>
                  <option value="Educational, Authoritative & Clear">Educational, Authoritative & Clear</option>
                  <option value="Controversial & Thought-Provoking">Controversial & Thought-Provoking</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">AI Voice Actor</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <optgroup label="United States Voices">
                    <option value="en-US-JennyNeural">Jenny (US Female)</option>
                    <option value="en-US-GuyNeural">Guy (US Male)</option>
                    <option value="en-US-AriaNeural">Aria (US Female)</option>
                    <option value="en-US-ChristopherNeural">Christopher (US Male)</option>
                  </optgroup>
                  <optgroup label="United Kingdom Voices">
                    <option value="en-GB-SoniaNeural">Sonia (UK Female)</option>
                    <option value="en-GB-RyanNeural">Ryan (UK Male)</option>
                  </optgroup>
                  <optgroup label="Australia & Regional Voices">
                    <option value="en-AU-NatashaNeural">Natasha (Australian Female)</option>
                    <option value="en-AU-WilliamNeural">William (Australian Male)</option>
                    <option value="en-NG-EzinneNeural">Ezinne (Nigerian Female)</option>
                    <option value="en-NG-AbeoNeural">Abeo (Nigerian Male)</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Video Duration</label>
                <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="15-20 seconds (Short Hook)">15-20 seconds (Short Hook)</option>
                  <option value="30-40 seconds (Standard Reel)">30-40 seconds (Standard Reel)</option>
                  <option value="50-60 seconds (Long Reel)">50-60 seconds (Long Reel)</option>
                  <option value="2-3 minutes (Short Video)">2-3 minutes (Short Video)</option>
                  <option value="4-5 minutes (Long Video)">4-5 minutes (Long Video)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Video Format (Aspect Ratio)</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="9:16">9:16 (TikTok, Reels, Shorts)</option>
                  <option value="16:9">16:9 (YouTube Landscape)</option>
                  <option value="1:1">1:1 (Square Post)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Background Music</label>
                <select value={bgmTrack} onChange={(e) => setBgmTrack(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="cinematic">Cinematic</option>
                  <option value="suspense">Suspense</option>
                  <option value="lofi">Lofi</option>
                  <option value="inspirational">Inspirational</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Subtitle Color Style</label>
                <select value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value="yellow">Neon Yellow</option>
                  <option value="white">Pure White</option>
                  <option value="green">Electric Green</option>
                  <option value="cyan">Cyber Cyan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Posting Frequency</label>
                <select value={frequencyHours} onChange={(e) => setFrequencyHours(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                  <option value={12}>Every 12 Hours (2x Daily)</option>
                  <option value={24}>Every 24 Hours (Daily)</option>
                  <option value={48}>Every 48 Hours (2 Days)</option>
                </select>
              </div>

              {/* TARGET SOCIAL PLATFORMS SELECTION */}
              <div className="md:col-span-2 lg:col-span-3 bg-purple-50/50 border border-purple-200 rounded-xl p-4 space-y-2">
                <label className="block text-xs font-bold text-purple-800 uppercase tracking-wider">🎯 Target Social Publishing Channels for this Series</label>
                <p className="text-xs text-slate-500">Choose which connected social accounts should receive auto-posted episodes from this series:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    { id: 'facebook', label: '📘 Facebook', color: 'blue' },
                    { id: 'youtube', label: '🔴 YouTube', color: 'red' },
                    { id: 'tiktok', label: '🎵 TikTok', color: 'cyan' },
                    { id: 'instagram', label: '📸 Instagram', color: 'pink' },
                  ].map((plat) => {
                    const isChecked = targetPlatforms.includes(plat.id);
                    return (
                      <button
                        type="button"
                        key={plat.id}
                        onClick={() => togglePlatform(plat.id)}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                          isChecked ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <span>{plat.label}</span>
                        <span>{isChecked ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Custom Topic / Angle Description</label>
                <input type="text" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} placeholder="e.g. Unsolved mysteries of the deep ocean..." className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
              </div>
            </div>

            <div className="pt-4">
              <button onClick={handleCreateSeriesAutomation} disabled={isCreatingSeries} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition">
                {isCreatingSeries ? 'Creating...' : '+ Create Autonomous Series Channel'}
              </button>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-purple-700">Active Series Channels ({seriesList.length})</h3>
              {seriesList.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-4">No active series scheduled yet.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {seriesList.map((s) => (
                    <div key={s.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-sm">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-sm text-slate-900">{s.series_name}</p>
                          <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-600 text-[10px] rounded-full font-bold">Active 24/7</span>
                        </div>
                        <p className="text-xs text-slate-500">Niche: {s.niche} | Duration: {s.duration || 'Standard'} | Every {s.frequency_hours}h</p>
                        
                        <div className="flex flex-wrap gap-1 pt-1">
                          {(s.target_platforms || ['facebook', 'youtube', 'tiktok', 'instagram']).map((plat) => (
                            <span key={plat} className="text-[10px] font-bold uppercase bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                              {plat}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end pt-2 border-t border-slate-200/60">
                        <button
                          onClick={() => handleRunSeriesNow(s.id)}
                          disabled={runningSeriesId === s.id}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                        >
                          {runningSeriesId === s.id ? <><LoadingSpinner /> Running...</> : '⚡ Run Now'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* SOCIAL AUTO-PUBLISHING HUB */}
        {/* ============================================================== */}
        {appMode === 'social' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">🔗 Social Media Auto-Publishing Hub</h2>
            <p className="text-xs text-slate-500">Connect your platform channels with 1-click OAuth. When your scheduled series run, videos will automatically post to your feed.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                onClick={() => {
                  const origin = window.location.origin;
                  const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID || '';
                  const redirectUri = `${origin}/api/auth/callback/youtube`;
                  const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
                  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${user?.id || ''}`;
                  window.location.href = authUrl;
                }}
                className="p-5 bg-red-50 border border-red-200 hover:bg-red-100 rounded-2xl flex flex-col items-center justify-center space-y-2 transition shadow-sm group"
              >
                <span className="text-2xl">🔴</span>
                <span className="font-bold text-sm text-slate-900 group-hover:text-red-600">Connect YouTube</span>
                <span className="text-[10px] text-slate-500">OAuth 1-Click Authorization</span>
              </button>

              <button
                onClick={() => {
                  window.location.href = '/api/auth/tiktok';
                }}
                className="p-5 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 rounded-2xl flex flex-col items-center justify-center space-y-2 transition shadow-sm group"
              >
                <span className="text-2xl">🎵</span>
                <span className="font-bold text-sm text-slate-900 group-hover:text-cyan-600">Connect TikTok</span>
                <span className="text-[10px] text-slate-500">OAuth 1-Click Authorization</span>
              </button>

              <button
                onClick={() => window.location.href = '/api/auth/facebook'}
                className="p-5 bg-pink-50 border border-pink-200 hover:bg-pink-100 rounded-2xl flex flex-col items-center justify-center space-y-2 transition shadow-sm group"
              >
                <span className="text-2xl">📸</span>
                <span className="font-bold text-sm text-slate-900 group-hover:text-pink-600">Connect Instagram</span>
                <span className="text-[10px] text-slate-500">Meta Graph API</span>
              </button>

              <button
                onClick={() => window.location.href = '/api/auth/facebook'}
                className="p-5 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-2xl flex flex-col items-center justify-center space-y-2 transition shadow-sm group"
              >
                <span className="text-2xl">📘</span>
                <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600">Connect Facebook</span>
                <span className="text-[10px] text-slate-500">Meta Graph API</span>
              </button>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-purple-700">Connected Accounts ({socialAccounts.length})</h3>
              {socialAccounts.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-4">No social accounts connected yet. Click an authorization button above to grant permission!</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {socialAccounts.map((acc) => (
                    <div key={acc.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
                      <div className="flex items-center gap-3">
                        <img 
                          src={acc.avatar_url || 'https://www.svgrepo.com/show/13671/youtube.svg'} 
                          className="w-10 h-10 rounded-full border border-slate-300 object-cover" 
                          alt={acc.account_name} 
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 uppercase">{acc.platform}</span>
                            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-mono">🟢 Active</span>
                          </div>
                          <p className="text-xs text-slate-500">{acc.account_name}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => disconnectAccount(acc.platform)} 
                        className="text-xs text-red-600 hover:text-red-700 transition px-2.5 py-1 bg-red-50 rounded-md border border-red-200 font-medium"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* MANUAL STUDIO WIZARD MODE */}
        {/* ============================================================== */}
        {appMode === 'manual' && (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
              {[
                { num: 1, label: 'Step 1', subtitle: 'Setup & Script' },
                { num: 2, label: 'Step 2', subtitle: 'Voice & Video Clips' },
                { num: 3, label: 'Step 3', subtitle: 'Studio & Export' },
              ].map((stepItem) => (
                <button
                  key={stepItem.num}
                  onClick={() => setCurrentStep(stepItem.num as 1 | 2 | 3)}
                  disabled={(stepItem.num === 2 && !script) || (stepItem.num === 3 && !isStep2Complete)}
                  className={`py-3.5 px-2 sm:px-4 rounded-xl text-center transition-all flex flex-col items-center justify-center ${
                    currentStep === stepItem.num ? 'bg-purple-600 text-white font-bold shadow-md' : currentStep > stepItem.num || (stepItem.num === 2 && script) || (stepItem.num === 3 && isStep2Complete) ? 'bg-slate-50 text-purple-600 border border-purple-200 hover:bg-slate-100' : 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200'
                  }`}
                >
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-wider">{stepItem.label}</div>
                  <div className="text-[11px] opacity-80 hidden sm:block mt-0.5">{stepItem.subtitle}</div>
                </button>
              ))}
            </div>

            {currentStep === 1 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
                <div className="border-b border-slate-100 pb-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-slate-900">Manual Script & Shot Generation</h2>
                  {isLoadedFromHistory && <button onClick={clearLoadedHistory} className="px-3 py-1 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">Reset</button>}
                </div>
               
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Series Name</label>
                    <input type="text" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} placeholder="e.g. Mystery Vault" className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Niche / Category</label>
                    <select value={niche} onChange={(e) => setNiche(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                      <option value="True Crime & Mystery">True Crime & Mystery</option>
                      <option value="Scary Stories & Horror">Scary Stories & Horror</option>
                      <option value="Fun Facts & Curiosities">Fun Facts & Curiosities</option>
                      <option value="Motivational & Mindset">Motivational & Mindset</option>
                      <option value="Sci-Fi & Tech Explanations">Sci-Fi & Tech Explanations</option>
                      <option value="Historical Untold Facts">Historical Untold Facts</option>
                      <option value="Luxury, Wealth & Success">Luxury, Wealth & Success</option>
                      <option value="Business, Money & Investing">Business, Money & Investing</option>
                      <option value="Health, Fitness & Longevity">Health, Fitness & Longevity</option>
                      <option value="Philosophy & Stoicism">Philosophy & Stoicism</option>
                      <option value="Anime, Gaming & Pop Culture">Anime, Gaming & Pop Culture</option>
                      <option value="Daily Life Hacks & Productivity">Daily Life Hacks & Productivity</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Tone & Style</label>
                    <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                      <option value="Dramatic, Suspenseful & Intense">Dramatic, Suspenseful & Intense</option>
                      <option value="Energetic & Fast-Paced (Viral Hook)">Energetic & Fast-Paced (Viral Hook)</option>
                      <option value="Calm, Deep & Storytelling">Calm, Deep & Storytelling</option>
                      <option value="Humorous, Sarcastic & Witty">Humorous, Sarcastic & Witty</option>
                      <option value="Epic, Cinematic & Inspiring">Epic, Cinematic & Inspiring</option>
                      <option value="Dark, Whispering & Mysterious">Dark, Whispering & Mysterious</option>
                      <option value="Educational, Authoritative & Clear">Educational, Authoritative & Clear</option>
                      <option value="Controversial & Thought-Provoking">Controversial & Thought-Provoking</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Video Duration</label>
                    <select value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                      <option value="15-20 seconds (Short Hook)">15-20 seconds (Short Hook)</option>
                      <option value="30-40 seconds (Standard Reel)">30-40 seconds (Standard Reel)</option>
                      <option value="50-60 seconds (Long Reel)">50-60 seconds (Long Reel)</option>
                      <option value="2-3 minutes (Short Video)">2-3 minutes (Short Video)</option>
                      <option value="4-5 minutes (Long Video)">4-5 minutes (Long Video)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Publish Schedule Time</label>
                    <input type="text" value={publishTime} onChange={(e) => setPublishTime(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" placeholder="e.g. 04:30 PM" />
                  </div>

                  <div className="md:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Custom Topic / Angle Description</label>
                    <input type="text" value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12" placeholder="e.g. Unsolved mysteries of the deep ocean..." />
                  </div>
                </div>

                {script && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-emerald-600 uppercase tracking-wider">📝 Script Content (Editable)</label>
                    <textarea rows={6} value={script} onChange={(e) => setScript(e.target.value)} className="w-full bg-slate-50 border border-emerald-300 rounded-xl p-4 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                )}

                {/* Shot & Scene Breakdown List */}
                {shots.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">🎬 Generated Scenes / Shot List ({shots.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {shots.map((shot, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-purple-600">Scene #{shot.shotNumber || idx + 1} ({shot.durationSeconds || 5}s)</span>
                            {(shot.videoUrl || shot.url) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Clip Fetched</span>}
                          </div>
                          <p className="text-xs text-slate-700 font-medium">🗣️ {shot.narration}</p>
                          <p className="text-[11px] text-slate-500 italic">🎥 Prompt: {shot.visualPrompt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4">
                  <button onClick={handleGenerateScript} disabled={isGeneratingScript} className="flex-1 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center transition">
                    {isGeneratingScript ? <><LoadingSpinner /> Generating...</> : '1. Generate Script & Shots ➔'}
                  </button>
                  {script && (
                    <button onClick={() => { saveToSupabase(script, shots, audioUrl, activeHistoryId); setCurrentStep(2); }} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md flex items-center justify-center transition">
                      Proceed to Step 2 ➔
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">🎙 Generate Voiceover MP3</h3>
                    <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                      <optgroup label="United States Voices">
                        <option value="en-US-JennyNeural">Jenny (US Female)</option>
                        <option value="en-US-GuyNeural">Guy (US Male)</option>
                        <option value="en-US-AriaNeural">Aria (US Female)</option>
                        <option value="en-US-ChristopherNeural">Christopher (US Male)</option>
                      </optgroup>
                      <optgroup label="United Kingdom Voices">
                        <option value="en-GB-SoniaNeural">Sonia (UK Female)</option>
                        <option value="en-GB-RyanNeural">Ryan (UK Male)</option>
                      </optgroup>
                      <optgroup label="Australia & Regional Voices">
                        <option value="en-AU-NatashaNeural">Natasha (Australian Female)</option>
                        <option value="en-AU-WilliamNeural">William (Australian Male)</option>
                        <option value="en-NG-EzinneNeural">Ezinne (Nigerian Female)</option>
                        <option value="en-NG-AbeoNeural">Abeo (Nigerian Male)</option>
                      </optgroup>
                    </select>
                    <button onClick={handleGenerateVoiceover} disabled={isGeneratingVoice} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition flex items-center justify-center shadow-sm">
                      {isGeneratingVoice ? <><LoadingSpinner /> Synthesizing...</> : '⚡ Generate Voiceover'}
                    </button>
                    {audioUrl && <audio controls src={audioUrl} className="w-full h-8" />}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">🎬 Fetch Video Clips</h3>
                    <button onClick={handleRenderVideos} disabled={isRenderingVideos} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition flex items-center justify-center shadow-sm">
                      {isRenderingVideos ? <><LoadingSpinner /> Fetching...</> : '🎥 Fetch Clips via Pixabay'}
                    </button>
                  </div>
                </div>

                {/* Fetched Clips Media Grid Preview in Step 2 */}
                {shots.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">🖼️ Fetched Media Clips Preview</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {shots.map((shot, idx) => {
                        const mediaSrc = shot.videoUrl || shot.url || shot.imageUrl || '';
                        const isVideo = mediaSrc.includes('.mp4') || mediaSrc.includes('pixabay') || mediaSrc.includes('video');
                        return (
                          <div key={idx} className="bg-slate-950 border border-slate-200 rounded-xl overflow-hidden p-2 flex flex-col items-center">
                            <div className="w-full h-36 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
                              {mediaSrc ? (
                                isVideo ? (
                                  <video src={mediaSrc} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                                ) : (
                                  <img src={mediaSrc} alt={`Scene ${idx + 1}`} className="w-full h-full object-cover" />
                                )
                              ) : (
                                <span className="text-slate-500 text-xs">No media yet</span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-300 mt-2 font-medium">Scene #{shot.shotNumber || idx + 1}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button onClick={() => setCurrentStep(3)} disabled={!isStep2Complete} className="w-full sm:w-auto px-8 py-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition">
                    Proceed to Studio Preview (Step 3) ➔
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-10 space-y-8 shadow-sm">
                <div className="flex justify-between border-b border-slate-100 pb-4">
                  <h2 className="text-2xl font-bold text-slate-900">📱 Studio Preview & Final MP4 Stitching</h2>
                  <button onClick={() => setCurrentStep(2)} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs rounded-lg hover:bg-slate-200 font-medium">← Back to Step 2</button>
                </div>

                {audioUrl && <audio ref={playerAudioRef} src={audioUrl} onTimeUpdate={handleAudioTimeUpdate} onEnded={handleAudioEnded} />}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start justify-items-center">
                  <div className="space-y-4 w-full flex flex-col items-center">
                    <div className="relative w-full max-w-[300px] h-[520px] bg-slate-950 rounded-3xl overflow-hidden border-4 border-slate-200 shadow-xl flex items-center justify-center">
                      {hasAnyVideos && (shots[currentShotIndex]?.videoUrl || shots[currentShotIndex]?.url || shots[currentShotIndex]?.imageUrl) ? (
                        (() => {
                          const currentMedia = shots[currentShotIndex]?.videoUrl || shots[currentShotIndex]?.url || shots[currentShotIndex]?.imageUrl || '';
                          const isVid = currentMedia.includes('.mp4') || currentMedia.includes('pixabay') || currentMedia.includes('video');
                          return isVid ? (
                            <video src={currentMedia} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                          ) : (
                            <img src={currentMedia} alt="Preview" className="w-full h-full object-cover" />
                          );
                        })()
                      ) : (
                        <div className="text-slate-400 text-xs">No media preview</div>
                      )}
                      {shots[currentShotIndex]?.narration && (
                        <div className="absolute bottom-10 inset-x-4 bg-black/80 p-3 rounded-xl text-center">
                          <p className="text-yellow-400 text-xs font-bold">{shots[currentShotIndex].narration}</p>
                        </div>
                      )}
                    </div>
                    <button onClick={togglePlaySyncedReel} className="w-full max-w-[300px] py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm">
                      {isPlaying ? '⏸ Pause' : '▶ Play Preview'}
                    </button>
                  </div>

                  <div className="w-full space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Export Settings</h3>
                      <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                        <option value="9:16">9:16 (TikTok, Reels, Shorts)</option>
                        <option value="16:9">16:9 (YouTube Landscape)</option>
                        <option value="1:1">1:1 (Square Post)</option>
                      </select>
                      <select value={bgmTrack} onChange={(e) => setBgmTrack(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                        <option value="cinematic">Cinematic BGM</option>
                        <option value="suspense">Suspense BGM</option>
                        <option value="lofi">Lofi BGM</option>
                        <option value="inspirational">Inspirational BGM</option>
                      </select>
                      <select value={captionColor} onChange={(e) => setCaptionColor(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 h-12">
                        <option value="yellow">Neon Yellow Captions</option>
                        <option value="white">White Captions</option>
                        <option value="green">Electric Green Captions</option>
                        <option value="cyan">Cyber Cyan Captions</option>
                      </select>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
                      <button onClick={handleStitchVideo} disabled={isStitching || !hasAnyVideos} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-md flex items-center justify-center">
                        {isStitching ? <><LoadingSpinner /> Compiling Video...</> : '💾 Stitch & Compile Final Video'}
                      </button>

                      {finalVideoUrl && (
                        <div className="space-y-4 pt-4 border-t border-slate-200 flex flex-col items-center">
                          <video controls autoPlay src={finalVideoUrl} className="w-full max-h-[400px] rounded-2xl bg-black shadow-md" />
                          <a href={finalVideoUrl} download="autofrix-ai-video.mp4" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-center rounded-2xl shadow-sm transition">
                            📥 Download Final Video (.mp4)
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Saved Projects History Grid */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold uppercase tracking-wider text-purple-700">📁 My Saved Projects ({history.length})</h2>
            <button onClick={fetchUserData} disabled={isLoadingHistory} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-medium transition">🔄 Sync</button>
          </div>
          {history.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 italic">No saved projects found for this account.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((item) => (
                <button key={item.id} onClick={() => handleSelectHistoryItem(item)} className="text-left p-4 rounded-xl border bg-slate-50 border-slate-200 hover:border-purple-300 hover:bg-purple-50/30 transition shadow-sm">
                  <p className="font-bold text-sm text-slate-900 truncate">{item.series_name}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.niche}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global Dashboard Footer with Privacy Policy */}
        <footer className="text-center pt-8 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} Autofrix AI. All rights reserved.</p>
          <p>
            <a href="#privacy" onClick={(e) => { e.preventDefault(); alert('Privacy Policy: All data is kept secure and processed via Supabase & Vercel serverless functions.'); }} className="text-purple-600 hover:underline">Privacy Policy</a> |{' '}
            <a href="#terms" onClick={(e) => { e.preventDefault(); alert('Terms of Service: Automated video generation platform for creators.'); }} className="text-purple-600 hover:underline">Terms of Service</a>
          </p>
        </footer>

      </div>

      {/* ============================================================== */}
      {/* USER PROFILE MODAL (Pro Web App Style) */}
      {/* ============================================================== */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 p-6 sm:p-8 text-white shadow-2xl border border-slate-800 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold flex items-center justify-center text-lg shadow-lg">
                  {user.email ? user.email[0].toUpperCase() : 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-bold">Account Profile</h3>
                  <p className="text-xs text-slate-400">Manage your subscription & settings</p>
                </div>
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-white text-xl p-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition">✕</button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Email Address</p>
                <p className="text-sm font-medium text-purple-300 break-all">{user.email}</p>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Account Plan</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-emerald-400">Free Creator Tier</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-500/30 font-semibold">Active</span>
                </div>
              </div>

              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-1">
                <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Storage & Projects</p>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-300">Saved Projects Stored</span>
                  <span className="font-bold text-indigo-300">{history.length} projects</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button 
                onClick={handleLogout}
                className="w-full py-4 px-4 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-bold border border-red-500/30 transition flex items-center justify-center gap-2"
              >
                <span>🚪</span> Sign Out of Account
              </button>
              <button 
                onClick={() => setIsProfileOpen(false)}
                className="w-full py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}