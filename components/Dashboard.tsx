import React, { useState, useMemo } from 'react';
import { Video, VideoTypeFilter, SortOption, Folder, Channel } from '../types';
import VideoTable from './VideoTable';
import { Eye, ThumbsUp, MessageCircle, Film } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardProps {
  videos: Video[];
  channels: Channel[];
  selectedFolderId: string | null;
  selectedChannelId: string | null;
  folders: Folder[];
  isLoading: boolean;
}

const Dashboard: React.FC<DashboardProps> = ({ videos, channels, selectedFolderId, selectedChannelId, folders, isLoading }) => {
  const [videoTypeFilter, setVideoTypeFilter] = useState<VideoTypeFilter>('ALL');
  const [sortOption, setSortOption] = useState<SortOption>(SortOption.VIEWS_DESC);

  // 1. Filter by Scope (Channel > Folder > All)
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

  // 2. Filter by Type (Short/Long)
  const filteredVideos = useMemo(() => {
    return scopeVideos.filter(v => {
      if (videoTypeFilter === 'LONG') return !v.isShort;
      if (videoTypeFilter === 'SHORT') return v.isShort;
      return true;
    });
  }, [scopeVideos, videoTypeFilter]);

  // Stats
  const stats = useMemo(() => {
    return {
      count: filteredVideos.length,
      views: filteredVideos.reduce((acc, v) => acc + v.viewCount, 0),
      likes: filteredVideos.reduce((acc, v) => acc + v.likeCount, 0),
      comments: filteredVideos.reduce((acc, v) => acc + v.commentCount, 0),
    };
  }, [filteredVideos]);

  // Chart Data: Top 5 Channels by Views in the current selection
  // Keys are in Korean so the Chart Tooltip displays them nicely
  const chartData = useMemo(() => {
      const channelStats: Record<string, {채널명: string, 조회수: number}> = {};
      
      filteredVideos.forEach(v => {
          if (!channelStats[v.channelId]) {
              channelStats[v.channelId] = { 채널명: v.channelTitle, 조회수: 0 };
          }
          channelStats[v.channelId].조회수 += v.viewCount;
      });

      return Object.values(channelStats)
        .sort((a, b) => b.조회수 - a.조회수)
        .slice(0, 5);
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
  if (selectedChannelId) {
      const ch = channels.find(c => c.id === selectedChannelId);
      if (ch) viewTitle = ch.title;
  } else if (selectedFolderId) {
      const f = folders.find(f => f.id === selectedFolderId);
      if (f) viewTitle = f.name;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{viewTitle} 성과 분석</h1>
          <p className="text-slate-500 text-sm mt-1">최근 7일 데이터 분석</p>
        </div>
        
        <div className="flex items-center bg-slate-200 p-1 rounded-lg">
          {(['ALL', 'LONG', 'SHORT'] as VideoTypeFilter[]).map((type) => (
            <button
              key={type}
              onClick={() => setVideoTypeFilter(type)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                videoTypeFilter === type
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {type === 'ALL' ? '전체' : type === 'LONG' ? '롱폼' : '숏폼'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="영상 수" 
          value={stats.count.toLocaleString()} 
          icon={Film} 
          color="bg-slate-600 text-slate-600" 
        />
        <StatCard 
          label="총 조회수" 
          value={stats.views.toLocaleString()} 
          icon={Eye} 
          color="bg-blue-600 text-blue-600" 
        />
        <StatCard 
          label="총 좋아요" 
          value={stats.likes.toLocaleString()} 
          icon={ThumbsUp} 
          color="bg-rose-600 text-rose-600" 
        />
        <StatCard 
          label="총 댓글" 
          value={stats.comments.toLocaleString()} 
          icon={MessageCircle} 
          color="bg-indigo-600 text-indigo-600" 
        />
      </div>

      {/* Chart Section */}
      {filteredVideos.length > 0 && !selectedChannelId && (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-6">조회수 TOP 5 채널</h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                            dataKey="채널명" 
                            tick={{fontSize: 12}} 
                            axisLine={false} 
                            tickLine={false} 
                        />
                        <YAxis 
                            hide 
                        />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{fill: '#f1f5f9'}}
                        />
                        <Bar 
                            dataKey="조회수" 
                            fill="#3b82f6" 
                            radius={[4, 4, 0, 0]} 
                            barSize={60}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
         </div>
      )}

      {/* Data Table */}
      <VideoTable 
        videos={filteredVideos} 
        sortOption={sortOption} 
        setSortOption={setSortOption} 
      />
      
      {isLoading && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;