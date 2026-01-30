
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { AppState, Channel, Folder, Video, AnalysisPeriod } from './types';
import { fetchChannelInfo, fetchRecentVideos } from './services/youtubeService';

const STORAGE_KEY = 'yt_dashboard_state';
const VIDEO_CACHE_KEY = 'yt_dashboard_videos';

const getEnvApiKey = () => {
  try {
    // @ts-ignore
    return import.meta.env?.VITE_YOUTUBE_API_KEY || '';
  } catch {
    return '';
  }
};

const DEFAULT_API_KEY = getEnvApiKey();

const App: React.FC = () => {
  // 기본 상태 로드
  const [apiKey, setApiKey] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.apiKey || DEFAULT_API_KEY;
    }
    return DEFAULT_API_KEY;
  });

  const [channels, setChannels] = useState<Channel[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).channels || [] : [];
  });

  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).folders || [] : [];
  });

  const [period, setPeriod] = useState<AnalysisPeriod>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).period || 30 : 30;
  });

  // 영상 데이터 및 메타데이터 (캐시 적용)
  const [videos, setVideos] = useState<Video[]>(() => {
    const saved = localStorage.getItem(VIDEO_CACHE_KEY);
    return saved ? JSON.parse(saved).data || [] : [];
  });
  
  const [lastFetched, setLastFetched] = useState<number | null>(() => {
    const saved = localStorage.getItem(VIDEO_CACHE_KEY);
    return saved ? JSON.parse(saved).timestamp || null : null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // 설정값 저장
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, channels, folders, period }));
  }, [apiKey, channels, folders, period]);

  // 영상 데이터 캐시 저장
  useEffect(() => {
    if (videos.length > 0) {
        localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify({ data: videos, timestamp: lastFetched }));
    }
  }, [videos, lastFetched]);

  const refreshData = useCallback(async (customPeriod?: AnalysisPeriod, force = false) => {
    if (!apiKey) return;
    if (channels.length === 0) return;

    // 강제 새로고침이 아니고, 최근 30분 이내에 불러온 적이 있다면 생략 (할당량 보호)
    const now = Date.now();
    if (!force && lastFetched && (now - lastFetched < 30 * 60 * 1000) && !customPeriod) {
        console.log("Using cached data (fetched less than 30 mins ago)");
        return;
    }
    
    setIsLoading(true);
    try {
      const targetPeriod = customPeriod || period;
      const newVideos = await fetchRecentVideos(channels, apiKey, targetPeriod);
      setVideos(newVideos);
      setLastFetched(Date.now());
    } catch (error: any) {
      alert(error.message);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels, period, lastFetched]);

  // 앱 시작 시 또는 기간 변경 시 데이터 로드
  useEffect(() => {
    if (apiKey && channels.length > 0) {
        // 이미 영상이 있고 마지막 업데이트가 1시간 이내라면 자동 새로고침 안함
        const shouldAutoRefresh = !lastFetched || (Date.now() - lastFetched > 60 * 60 * 1000);
        if (shouldAutoRefresh) {
            refreshData();
        }
    }
  }, [period]);

  const addFolder = (name: string) => {
    setFolders([...folders, { id: `f-${Date.now()}`, name }]);
  };

  const addChannel = async (identifier: string, folderId: string) => {
    if (!apiKey) { alert("API 키를 먼저 입력해주세요."); return; }
    
    setIsLoading(true);
    try {
      const info = await fetchChannelInfo(identifier, apiKey);
      if (channels.some(c => c.id === info.id)) {
        alert("이미 등록된 채널입니다.");
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
      
      // 새 채널 추가 시에는 즉시 데이터 한 번 가져오기
      const newV = await fetchRecentVideos([newChannel], apiKey, period);
      setVideos(prev => [...prev, ...newV]);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    setVideos(videos.filter(v => v.channelId !== id));
  };

  const moveChannel = (channelId: string, targetFolderId: string) => {
    setChannels(prev => prev.map(c => c.id === channelId ? { ...c, folderId: targetFolderId } : c));
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        apiKey={apiKey} setApiKey={setApiKey}
        folders={folders} channels={channels}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={(id) => { setSelectedFolderId(id); setSelectedChannelId(null); }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={setSelectedChannelId}
        addFolder={addFolder} addChannel={addChannel}
        deleteChannel={deleteChannel} moveChannel={moveChannel}
        refreshData={() => refreshData(undefined, true)} // 버튼 클릭 시 강제 새로고침
      />
      <main className="flex-1 ml-80 overflow-y-auto">
        {apiKey ? (
             <Dashboard 
                videos={videos} channels={channels}
                selectedFolderId={selectedFolderId}
                selectedChannelId={selectedChannelId}
                folders={folders} isLoading={isLoading}
                period={period} setPeriod={setPeriod}
             />
        ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
                <div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-200 text-center max-w-lg">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">API 키가 필요합니다</h2>
                    <p className="text-slate-600 mb-4">사이드바 설정에서 API 키를 입력해 주세요.</p>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
