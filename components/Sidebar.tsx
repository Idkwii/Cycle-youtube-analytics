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
  
  // API 설정 섹션 열림/닫힘 상태 (키가 없으면 기본적으로 열어둠)
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
      // Determine target folder: use selected, or default to first
      // If no folders exist, we pass an empty string and let App.tsx handle creation
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
        // Encode to JSON -> Base64 (Unicode Safe)
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

  // --- Drag and Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, channelId: string) => {
    e.dataTransfer.setData('channelId', channelId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault(); // Essential to allow dropping
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
        
        {/* Primary Action: Refresh Data (Always visible) */}
        <button
            onClick={refreshData}
            disabled={!apiKey}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md mb-4 disabled:opacity-50 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
            <RefreshCw size={18} />
            데이터 새로고침
        </button>

        {/* API Config Section (Accordion Style) */}
        <div className="bg-slate-100 rounded-xl border border-slate-200 shadow-sm mb-4 overflow-hidden transition-all">
          {/* Header (Clickable) */}
          <button 
            onClick={() => setIsApiConfigOpen(!isApiConfigOpen)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-200/50 transition-colors"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Key size={16} className="text-slate-700" />
                <span>설정 및 API</span>
                {/* Status Indicator (Only visible when collapsed and key exists) */}
                {!isApiConfigOpen && apiKey && (
                    <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 size={10} />
                        연결됨
                    </span>
                )}
            </div>
            {isApiConfigOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
          </button>

          {/* Collapsible Content */}
          {isApiConfigOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3 animate-in slide-in-from-top-2 duration-200">
                 <div className="relative">
                     <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="YouTube API Key 입력"
                        className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all bg-white text-slate-900 placeholder:text-slate-400"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {apiKey ? <CheckCircle2 size={16} className="text-green-500" /> : null}
                    </div>
                 </div>
                
                {/* Share Button (Config Action) */}
                <button 
                    onClick={handleShareConfig}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-bold text-xs"
                >
                    <Share2 size={14} />
                    팀원에게 설정 공유하기
                </button>
                
                <p className="text-[10px] text-slate-500 leading-tight text-center">
                    * 위 버튼으로 링크를 복사해서 팀원에게 보내세요.<br/>
                    (채널/폴더 목록과 API 키가 한 번에 세팅됩니다)
                </p>
              </div>
          )}
        </div>

        {/* Add Channel Section */}
        <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Plus size={16} className="text-slate-700" />
                채널 추가
            </h2>
            <form onSubmit={handleAddChannel} className="space-y-3">
                <div className="relative">
                    <input
                        type="text"
                        value={newChannelInput}
                        onChange={(e) => setNewChannelInput(e.target.value)}
                        placeholder="핸들(@name) 또는 ID"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-slate-900 placeholder:text-slate-400"
                    />
                </div>
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
                <p className="text-[10px] text-slate-500 text-center">
                    {selectedFolderId 
                        ? `'${folders.find(f => f.id === selectedFolderId)?.name}' 폴더에 추가됩니다.` 
                        : folders.length > 0 
                            ? `'${folders[0].name}' 폴더에 추가됩니다.`
                            : '폴더가 없으면 자동 생성됩니다.'}
                </p>
            </form>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* Folder Management */}
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
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-slate-900 placeholder:text-slate-400"
                />
                <button
                    type="submit"
                    className="px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-bold"
                >
                    <Plus size={18} />
                </button>
            </form>
        </div>

        {/* Unified Folder & Channel Tree */}
        <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">
                채널 관리
            </h2>
            <div className="space-y-2">
                {/* 'All' View Button */}
                <button
                    onClick={() => {
                        setSelectedFolderId(null);
                        setSelectedChannelId(null);
                    }}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors ${
                        selectedFolderId === null 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'text-slate-700 hover:bg-slate-100 bg-white border border-slate-100'
                    }`}
                >
                    <FolderIcon size={18} className={selectedFolderId === null ? "text-blue-200" : "text-slate-400"} />
                    <span>전체 보기</span>
                </button>

                {/* Folder List */}
                {folders.map(folder => {
                    const isFolderSelected = selectedFolderId === folder.id;
                    const folderChannels = channels.filter(c => c.folderId === folder.id);

                    return (
                        <div 
                            key={folder.id} 
                            className={`rounded-xl border transition-all ${
                                isFolderSelected 
                                ? 'bg-slate-50 border-blue-200' 
                                : 'bg-white border-slate-100 hover:border-slate-200'
                            }`}
                        >
                            {/* Folder Header (Droppable) */}
                            <button
                                onClick={() => setSelectedFolderId(folder.id)}
                                onDragOver={(e) => handleDragOver(e, folder.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, folder.id)}
                                className={`w-full text-left px-3 py-3 rounded-lg text-sm font-bold flex items-center gap-3 transition-colors relative ${
                                    isFolderSelected
                                    ? 'text-blue-700' 
                                    : 'text-slate-700 hover:bg-slate-50'
                                } ${
                                    dragOverFolderId === folder.id
                                    ? 'ring-2 ring-blue-500 bg-blue-50 z-10'
                                    : ''
                                }`}
                            >
                                {isFolderSelected ? <ChevronDown size={16} /> : <ChevronRight size={16} className="text-slate-400" />}
                                <span className="truncate flex-1 pointer-events-none">{folder.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full pointer-events-none ${
                                    isFolderSelected
                                    ? 'bg-blue-200 text-blue-800' 
                                    : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {folderChannels.length}
                                </span>
                            </button>

                            {/* Channel List (Visible only when selected) */}
                            {isFolderSelected && (
                                <div className="px-2 pb-2 space-y-1">
                                    {folderChannels.length > 0 ? (
                                        folderChannels.map(channel => {
                                            const isChannelSelected = selectedChannelId === channel.id;
                                            return (
                                                <div 
                                                    key={channel.id} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedChannelId(channel.id);
                                                    }}
                                                    draggable={true}
                                                    onDragStart={(e) => handleDragStart(e, channel.id)}
                                                    className={`group flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-all ${
                                                        isChannelSelected
                                                        ? 'bg-blue-100 border-blue-200 shadow-sm'
                                                        : 'hover:bg-white hover:shadow-sm border-transparent hover:border-slate-100'
                                                    }`}
                                                >
                                                    <GripVertical size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                                                    <img src={channel.thumbnail} alt={channel.title} className="w-6 h-6 rounded-full bg-slate-200 flex-shrink-0 pointer-events-none" />
                                                    <div className="flex-1 min-w-0 pointer-events-none">
                                                        <p className={`text-xs font-semibold truncate ${
                                                            isChannelSelected ? 'text-blue-800' : 'text-slate-800'
                                                        }`}>{channel.title}</p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteChannel(channel.id);
                                                        }}
                                                        className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-4 text-center text-xs text-slate-400 border-t border-dashed border-slate-200 mt-1">
                                            채널이 없습니다
                                        </div>
                                    )}
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