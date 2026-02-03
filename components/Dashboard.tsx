
import React, { useState, useMemo } from 'react';
import { Video, SortOption, Folder, Channel, AnalysisPeriod } from '../types';
import VideoTable from './VideoTable';
import ChannelStats from './ChannelStats';
import { Eye, ThumbsUp, MessageCircle, Film, Settings, PlusCircle, HelpCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardProps {
  videos: Video[];
  channels: Channel[];
  selectedFolderId: string | null;
  selectedChannelId: string | null;
  folders: Folder[];
  isLoading: boolean;
  period: AnalysisPeriod;
  setPeriod: (period: AnalysisPeriod) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  oauthClientId?: string;
  setOauthClientId?: (id: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    videos, 
    channels, 
    selectedFolderId, 
    selectedChannelId, 
    folders, 
    isLoading,
    period,
    setPeriod,
    apiKey,
    setApiKey,
    oauthClientId,
    setOauthClientId
}) => {
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.VIEWS_DESC);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const scopeVideos = useMemo(() => {
    if (selectedChannelId) {
        return videos.filter(v => v.channelId === selectedChannelId);
    }
    if (selectedFolderId) {
        const folderChannelIds = channels.filter(c => c.folderId === selectedFolderId).map(c => c.id);
        return videos.filter(v => folderChannelIds.includes(v.channelId));
    }
    return videos;
  }, [videos, selectedFolderId, selectedChannelId, channels]);

  const filteredVideos = useMemo(() => {
    return scopeVideos.filter(v => !v.isShort);
  }, [scopeVideos]);

  const stats = useMemo(() => {
    const count = filteredVideos.length;
    if (count === 0) return { count: 0, avgViews: 0, avgLikes: 0, avgComments: 0 };
    const totalViews = filteredVideos.reduce((acc, v) => acc + v.viewCount, 0);
    const totalLikes = filteredVideos.reduce((acc, v) => acc + v.likeCount, 0);
    const totalComments = filteredVideos.reduce((acc, v) => acc + v.commentCount, 0);
    return {
      count,
      avgViews: Math.round(totalViews / count),
      avgLikes: Math.round(totalLikes / count),
      avgComments: Math.round(totalComments / count),
    };
  }, [filteredVideos]);

  const chartData = useMemo(() => {
      return [...filteredVideos]
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 5)
        .map(v => ({
            name: v.title.length > 12 ? v.title.substring(0, 12) + '...' : v.title,
            fullTitle: v.title,
            views: v.viewCount,
            id: v.id,
            channel: v.channelTitle
        }));
  }, [filteredVideos]);

  const StatCard = ({ label, value, icon: Icon, color }: { label: string, value: string, icon: any, color: string }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={color.replace('bg-', 'text-')} size={24} />
      </div>
    </div>
  );

  let viewTitle = "전체 채널";
  let currentChannel: Channel | undefined = undefined;

  if (selectedChannelId) {
      currentChannel = channels.find(c => c.id === selectedChannelId);
      if (currentChannel) viewTitle = currentChannel.title;
  } else if (selectedFolderId) {
      const f = folders.find(f => f.id === selectedFolderId);
      if (f) viewTitle = f.name;
  }

  // 채널이 하나도 없을 때 보여줄 빈 화면
  if (channels.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center relative">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6">
                  <PlusCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">분석할 채널이 없습니다</h2>
              <p className="text-slate-500 max-w-sm mb-8">사이드바에서 채널 핸들(@handle) 또는 ID를 입력하여 성과 분석을 시작해 보세요.</p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 max-w-md text-left flex gap-3">
                  <HelpCircle className="text-yellow-600 flex-shrink-0" size={20} />
                  <div>
                      <h4 className="text-sm font-bold text-yellow-800 mb-1">기존 데이터가 사라졌나요?</h4>
                      <p className="text-xs text-yellow-700 leading-relaxed">
                          배포 주소(URL)가 변경되면 보안상 이전 데이터가 보이지 않습니다.<br/>
                          <strong>이전 주소로 접속</strong>하여 사이드바 하단의 <strong>[공유]</strong> 버튼을 누른 뒤, 생성된 링크를 이 주소에서 열면 데이터가 복구됩니다.
                      </p>
                  </div>
              </div>

              <div className="mt-20 opacity-30 flex flex-col items-center">
                  <Settings size={20} className="mb-2" />
                  <p className="text-[10px] text-slate-400">관리자용 설정은 우측 하단에 숨겨져 있습니다.</p>
              </div>

              {/* 비밀 설정 아이콘 유지 */}
              <div className="fixed bottom-4 right-8 flex flex-col items-end z-50">
                {isSettingsOpen && (
                    <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 mb-2 w-80 animate-in slide-in-from-bottom-4">
                        <p className="text-xs font-bold text-slate-900 mb-2">설정 및 API 키 관리</p>
                        
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 mb-1 block">YouTube Data API Key (Public)</label>
                                <input 
                                    type="password" 
                                    value={apiKey} 
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder="AIza..."
                                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                                />
                            </div>
                            
                            {setOauthClientId && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">OAuth 2.0 Client ID (Private)</label>
                                    <input 
                                        type="text" 
                                        value={oauthClientId || ''} 
                                        onChange={(e) => setOauthClientId(e.target.value)}
                                        placeholder="...apps.googleusercontent.com"
                                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                                    />
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">변경 시 자동 저장 및 즉시 반영됩니다.</p>
                    </div>
                )}
                <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="p-3 bg-white text-slate-300 hover:text-slate-600 rounded-full shadow-md border border-slate-100 transition-colors"
                >
                    <Settings size={20} />
                </button>
              </div>
          </div>
      );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 relative pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">{viewTitle} 성과 분석</h1>
                <p className="text-slate-500 text-sm mt-1">최근 {period}일 데이터 분석 중 (롱폼 기준)</p>
            </div>
            <div className="flex items-center bg-slate-200 p-1 rounded-lg ml-2">
                {[7, 30].map((p) => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p as AnalysisPeriod)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                            period === p ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        {p}일
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* vidIQ Style Quick Stats Bar */}
      <ChannelStats videos={scopeVideos} channel={currentChannel} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="영상 수" value={stats.count.toLocaleString()} icon={Film} color="bg-slate-600 text-slate-600" />
        <StatCard label="평균 조회수" value={stats.avgViews.toLocaleString()} icon={Eye} color="bg-blue-600 text-blue-600" />
        <StatCard label="평균 좋아요" value={stats.avgLikes.toLocaleString()} icon={ThumbsUp} color="bg-rose-600 text-rose-600" />
        <StatCard label="평균 댓글" value={stats.avgComments.toLocaleString()} icon={MessageCircle} color="bg-indigo-600 text-indigo-600" />
      </div>

      {filteredVideos.length > 0 && (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <Eye size={18} className="text-blue-600" />
                조회수 TOP 5 영상
            </h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip 
                            cursor={{fill: '#f8fafc'}}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-white p-3 border border-slate-100 shadow-lg rounded-lg z-50">
                                            <p className="font-bold text-sm text-slate-900 mb-1">{data.fullTitle}</p>
                                            <p className="text-xs text-blue-600 font-bold">{data.views.toLocaleString()}회</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        <Bar dataKey="views" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} className="cursor-pointer" onClick={(data) => window.open(`https://www.youtube.com/watch?v=${data.id}`, '_blank')} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
         </div>
      )}

      {/* 중요: avgViews를 전달하여 테이블에서 '성과 분석'을 할 수 있게 함 */}
      <VideoTable 
        videos={filteredVideos} 
        sortOption={sortOption} 
        setSortOption={setSortOption} 
        period={period}
        avgViews={stats.avgViews} 
      />
      
      {/* 관리자용 비밀 설정창 */}
      <div className="fixed bottom-4 right-8 flex flex-col items-end z-50">
          {isSettingsOpen && (
              <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200 mb-2 w-80 animate-in slide-in-from-bottom-4">
                  <p className="text-xs font-bold text-slate-900 mb-2">설정 및 API 키 관리</p>
                  
                  <div className="space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block">YouTube Data API Key (Public)</label>
                          <input 
                              type="password" 
                              value={apiKey} 
                              onChange={(e) => setApiKey(e.target.value)}
                              placeholder="AIza..."
                              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                          />
                      </div>
                      
                      {setOauthClientId && (
                          <div>
                              <label className="text-[10px] font-bold text-slate-500 mb-1 block">OAuth 2.0 Client ID (Private)</label>
                              <input 
                                  type="text" 
                                  value={oauthClientId || ''} 
                                  onChange={(e) => setOauthClientId(e.target.value)}
                                  placeholder="...apps.googleusercontent.com"
                                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none"
                              />
                          </div>
                      )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">변경 시 자동 저장 및 즉시 반영됩니다.</p>
              </div>
          )}
          <button 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="p-3 bg-white text-slate-400 hover:text-slate-600 rounded-full shadow-md border border-slate-100 transition-colors"
          >
              <Settings size={20} />
          </button>
      </div>

      {isLoading && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
