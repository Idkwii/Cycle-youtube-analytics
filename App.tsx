
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MyAnalyticsDashboard from './components/MyAnalyticsDashboard'; // New Component
import { Channel, Folder, Video, AnalysisPeriod, AnalyticsDataPoint } from './types';
import { fetchChannelInfo, fetchRecentVideos, fetchAnalyticsReport } from './services/youtubeService';
import LZString from 'lz-string';
import { CheckCircle2, AlertCircle, Settings } from 'lucide-react';

const STORAGE_KEY = 'yt_dashboard_state';
const VIDEO_CACHE_KEY = 'yt_dashboard_videos';

/**
 * [중요] 여기에 본인의 YouTube Data API v3 키를 입력하세요.
 * 여기에 입력하면 공유받은 모든 사람이 별도의 입력 없이 바로 결과를 볼 수 있습니다.
 */
const CONST_API_KEY = 'AIzaSyA3JRkSp_eMJ3oWKhqDwIbY5IVbb99Uobc'; 

/**
 * [필수] 내 채널 분석을 위해 필요한 OAuth 2.0 Client ID입니다.
 */
const DEFAULT_OAUTH_CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';

const getInitialApiKey = () => {
  if (CONST_API_KEY) return CONST_API_KEY;
  try {
    // @ts-ignore
    return import.meta.env?.VITE_YOUTUBE_API_KEY || ''; 
  } catch {
    return '';
  }
};

const getInitialClientId = () => {
    try {
        // @ts-ignore
        const envId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
        if (envId) return envId;
    } catch {}
    return DEFAULT_OAUTH_CLIENT_ID;
};

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey());
  const [oauthClientId, setOauthClientId] = useState<string>(getInitialClientId());
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [period, setPeriod] = useState<AnalysisPeriod>(30);
  const [videos, setVideos] = useState<Video[]>([]);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [dataPeriod, setDataPeriod] = useState<AnalysisPeriod | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Navigation State
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'MY_ANALYTICS'>('DASHBOARD');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // My Analytics State
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDataPoint[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  
  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // --- Google OAuth Init ---
  useEffect(() => {
    // @ts-ignore
    if (window.google && oauthClientId && !oauthClientId.includes('YOUR_CLIENT_ID')) {
        // @ts-ignore
        window.google.accounts.oauth2.initTokenClient({
            client_id: oauthClientId,
            scope: 'https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly',
            callback: (response: any) => {
                if (response.access_token) {
                    setAccessToken(response.access_token);
                    loadMyAnalytics(response.access_token);
                } else {
                    showToast("로그인 실패", 'error');
                }
            },
        });
    }
  }, [showToast, oauthClientId]);

  const handleLogin = () => {
    if (!oauthClientId || oauthClientId.includes('YOUR_CLIENT_ID')) {
        showToast("설정에서 OAuth Client ID를 입력해주세요.", 'error');
        // 설정 메뉴를 열도록 유도하면 좋겠지만, 일단 메시지로 안내
        return;
    }
    // @ts-ignore
    const client = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: oauthClientId,
        scope: 'https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly',
        callback: (response: any) => {
            if (response.access_token) {
                setAccessToken(response.access_token);
                loadMyAnalytics(response.access_token);
                setCurrentView('MY_ANALYTICS');
            }
        },
    });
    client.requestAccessToken();
  };

  const loadMyAnalytics = async (token: string) => {
      setIsAnalyticsLoading(true);
      try {
          const data = await fetchAnalyticsReport(token, period);
          setAnalyticsData(data);
          showToast("내 채널 분석 데이터를 불러왔습니다.", 'success');
      } catch (e: any) {
          console.error(e);
          showToast(e.message, 'error');
      } finally {
          setIsAnalyticsLoading(false);
      }
  };

  // 1. 초기화 Logic (기존 유지)
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedVideos = localStorage.getItem(VIDEO_CACHE_KEY);

    let initialApiKey = getInitialApiKey();
    let initialClientId = getInitialClientId();
    let initialChannels: Channel[] = [];
    let initialFolders: Folder[] = [];
    let initialPeriod: AnalysisPeriod = 30;
    let dataLoadedFromShare = false;

    if (savedState) {
      const parsed = JSON.parse(savedState);
      initialApiKey = CONST_API_KEY || parsed.apiKey || initialApiKey;
      initialClientId = parsed.oauthClientId || initialClientId;
      initialChannels = parsed.channels || [];
      initialFolders = parsed.folders || [];
      initialPeriod = parsed.period || 30;
    }

    const params = new URLSearchParams(window.location.search);
    const shareData = params.get('share');
    if (shareData) {
      try {
        let jsonStr = LZString.decompressFromEncodedURIComponent(shareData);
        if (!jsonStr) {
            try {
                jsonStr = decodeURIComponent(escape(window.atob(shareData)));
            } catch (e) { /* ignore */ }
        }
        if (jsonStr) {
            const data = JSON.parse(jsonStr);
            if (data.c && Array.isArray(data.c)) {
                if (data.k && !CONST_API_KEY) initialApiKey = data.k;
                if (data.f) {
                    initialFolders = data.f.map((f: any[]) => ({ id: f[0], name: f[1] }));
                }
                initialChannels = data.c.map((c: any[]) => ({
                    id: c[0],
                    folderId: c[1],
                    title: c[2],
                    thumbnail: '', 
                    uploadsPlaylistId: c[0].replace(/^UC/, 'UU'),
                    handle: ''
                }));
            } else {
                if (data.apiKey && !CONST_API_KEY) initialApiKey = data.apiKey;
                if (data.channels) initialChannels = data.channels;
                if (data.folders) initialFolders = data.folders;
            }
            dataLoadedFromShare = true;
        }
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {
        console.error("Failed to parse shared data", e);
      }
    }

    setApiKey(initialApiKey);
    setOauthClientId(initialClientId);
    setChannels(initialChannels);
    setFolders(initialFolders);
    setPeriod(initialPeriod);

    if (savedVideos) {
      const parsed = JSON.parse(savedVideos);
      setVideos(parsed.data || []);
      setLastFetched(parsed.timestamp || null);
      setDataPeriod(parsed.period || null);
    }

    if (dataLoadedFromShare) {
        setTimeout(() => showToast("공유된 대시보드 설정을 불러왔습니다.", 'success'), 500);
    }
  }, [showToast]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, oauthClientId, channels, folders, period }));
  }, [apiKey, oauthClientId, channels, folders, period]);

  const getShareLink = useCallback(() => {
     try {
        const minifiedData: any = {
            f: folders.map(f => [f.id, f.name]),
            c: channels.map(c => [c.id, c.folderId, c.title])
        };
        if (!CONST_API_KEY && apiKey) {
            minifiedData.k = apiKey;
        }
        const jsonStr = JSON.stringify(minifiedData);
        const compressed = LZString.compressToEncodedURIComponent(jsonStr);
        return `${window.location.origin}${window.location.pathname}?share=${compressed}`;
    } catch (e) {
        return window.location.href;
    }
  }, [folders, channels, apiKey]);

  useEffect(() => {
    if (videos.length > 0) {
      localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify({ 
        data: videos, 
        timestamp: lastFetched,
        period: dataPeriod 
      }));
    }
  }, [videos, lastFetched, dataPeriod]);

  const refreshData = useCallback(async (customPeriod?: AnalysisPeriod, force = false) => {
    if (!apiKey || channels.length === 0) return;
    const now = Date.now();
    if (!force && !customPeriod && lastFetched && (now - lastFetched < 30 * 60 * 1000)) return;
    
    setIsLoading(true);
    try {
      const targetPeriod = customPeriod || period;
      const newVideos = await fetchRecentVideos(channels, apiKey, targetPeriod);
      setVideos(newVideos);
      setDataPeriod(targetPeriod);
      setLastFetched(Date.now());
      showToast("데이터 업데이트 완료", 'success');
    } catch (error: any) {
      showToast("데이터 업데이트 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels, period, lastFetched, showToast]);

  useEffect(() => {
    if (currentView === 'DASHBOARD' && apiKey && channels.length > 0) {
      if (dataPeriod !== period || !lastFetched) {
        refreshData(period);
      }
    } else if (currentView === 'MY_ANALYTICS' && accessToken) {
        loadMyAnalytics(accessToken);
    }
  }, [apiKey, channels, period, dataPeriod, lastFetched, refreshData, currentView, accessToken]);

  const addFolder = (name: string) => {
    setFolders([...folders, { id: `f-${Date.now()}`, name }]);
  };

  const addChannel = async (identifier: string, folderId: string) => {
    if (!apiKey) {
      showToast("코드 내부에 API 키가 설정되지 않았습니다.", 'error');
      return;
    }
    setIsLoading(true);
    try {
      const info = await fetchChannelInfo(identifier, apiKey);
      if (channels.some(c => c.id === info.id)) {
        showToast("이미 등록된 채널입니다.", 'error');
        return;
      }
      let targetId = folderId || (folders.length > 0 ? folders[0].id : null);
      if (!targetId) {
          const newF = { id: `f-${Date.now()}`, name: '기본 폴더' };
          setFolders([newF]);
          targetId = newF.id;
      }
      const newChannel = { ...info, folderId: targetId };
      setChannels(prev => [...prev, newChannel]);
      const newV = await fetchRecentVideos([newChannel], apiKey, period);
      setVideos(prev => [...prev, ...newV]);
      showToast(`'${info.title}' 채널이 추가되었습니다.`, 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    setVideos(videos.filter(v => v.channelId !== id));
    showToast("채널이 삭제되었습니다.", 'success');
  };

  const moveChannel = (channelId: string, targetFolderId: string) => {
    setChannels(prev => prev.map(c => c.id === channelId ? { ...c, folderId: targetFolderId } : c));
  };

  return (
    <div className="flex h-screen bg-slate-50 relative">
      <Sidebar 
        apiKey={apiKey} setApiKey={setApiKey}
        folders={folders} channels={channels}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={(id) => { setSelectedFolderId(id); setSelectedChannelId(null); setCurrentView('DASHBOARD'); }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={(id) => { setSelectedChannelId(id); if(id) setCurrentView('DASHBOARD'); }}
        addFolder={addFolder} addChannel={addChannel}
        deleteChannel={deleteChannel} moveChannel={moveChannel}
        refreshData={() => refreshData(undefined, true)}
        getShareLink={getShareLink}
        showToast={showToast}
        onLoginClick={handleLogin}
        currentView={currentView}
        setCurrentView={setCurrentView}
      />
      <main className="flex-1 ml-80 overflow-y-auto">
        {currentView === 'DASHBOARD' ? (
            <Dashboard 
                videos={videos} channels={channels}
                selectedFolderId={selectedFolderId}
                selectedChannelId={selectedChannelId}
                folders={folders} isLoading={isLoading}
                period={period} setPeriod={setPeriod}
                apiKey={apiKey} setApiKey={setApiKey}
                oauthClientId={oauthClientId} setOauthClientId={setOauthClientId} // NEW
            />
        ) : (
            <div className="relative h-full">
                {isAnalyticsLoading && (
                    <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                    </div>
                )}
                {!accessToken ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4">
                         <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                            <CheckCircle2 size={32} />
                        </div>
                        <h2 className="text-xl font-bold">내 채널 분석을 위해 로그인이 필요합니다</h2>
                        <button 
                            onClick={handleLogin}
                            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg"
                        >
                            구글 계정으로 로그인
                        </button>
                        <p className="text-sm text-slate-400 max-w-sm text-center">
                            * 수익, 구독자 증감 등 민감한 데이터는<br/>본인 인증 후에만 볼 수 있습니다.
                        </p>
                        <div className="mt-8 p-4 bg-slate-100 rounded-lg text-xs text-slate-500 max-w-sm text-center">
                            로그인이 안 되나요?<br/>
                            우측 하단 <Settings size={12} className="inline"/> 아이콘을 눌러 <strong>OAuth Client ID</strong>를 입력하세요.
                        </div>
                    </div>
                ) : (
                    <MyAnalyticsDashboard data={analyticsData} period={period} />
                )}
            </div>
        )}
      </main>

      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none">
        {toasts.map(toast => (
            <div 
                key={toast.id} 
                className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border animate-in slide-in-from-bottom-5 fade-in duration-300 ${
                    toast.type === 'success' ? 'bg-slate-900 text-white border-slate-800' : 'bg-red-50 text-red-600 border-red-200'
                }`}
            >
                {toast.type === 'success' ? <CheckCircle2 size={18} className="text-green-400" /> : <AlertCircle size={18} />}
                <span className="text-sm font-medium">{toast.message}</span>
            </div>
        ))}
      </div>
    </div>
  );
};

export default App;
