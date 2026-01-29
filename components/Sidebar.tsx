import React, { useState } from 'react';
import { Folder, Channel } from '../types';
import { Plus, Trash2, FolderPlus, Youtube, RefreshCw, Key, Folder as FolderIcon, GripVertical, ChevronRight, ChevronDown, ChevronUp, Share2, CheckCircle2 } from 'lucide-react';

interface SidebarProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  folders: Folder[];
  channels: Channel[];
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string | null) => void;
  addFolder: (name: string) => void;
  addChannel: (identifier: string, folderId: string) => Promise<void>;
  deleteChannel: (id: string) => void;
  moveChannel: (channelId: string, folderId: string) => void;
  refreshData: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  apiKey,
  setApiKey,
  folders,
  channels,
  selectedFolderId,
  setSelectedFolderId,
  selectedChannelId,
  setSelectedChannelId,
  addFolder,
  addChannel,
  deleteChannel,
  moveChannel,
  refreshData
}) => {
  const [newFolderInput, setNewFolderInput] = useState('');
  const [newChannelInput, setNewChannelInput] = useState('');
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  
  // API 설정 섹션 열림/닫힘 상태
  const [isApiConfigOpen, setIsApiConfigOpen] = useState(!apiKey);

  const handleAddFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderInput.trim()) {
      addFolder(newFolderInput.trim());
      setNewFolderInput('');
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newChannelInput.trim()) {
      let targetId = selectedFolderId;
      if (!targetId && folders.length > 0) {
          targetId = folders[0].id;
      }
      
      setIsAddingChannel(true);
      await addChannel(newChannelInput.trim(), targetId || "");
      setIsAddingChannel(false);
      setNewChannelInput('');
    }
  };

  const handleShareConfig = () => {
    try {
        const data = {
            apiKey, 
            channels,
            folders
        };
        const jsonStr = JSON.stringify(data);
        const b64 = window.btoa(unescape(encodeURIComponent(jsonStr)));
        const url = `${window.location.origin}${window.location.pathname}?share=${b64}`;

        navigator.clipboard.writeText(url).then(() => {
            alert("✅ 팀원 공유용 링크가 복사되었습니다!\n\n팀원들에게 이 링크를 보내주시면,\n현재 등록된 채널, 폴더, API 키 설정이 그대로 적용됩니다.");
        });
    } catch (e) {
        console.error("Share failed", e);
        alert("링크 생성 중 오류가 발생했습니다.");
    }
  };

  const handleDragStart = (e: React.DragEvent, channelId: string) => {
    e.dataTransfer.setData('channelId', channelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    if (dragOverFolderId !== folderId) {
        setDragOverFolderId(folderId);
    }
  };

  const handleDragLeave = () => {
     setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const channelId = e.dataTransfer.getData('channelId');
    if (channelId) {
        moveChannel(channelId, targetFolderId);
    }
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 z-20 overflow-y-auto font-sans">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-6">
          <Youtube className="text-red-600" size={32} />
          <h1 className="font-bold text-lg tracking-tight text-slate-900 leading-tight">Cycle Youtube<br/>Analytics</h1>
        </div>
        
        {/* 새로고침 버튼 상단 고정 */}
        <button
            onClick={refreshData}
            disabled={!apiKey}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md mb-4 disabled:opacity-50 disabled:bg-slate-400"
        >
            <RefreshCw size={18} />
            데이터 새로고침
        </button>

        {/* API 및 공유 설정 */}
        <div className="bg-slate-100 rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden transition-all">
          <button 
            onClick={() => setIsApiConfigOpen(!isApiConfigOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-200/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Key size={16} className="text-slate-700" />
                <span>설정 및 API</span>
                {!isApiConfigOpen && apiKey && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 size={10} />
                        연결됨
                    </span>
                )}
            </div>
            {isApiConfigOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </button>

          {isApiConfigOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3 animate-in slide-in-from-top-2 duration-200">
                 <div className="relative">
                     <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="YouTube API Key 입력"
                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-slate-900"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {apiKey ? <CheckCircle2 size={16} className="text-green-500" /> : null}
                    </div>
                 </div>
                
                {/* 팀원 공유 버튼을 설정 섹션 내부에 배치 */}
                <button 
                    onClick={handleShareConfig}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-bold text-xs shadow-sm"
                >
                    <Share2 size={14} />
                    팀원에게 설정 공유하기
                </button>
                
                <p className="text-[10px] text-slate-500 leading-tight text-center">
                    현재 채널 리스트와 API 키가 포함된 링크를 복사합니다.
                </p>
              </div>
          )}
        </div>

        {/* 채널 추가 섹션 */}
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Plus size={16} className="text-slate-700" />
                채널 추가
            </h2>
            <form onSubmit={handleAddChannel} className="space-y-3">
                <input
                    type="text"
                    value={newChannelInput}
                    onChange={(e) => setNewChannelInput(e.target.value)}
                    placeholder="핸들(@name) 또는 ID"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                />
                <button
                    type="submit"
                    disabled={isAddingChannel || !apiKey}
                    className="w-full bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isAddingChannel ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <Plus size={16} />
                            <span>추가하기</span>
                        </>
                    )}
                </button>
            </form>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <FolderPlus size={16} className="text-slate-700" />
                폴더 관리
            </h2>
            <form onSubmit={handleAddFolder} className="flex gap-2">
                <input
                    type="text"
                    value={newFolderInput}
                    onChange={(e) => setNewFolderInput(e.target.value)}
                    placeholder="새 폴더명"
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                />
                <button type="submit" className="px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-bold">
                    <Plus size={18} />
                </button>
            </form>
        </div>

        <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">채널 관리</h2>
            <div className="space-y-2">
                <button
                    onClick={() => { setSelectedFolderId(null); setSelectedChannelId(null); }}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors ${
                        selectedFolderId === null ? 'bg-blue-600 text-white shadow-md' : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-100'
                    }`}
                >
                    <FolderIcon size={18} className={selectedFolderId === null ? "text-blue-200" : "text-slate-400"} />
                    <span>전체 보기</span>
                </button>

                {folders.map(folder => {
                    const isFolderSelected = selectedFolderId === folder.id;
                    const folderChannels = channels.filter(c => c.folderId === folder.id);
                    return (
                        <div key={folder.id} className={`rounded-xl border transition-all ${isFolderSelected ? 'bg-slate-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                            <button
                                onClick={() => setSelectedFolderId(folder.id)}
                                onDragOver={(e) => handleDragOver(e, folder.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, folder.id)}
                                className={`w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors ${
                                    isFolderSelected ? 'text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                                } ${dragOverFolderId === folder.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                            >
                                {isFolderSelected ? <ChevronDown size={16} /> : <ChevronRight size={16} className="text-slate-400" />}
                                <span className="truncate flex-1">{folder.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${isFolderSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500'}`}>
                                    {folderChannels.length}
                                </span>
                            </button>
                            {isFolderSelected && (
                                <div className="px-2 pb-2 space-y-1">
                                    {folderChannels.map(channel => (
                                        <div 
                                            key={channel.id} 
                                            onClick={(e) => { e.stopPropagation(); setSelectedChannelId(channel.id); }}
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, channel.id)}
                                            className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${
                                                selectedChannelId === channel.id ? 'bg-blue-100 border-blue-200 shadow-sm' : 'hover:bg-white border-transparent'
                                            }`}
                                        >
                                            <GripVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100" />
                                            <img src={channel.thumbnail} alt={channel.title} className="w-6 h-6 rounded-full bg-slate-200" />
                                            <p className={`text-xs font-semibold truncate flex-1 ${selectedChannelId === channel.id ? 'text-blue-800' : 'text-slate-800'}`}>{channel.title}</p>
                                            <button onClick={(e) => { e.stopPropagation(); deleteChannel(channel.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;