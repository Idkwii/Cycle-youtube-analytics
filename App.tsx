
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { Channel, Folder, Video, AnalysisPeriod } from './types';
import { fetchChannelInfo, fetchRecentVideos } from './services/youtubeService';
import LZString from 'lz-string';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const STORAGE_KEY = 'yt_dashboard_state';
const VIDEO_CACHE_KEY = 'yt_dashboard_videos';

/**
 * [중요] 여기에 본인의 YouTube Data API v3 키를 입력하세요.
 * 여기에 입력하면 공유받은 모든 사람이 별도의 입력 없이 바로 결과를 볼 수 있습니다.
 */
const CONST_API_KEY = 'AIzaSyA3JRkSp_eMJ3oWKhqDwIbY5IVbb99Uobc'; // <-- 여기에 'AIza...'로 시작하는 키를 입력하세요.

const getInitialApiKey = () => {
  if (CONST_API_KEY) return CONST_API_KEY;
  try {
    // @ts-ignore
    return import.meta.env?.VITE_YOUTUBE_API_KEY || ''; 
  } catch {
    return '';
  }
};

// 토스트 메시지 타입 정의
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(getInitialApiKey());
  const [channels, setChannels] = useState<Channel[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [period, setPeriod] = useState<AnalysisPeriod>(30);
  const [videos, setVideos] = useState<Video[]>([]);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [dataPeriod, setDataPeriod] = useState<AnalysisPeriod | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  
  // 토스트 상태 관리
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // 1. 초기화: 로컬 스토리지 및 URL 공유 파라미터 확인
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedVideos = localStorage.getItem(VIDEO_CACHE_KEY);

    let initialApiKey = getInitialApiKey();
    let initialChannels: Channel[] = [];
    let initialFolders: Folder[] = [];
    let initialPeriod: AnalysisPeriod = 30;
    let dataLoadedFromShare = false;

    // 로컬 스토리지 로드
    if (savedState) {
      const parsed = JSON.parse(savedState);
      initialApiKey = CONST_API_KEY || parsed.apiKey || initialApiKey;
      initialChannels = parsed.channels || [];
      initialFolders = parsed.folders || [];
      initialPeriod = parsed.period || 30;
    }

    // URL 파라미터(공유 데이터) 로드
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
        
        // [핵심] URL 세탁 (Clean URL)
        window.history.replaceState({}, '', window.location.pathname);
        
      } catch (e) {
        console.error("Failed to parse shared data", e);
      }
    }

    setApiKey(initialApiKey);
    setChannels(initialChannels);
    setFolders(initialFolders);
    setPeriod(initialPeriod);

    if (savedVideos) {
      const parsed = JSON.parse(savedVideos);
      setVideos(parsed.data || []);
      setLastFetched(parsed.timestamp || null);
      setDataPeriod(parsed.period || null);
    }

    // 공유된 데이터로 로드되었음을 알림
    if (dataLoadedFromShare) {
        // UI 렌더링 후 알림을 띄우기 위해 약간의 지연
        setTimeout(() => showToast("공유된 대시보드 설정을 불러왔습니다.", 'success'), 500);
    }
  }, [showToast]);

  // 2. 상태 변경 시 로컬 스토리지만 동기화
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, channels, folders, period }));
  }, [apiKey, channels, folders, period]);

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
        console.error("Link generation failed", e);
        return window.location.href;
    }
  }, [folders, channels, apiKey]);

  // 영상 데이터 캐시 저장
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
      console.error(error.message);
      showToast("데이터 업데이트 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels, period, lastFetched, showToast]);

  useEffect(() => {
    if (apiKey && channels.length > 0) {
      if (dataPeriod !== period || !lastFetched) {
        refreshData(period);
      }
    }
  }, [apiKey, channels, period, dataPeriod, lastFetched, refreshData]);

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
        setSelectedFolderId={(id) => { setSelectedFolderId(id); setSelectedChannelId(null); }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={setSelectedChannelId}
        addFolder={addFolder} addChannel={addChannel}
        deleteChannel={deleteChannel} moveChannel={moveChannel}
        refreshData={() => refreshData(undefined, true)}
        getShareLink={getShareLink}
        showToast={showToast}
      />
      <main className="flex-1 ml-80 overflow-y-auto">
        <Dashboard 
          videos={videos} channels={channels}
          selectedFolderId={selectedFolderId}
          selectedChannelId={selectedChannelId}
          folders={folders} isLoading={isLoading}
          period={period} setPeriod={setPeriod}
          apiKey={apiKey} setApiKey={setApiKey}
        />
      </main>

      {/* Toast Notification Container */}
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
