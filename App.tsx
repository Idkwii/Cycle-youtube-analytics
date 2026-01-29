import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { AppState, Channel, Folder, Video } from './types';
import { fetchChannelInfo, fetchRecentVideos } from './services/youtubeService';

const DEFAULT_FOLDERS: Folder[] = [];

const App: React.FC = () => {
  // --- State ---
  const [apiKey, setApiKey] = useState<string>('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [folders, setFolders] = useState<Folder[]>(DEFAULT_FOLDERS);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  // --- Persistence ---
  useEffect(() => {
    const storedState = localStorage.getItem('yt_dashboard_state');
    if (storedState) {
      try {
        const parsed: Partial<AppState> = JSON.parse(storedState);
        if (parsed.apiKey) setApiKey(parsed.apiKey);
        if (parsed.channels) setChannels(parsed.channels);
        if (parsed.folders) setFolders(parsed.folders);
        // We don't restore videos generally to force fresh fetch, but for specific UX we might.
        // Let's keep it fresh or maybe cache for short time. For now, empty videos on reload is safer to avoid stale data.
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
  }, []);

  useEffect(() => {
    const stateToSave: Partial<AppState> = {
      apiKey,
      channels,
      folders,
    };
    localStorage.setItem('yt_dashboard_state', JSON.stringify(stateToSave));
  }, [apiKey, channels, folders]);


  // --- Actions ---

  const refreshData = useCallback(async () => {
    if (!apiKey || channels.length === 0) return;
    
    setIsLoading(true);
    try {
      const newVideos = await fetchRecentVideos(channels, apiKey);
      setVideos(newVideos);
    } catch (error) {
      alert("영상 데이터를 가져오는데 실패했습니다. API 키나 할당량을 확인해주세요.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels]);

  const addFolder = (name: string) => {
    const newFolder: Folder = {
      id: `f-${Date.now()}`,
      name,
    };
    setFolders([...folders, newFolder]);
  };

  const addChannel = async (identifier: string, folderId: string) => {
    if (!apiKey) {
      alert("먼저 YouTube API 키를 입력해주세요.");
      return;
    }
    
    // Check duplicates
    if (channels.some(c => c.handle === identifier || c.id === identifier)) {
        alert("이미 존재하는 채널일 수 있습니다.");
        // Proceeding anyway but user should know
    }

    try {
      const info = await fetchChannelInfo(identifier, apiKey);
      
      if (channels.some(c => c.id === info.id)) {
        alert("이미 추가된 채널입니다!");
        return;
      }

      // Handle Folder Assignment
      let targetFolderId = folderId;
      let currentFolders = [...folders];

      // If no folder ID is provided (or empty), handle auto-creation or default assignment
      if (!targetFolderId) {
          if (currentFolders.length === 0) {
              const newFolderId = `f-${Date.now()}`;
              const newFolder = { id: newFolderId, name: '기본 폴더' };
              currentFolders = [newFolder];
              setFolders(currentFolders); // Update state
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
      
      // Auto-select the folder if none was selected, so the user sees the new channel
      if (!selectedFolderId) {
          setSelectedFolderId(targetFolderId);
          setSelectedChannelId(null);
      }
      
      // Fetch videos for this new channel immediately
      const newVideos = await fetchRecentVideos([newChannel], apiKey);
      setVideos(prev => [...prev, ...newVideos]);

    } catch (error) {
      console.error(error);
      alert("채널을 찾을 수 없습니다. 핸들/ID 또는 API 키를 확인해주세요.");
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
            setSelectedChannelId(null); // Reset channel selection when folder changes
        }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={setSelectedChannelId}
        addFolder={addFolder}
        addChannel={addChannel}
        deleteChannel={deleteChannel}
        moveChannel={moveChannel}
        refreshData={refreshData}
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
             />
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <p className="text-lg font-medium mb-2">Cycle Youtube Analytics에 오신 것을 환영합니다</p>
                <p className="text-sm">시작하려면 사이드바에 YouTube API 키를 입력해주세요.</p>
            </div>
        )}
       
      </main>
    </div>
  );
};

export default App;