
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { Channel, Folder, Video, AnalysisPeriod } from './types';
import { fetchChannelInfo, fetchRecentVideos } from './services/youtubeService';
import LZString from 'lz-string';
import { CheckCircle2, AlertCircle, Settings } from 'lucide-react';

// Firebase core configuration
import { collection, doc, setDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './services/firebase';

const STORAGE_KEY = 'yt_dashboard_state';
const VIDEO_CACHE_KEY = 'yt_dashboard_videos';

// Deterministically generate a safe, unique Firestore document ID from share string
const getDeterministicId = async (shareData: string): Promise<string> => {
  try {
    const msgBuffer = new TextEncoder().encode(shareData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `hash-${hashHex.substring(0, 50)}`;
  } catch (err) {
    let hash = 0;
    for (let i = 0; i < shareData.length; i++) {
      hash = (hash << 5) - hash + shareData.charCodeAt(i);
      hash = hash & hash;
    }
    return `fb-${Math.abs(hash).toString(36)}-${shareData.length}`;
  }
};

/**
 * [중요] 여기에 본인의 YouTube Data API v3 키를 입력하세요.
 * 여기에 입력하면 공유받은 모든 사람이 별도의 입력 없이 바로 결과를 볼 수 있습니다.
 */
const CONST_API_KEY = 'AIzaSyA3JRkSp_eMJ3oWKhqDwIbY5IVbb99Uobc'; 

const getInitialApiKey = () => {
  if (CONST_API_KEY) return CONST_API_KEY;
  try {
    // @ts-ignore
    return import.meta.env?.VITE_YOUTUBE_API_KEY || ''; 
  } catch {
    return '';
  }
};

const getSavedState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to load saved state", e);
  }
  return null;
};

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const App: React.FC = () => {
  const savedState = getSavedState();
  
  const [apiKey, setApiKey] = useState<string>(() => {
    const initial = getInitialApiKey();
    return (CONST_API_KEY || savedState?.apiKey || initial);
  });
  
  const [channels, setChannels] = useState<Channel[]>(savedState?.channels || []);
  const [folders, setFolders] = useState<Folder[]>(savedState?.folders || []);
  const [period, setPeriod] = useState<AnalysisPeriod>(savedState?.period || 30);
  const [hiddenVideoIds, setHiddenVideoIds] = useState<string[]>(savedState?.hiddenVideoIds || []);
  const [videos, setVideos] = useState<Video[]>([]);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [dataPeriod, setDataPeriod] = useState<AnalysisPeriod | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [forceRefreshNext, setForceRefreshNext] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [dashboardId, setDashboardId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Navigation State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  
  // UI State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // 1. 초기화 Logic (Share Link & Video Cache)
  useEffect(() => {
    const savedVideos = localStorage.getItem(VIDEO_CACHE_KEY);
    let dataLoadedFromShare = false;

    const params = new URLSearchParams(window.location.search);
    const dashboardParam = params.get('dashboardId');
    if (dashboardParam) {
      setDashboardId(dashboardParam);
    }

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
            let parsedFolders: Folder[] = [];
            let parsedChannels: Channel[] = [];
            let parsedApiKey = '';

            if (data.c && Array.isArray(data.c)) {
                if (data.k && !CONST_API_KEY) {
                    parsedApiKey = data.k;
                    setApiKey(data.k);
                }
                if (data.f) {
                    parsedFolders = data.f.map((f: any[]) => ({ id: f[0], name: f[1] }));
                    setFolders(parsedFolders);
                }
                parsedChannels = data.c.map((c: any[]) => ({
                    id: c[0],
                    folderId: c[1],
                    title: c[2],
                    thumbnail: c[3] || '',
                    uploadsPlaylistId: c[0].replace(/^UC/, 'UU'),
                    handle: ''
                }));
                setChannels(parsedChannels);
            } else {
                if (data.apiKey && !CONST_API_KEY) {
                    parsedApiKey = data.apiKey;
                    setApiKey(data.apiKey);
                }
                if (data.channels) {
                    parsedChannels = data.channels;
                    setChannels(data.channels);
                }
                if (data.folders) {
                    parsedFolders = data.folders;
                    setFolders(data.folders);
                }
            }
            dataLoadedFromShare = true;
            setForceRefreshNext(true);

            // Automatically migrate and sync the old share link using active Firestore!
            const autoMigrateToFirestore = async () => {
                try {
                    // Generate a deterministic dashboard ID based on the shared content
                    const deterministicId = await getDeterministicId(shareData);
                    const docRef = doc(db, 'dashboards', deterministicId);
                    
                    // See if this synced dashboard already exists
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        // Already exists, just hook into it! (onSnapshot will load the newest data automatically)
                        setDashboardId(deterministicId);
                        const newUrl = `${window.location.pathname}?dashboardId=${deterministicId}`;
                        window.history.replaceState({}, '', newUrl);
                        setTimeout(() => showToast("실시간 공유 대시보드에 연결되었습니다!", 'success'), 500);
                    } else {
                        // First-time load: bootstrap active Firestore document with our initial data
                        await setDoc(docRef, {
                            id: deterministicId,
                            folders: parsedFolders,
                            channels: parsedChannels,
                            apiKey: parsedApiKey || '',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp()
                        });
                        setDashboardId(deterministicId);
                        const newUrl = `${window.location.pathname}?dashboardId=${deterministicId}`;
                        window.history.replaceState({}, '', newUrl);
                        setTimeout(() => showToast("이전 공유 링크를 실시간 자동 동기화 대시보드로 성공적으로 전환했습니다!", 'success'), 500);
                    }
                } catch (migrateErr) {
                    console.error("Failed to migrate share URL to Firestore", migrateErr);
                }
            };
            autoMigrateToFirestore();
        } else {
            window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (e) {
        console.error("Failed to parse shared data", e);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    if (savedVideos) {
      try {
        const parsed = JSON.parse(savedVideos);
        setVideos(parsed.data || []);
        setLastFetched(parsed.timestamp || null);
        setDataPeriod(parsed.period || null);
      } catch (e) {
        console.error("Failed to load saved videos", e);
      }
    }

    setIsInitialized(true);

    if (dataLoadedFromShare) {
        setTimeout(() => showToast("공유된 대시보드 설정을 불러왔습니다.", 'success'), 500);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, channels, folders, period, hiddenVideoIds }));
  }, [apiKey, channels, folders, period, hiddenVideoIds, isInitialized]);

  // Real-time synchronization listener
  useEffect(() => {
    if (!dashboardId) return;

    setIsSyncing(true);
    const docRef = doc(db, 'dashboards', dashboardId);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      setIsSyncing(false);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.folders) {
          setFolders(prev => {
            const strPrev = JSON.stringify(prev);
            const strNew = JSON.stringify(data.folders);
            return strPrev !== strNew ? data.folders : prev;
          });
        }
        if (data.channels) {
          setChannels(prev => {
            const strPrev = JSON.stringify(prev);
            const strNew = JSON.stringify(data.channels);
            return strPrev !== strNew ? data.channels : prev;
          });
        }
        if (data.apiKey && !CONST_API_KEY) {
          setApiKey(prev => prev !== data.apiKey ? data.apiKey : prev);
        }
      }
    }, (error) => {
      setIsSyncing(false);
      handleFirestoreError(error, OperationType.GET, `dashboards/${dashboardId}`);
    });

    return () => unsubscribe();
  }, [dashboardId]);

  const getShareLink = useCallback(async () => {
     try {
        if (dashboardId) {
            let origin = window.location.origin;
            if (origin.includes('ais-dev-')) {
                origin = origin.replace('ais-dev-', 'ais-pre-');
            }
            return `${origin}${window.location.pathname}?dashboardId=${dashboardId}`;
        }
        
        // No dashboard ID yet - create one in Firestore and sync existing data!
        const newDocRef = doc(collection(db, 'dashboards'));
        const newId = newDocRef.id;
        
        const payload = {
            id: newId,
            folders: folders,
            channels: channels,
            apiKey: apiKey || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        await setDoc(newDocRef, payload);
        setDashboardId(newId);
        
        const newUrl = `${window.location.pathname}?dashboardId=${newId}`;
        window.history.replaceState({}, '', newUrl);
        
        let origin = window.location.origin;
        if (origin.includes('ais-dev-')) {
            origin = origin.replace('ais-dev-', 'ais-pre-');
        }
        return `${origin}${newUrl}`;
    } catch (e: any) {
        showToast("공유 링크 생성 중 오류가 발생했습니다: " + e.message, 'error');
        return window.location.href;
    }
  }, [folders, channels, apiKey, dashboardId, showToast]);

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
    setApiError(null);
    try {
      const targetPeriod = customPeriod || period;
      const newVideos = await fetchRecentVideos(channels, apiKey, targetPeriod);
      setVideos(newVideos);
      setDataPeriod(targetPeriod);
      setLastFetched(Date.now());
      showToast("데이터 업데이트 완료", 'success');
    } catch (error: any) {
      setApiError(error.message);
      showToast("데이터 업데이트 실패: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, channels, period, lastFetched, showToast]);

  useEffect(() => {
    if (apiKey && channels.length > 0) {
      if (dataPeriod !== period || !lastFetched || forceRefreshNext) {
        refreshData(period, forceRefreshNext);
        if (forceRefreshNext) {
          setForceRefreshNext(false);
        }
      }
    }
  }, [apiKey, channels, period, dataPeriod, lastFetched, refreshData, forceRefreshNext]);

  const syncToFirestore = useCallback(async (newFolders: Folder[], newChannels: Channel[]) => {
    if (!dashboardId) return;
    try {
      const docRef = doc(db, 'dashboards', dashboardId);
      await setDoc(docRef, {
        folders: newFolders,
        channels: newChannels,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `dashboards/${dashboardId}`);
    }
  }, [dashboardId]);

  const addFolder = (name: string) => {
    const nextFolders = [...folders, { id: `f-${Date.now()}`, name }];
    setFolders(nextFolders);
    if (dashboardId) {
      syncToFirestore(nextFolders, channels);
    }
  };

  const addChannel = async (identifier: string, folderId: string) => {
    if (!apiKey) {
      showToast("코드 내부에 API 키가 설정되지 않았습니다.", 'error');
      setIsSettingsOpen(true);
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
      let nextFolders = [...folders];
      if (!targetId) {
          const newF = { id: `f-${Date.now()}`, name: '기본 폴더' };
          nextFolders = [newF];
          setFolders(nextFolders);
          targetId = newF.id;
      }
      const newChannel = { ...info, folderId: targetId };
      const nextChannels = [...channels, newChannel];
      setChannels(nextChannels);
      
      const newV = await fetchRecentVideos([newChannel], apiKey, period);
      setVideos(prev => [...prev, ...newV]);
      showToast(`'${info.title}' 채널이 추가되었습니다.`, 'success');
      if (dashboardId) {
        await syncToFirestore(nextFolders, nextChannels);
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteChannel = (id: string) => {
    const nextChannels = channels.filter(c => c.id !== id);
    setChannels(nextChannels);
    setVideos(videos.filter(v => v.channelId !== id));
    showToast("채널이 삭제되었습니다.", 'success');
    if (dashboardId) {
      syncToFirestore(folders, nextChannels);
    }
  };

  const moveChannel = (channelId: string, targetFolderId: string) => {
    const nextChannels = channels.map(c => c.id === channelId ? { ...c, folderId: targetFolderId } : c);
    setChannels(nextChannels);
    if (dashboardId) {
      syncToFirestore(folders, nextChannels);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 relative">
      <Sidebar 
        apiKey={apiKey} setApiKey={setApiKey}
        folders={folders} channels={channels}
        selectedFolderId={selectedFolderId}
        setSelectedFolderId={(id) => { setSelectedFolderId(id); setSelectedChannelId(null); }}
        selectedChannelId={selectedChannelId}
        setSelectedChannelId={(id) => { setSelectedChannelId(id); }}
        addFolder={addFolder} addChannel={addChannel}
        deleteChannel={deleteChannel} moveChannel={moveChannel}
        refreshData={() => refreshData(undefined, true)}
        getShareLink={getShareLink}
        showToast={showToast}
        dashboardId={dashboardId}
        isSyncing={isSyncing}
      />
      <main className="flex-1 ml-80 overflow-y-auto">
        <Dashboard 
            videos={videos} channels={channels}
            selectedFolderId={selectedFolderId}
            selectedChannelId={selectedChannelId}
            folders={folders} isLoading={isLoading}
            period={period} setPeriod={setPeriod}
            apiKey={apiKey} setApiKey={setApiKey}
            hiddenVideoIds={hiddenVideoIds}
            setHiddenVideoIds={setHiddenVideoIds}
            apiError={apiError}
        />
      </main>
      
      {/* Global Settings UI */}
      <div className="fixed bottom-4 right-8 flex flex-col items-end z-50">
          {isSettingsOpen && (
              <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 mb-2 w-80 animate-in slide-in-from-bottom-4">
                  <div className="flex justify-between items-center mb-2">
                      <p className="text-xs font-bold text-slate-900">설정 및 API 키 관리</p>
                      <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                  </div>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block">YouTube Data API Key</label>
                          <input 
                              type="password" 
                              value={apiKey} 
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder="AIza..."
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                          />
                      </div>
                  </div>
                  
                  {hiddenVideoIds.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-slate-700">숨긴 영상 관리</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{hiddenVideoIds.length}개 숨김</span>
                          </div>
                          <button
                              onClick={() => {
                                  setHiddenVideoIds([]);
                                  showToast('숨긴 영상이 모두 복구되었습니다.', 'success');
                              }}
                              className="w-full bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                          >
                              숨김 해제 및 초기화
                          </button>
                      </div>
                  )}

                  <p className="text-[10px] text-slate-400 mt-4">변경 시 자동 저장 및 즉시 반영됩니다.</p>
                  <button 
                      onClick={() => setIsSettingsOpen(false)}
                      className="w-full mt-3 bg-slate-900 text-white py-2 rounded-lg text-xs font-bold hover:bg-black transition-colors"
                  >
                      확인
                  </button>
              </div>
          )}
          <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className={`p-3 rounded-full shadow-md border transition-colors ${isSettingsOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-300 hover:text-slate-600 border-slate-100'}`}
          >
              <Settings size={20} />
          </button>
      </div>

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
