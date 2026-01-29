import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { AppState, Channel, Folder, Video, AnalysisPeriod } from './types';
import { fetchChannelInfo, fetchRecentVideos } from './services/youtubeService';

const STORAGE_KEY = 'yt_dashboard_state';

const getEnvApiKey = () => {
  try {
    // @ts-ignore
    return import.meta.env?.VITE_YOUTUBE_API_KEY || '';
  } catch {
    return '';
  }
};

const DEFAULT_API_KEY = getEnvApiKey();

const getSharedData = (): Partial<AppState> | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const shareParam = params.get('share');
  
  if (!shareParam) return null;
  
  try {
    const jsonStr = decodeURIComponent(escape(window.atob(shareParam)));
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse shared configuration", e);
    return null;
  }
};

const sharedData = getSharedData();

const loadInitialState = <T,>(key: keyof AppState, defaultValue: T): T => {
  if (sharedData && sharedData[key] !== undefined) {
      return sharedData[key] as T;
  }

  try {
    const storedState = localStorage.getItem(STORAGE_KEY);
    if (storedState) {
      const parsed = JSON.parse(storedState);
      if (key === 'apiKey' && (!parsed[key] || parsed[key] === '') && defaultValue) {
          return defaultValue;
      }
      return parsed[key] !== undefined ? parsed[key] : defaultValue;
    }
  } catch (e) {
    console.error("Failed to load state", e);
  }

  return defaultValue;
};

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => loadInitialState('apiKey', DEFAULT_API_KEY));
  const [channels, setChannels] = useState<Channel[]>(() => loadInitialState('channels', []));
  const [folders, setFolders] = useState<Folder[]>(() => loadInitialState('folders', []));
  const [period, setPeriod] = useState<AnalysisPeriod>(() => loadInitialState('period', 30));
  
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  useEffect(() => {
    const stateToSave: Partial<AppState> = {
      apiKey,
      channels,
      folders,
      period,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [apiKey, channels, folders, period]);


  const refreshData = useCallback(async (customPeriod?: AnalysisPeriod) => {
    if (!apiKey || channels.length === 0) return;
    
    setIsLoading(true);
    try {
      const newVideos = await fetchRecentVideos(channels, apiKey, customPeriod || period);
      setVideos(newVideos);
    } catch (error: any) {
      alert(`데이터 로드 실패: ${error.message}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels, period]);

  // 기간이 변경될 때 자동으로 새로고침
  useEffect(() => {
    if (apiKey && channels.length > 0) {
        refreshData();
    }
  }, [period, apiKey]);

  useEffect(() => {
      if (sharedData && apiKey && channels.length > 0) {
          const timer = setTimeout(() => {
              refreshData();
          }, 500);
          return () => clearTimeout(timer);
      }
  }, []);

  const addFolder = (name: string) => {
    const newFolder: Folder = {
      id: `f-${Date.now()}`,
      name,
    };
    setFolders([...folders, newFolder]);
  };

  const addChannel = async (identifier: string, folderId: string) => {
    if (!apiKey) {
      alert("먼저 YouTube API 키를 설정 섹션에 입력해주세요.");
      return;
    }
    
    try {
      const info = await fetchChannelInfo(identifier, apiKey);
      
      if (channels.some(c => c.id === info.id)) {
        alert(`'${info.title}' 채널은 이미 추가되어 있습니다.`);
        return;
      }

      let targetFolderId = folderId;
      let currentFolders = [...folders];

      if (!targetFolderId) {
          if (currentFolders.length === 0) {
              const newFolderId = `f-${Date.now()}`;
              const newFolder = { id: newFolderId, name: '기본 폴더' };
              currentFolders = [newFolder];
              setFolders(currentFolders);
              targetFolderId = newFolderId;
          } else {
              targetFolderId = currentFolders[0].id;
          }
      }

      const newChannel: Channel = {
        ...info,
        folderId: targetFolderId,
      };
      
      const updatedChannels = [...channels, newChannel];
      setChannels(updatedChannels);
      
      if (!selectedFolderId) {
          setSelectedFolderId(targetFolderId);
      }
      
      const newVideos = await fetchRecentVideos([newChannel], apiKey, period);
      setVideos(prev => [...prev, ...newVideos]);

    } catch (error: any) {
      console.error(error);
      alert(`채널 추가 실패: ${error.message}\n\n도움말: 핸들은 @를 포함해 입력(예: @YouTube)하거나, 검색어를 정확히 입력해주세요.`);
    }
  };

  const deleteChannel = (id: string) => {
    setChannels(channels.filter(c => c.id !== id));
    setVideos(videos.filter(v => v.channelId !== id));
    if (selectedChannelId === id) setSelectedChannelId(null);
  };

  const moveChannel = (channelId: string, targetFolderId: string) => {
    setChannels(prev => prev.map(c => 
      c.id === channelId ? { ...c, folderId: targetFolderId } : c
    ));
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar 
        apiKey={apiKey}
        setApiKey={setApiKey}
        folders={folders}
        channels={channels}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={(id) => {
            setSelectedFolderId(id);
            setSelectedChannelId(null);
        }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={setSelectedChannelId}
        addFolder={addFolder}
        addChannel={addChannel}
        deleteChannel={deleteChannel}
        moveChannel={moveChannel}
        refreshData={() => refreshData()}
      />
      <main className="flex-1 ml-80 overflow-y-auto">
        {apiKey ? (
             <Dashboard 
                videos={videos}
                channels={channels}
                selectedFolderId={selectedFolderId}
                selectedChannelId={selectedChannelId}
                folders={folders}
                isLoading={isLoading}
                period={period}
                setPeriod={setPeriod}
             />
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <div className="bg-white p-12 rounded-3xl shadow-xl border border-slate-200 text-center max-w-lg">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">API 키가 설정되지 않았습니다</h2>
                    <p className="text-slate-600 mb-8 leading-relaxed">
                        YouTube 데이터를 불러오기 위해 Google Cloud Console에서 발급받은 <br/>
                        <strong>YouTube Data API v3</strong> 키가 필요합니다. <br/>
                        사이드바의 '설정 및 API' 메뉴에 키를 입력해주세요.
                    </p>
                    <div className="flex flex-col gap-2 text-left bg-slate-50 p-4 rounded-xl text-xs text-slate-500 border border-slate-200">
                        <p>• API 키를 이미 입력했는데도 이 메시지가 보인다면 페이지를 새로고침 해주세요.</p>
                        <p>• 공유 링크로 접속했다면 보낸 사람이 API 키를 포함했는지 확인해주세요.</p>
                    </div>
                </div>
            </div>
        )}
       
      </main>
    </div>
  );
};

export default App;