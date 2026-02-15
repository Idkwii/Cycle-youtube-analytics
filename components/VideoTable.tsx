
import React from 'react';
import { Video, SortOption, AnalysisPeriod } from '../types';
import { ExternalLink, ThumbsUp, MessageCircle, ArrowUp, ArrowDown, TrendingUp, Minus, Clock, Trophy } from 'lucide-react';

interface VideoTableProps {
  videos: Video[];
  sortOption: SortOption;
  setSortOption: (opt: SortOption) => void;
  period: AnalysisPeriod;
  avgViews?: number; // 채널/폴더 평균 조회수 (선택적)
}

const VideoTable: React.FC<VideoTableProps> = ({ videos, sortOption, setSortOption, period, avgViews }) => {

  const sortedVideos = [...videos].sort((a, b) => {
    switch (sortOption) {
      case SortOption.VIEWS_DESC: return b.viewCount - a.viewCount;
      case SortOption.VIEWS_ASC: return a.viewCount - b.viewCount;
      case SortOption.LIKES_DESC: return b.likeCount - a.likeCount;
      case SortOption.LIKES_ASC: return a.likeCount - b.likeCount;
      case SortOption.COMMENTS_DESC: return b.commentCount - a.commentCount;
      case SortOption.COMMENTS_ASC: return a.commentCount - b.commentCount;
      case SortOption.DATE_DESC: return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case SortOption.DATE_ASC: return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      default: return 0;
    }
  });

  const handleSortClick = (category: 'VIEWS' | 'LIKES' | 'COMMENTS' | 'DATE') => {
    const desc = SortOption[`${category}_DESC` as keyof typeof SortOption];
    const asc = SortOption[`${category}_ASC` as keyof typeof SortOption];
    if (sortOption === desc) {
        setSortOption(asc);
    } else {
        setSortOption(desc);
    }
  };

  const SortButton = ({ label, category }: { label: string; category: 'VIEWS' | 'LIKES' | 'COMMENTS' | 'DATE' }) => {
    const isSelected = sortOption.includes(category);
    const isAsc = sortOption.includes('ASC');
    return (
      <button
        onClick={() => handleSortClick(category)}
        className={`flex items-center space-x-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <span>{label}</span>
        {isSelected && (isAsc ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />)}
      </button>
    );
  };

  // 참여율 계산 함수 (좋아요+댓글 / 조회수)
  const getEngagementRate = (video: Video) => {
    if (video.viewCount === 0) return 0;
    return ((video.likeCount + video.commentCount) / video.viewCount) * 100;
  };

  // VPH (Views Per Hour) 계산
  const getVPH = (video: Video) => {
    const published = new Date(video.publishedAt).getTime();
    const now = new Date().getTime();
    const hoursSince = Math.max((now - published) / (1000 * 60 * 60), 1); // 최소 1시간
    return Math.round(video.viewCount / hoursSince);
  };

  // 성과 지수 렌더링 (평균 대비)
  const renderPerformance = (views: number, avg: number) => {
    if (!avg) return <span className="text-slate-400">-</span>;
    const ratio = views / avg;
    const percent = Math.round((ratio - 1) * 100); // 0이면 평균, 100이면 2배
    
    if (ratio >= 1.5) {
        return (
            <div className="flex items-center gap-1 text-green-600 font-bold bg-green-50 px-2 py-1 rounded text-xs w-fit ml-auto">
                <TrendingUp size={14} />
                <span>{ratio.toFixed(1)}x</span>
            </div>
        );
    } else if (ratio >= 1.0) {
        return (
            <div className="flex items-center gap-1 text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded text-xs w-fit ml-auto">
                <ArrowUp size={14} />
                <span>{ratio.toFixed(1)}x</span>
            </div>
        );
    } else if (ratio >= 0.7) {
        return (
             <div className="flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-1 rounded text-xs w-fit ml-auto">
                <Minus size={14} />
                <span>Avg</span>
            </div>
        );
    } else {
        return (
            <div className="flex items-center gap-1 text-red-500 bg-red-50 px-2 py-1 rounded text-xs w-fit ml-auto">
                <ArrowDown size={14} />
                <span>{Math.abs(percent)}%↓</span>
            </div>
        );
    }
  };

  const renderRank = (index: number) => {
      const rank = index + 1;
      if (rank === 1) {
          return <div className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center font-bold text-xs mx-auto">1</div>;
      }
      if (rank === 2) {
          return <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs mx-auto">2</div>;
      }
      if (rank === 3) {
          return <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs mx-auto">3</div>;
      }
      return <span className="text-slate-400 font-medium text-xs">{rank}</span>;
  };

  if (videos.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
        <p className="text-lg font-medium text-slate-900 mb-2">업로드된 영상이 없습니다</p>
        <p className="text-sm">선택한 조건에 맞는 최근 {period}일 이내의 영상 데이터를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
        <h3 className="font-semibold text-slate-800">최근 업로드 영상 ({period}일)</h3>
        <div className="flex gap-4">
            <SortButton label="조회수" category="VIEWS" />
            <SortButton label="좋아요" category="LIKES" />
            <SortButton label="댓글" category="COMMENTS" />
            <SortButton label="날짜" category="DATE" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold text-center w-12">#</th>
              <th className="px-6 py-3 font-semibold w-[40%]">영상</th>
              <th className="px-6 py-3 font-semibold text-right">성과 지표</th>
              <th className="px-6 py-3 font-semibold text-right">VPH (시간당)</th>
              <th className="px-6 py-3 font-semibold text-right">조회수</th>
              <th className="px-6 py-3 font-semibold text-right">참여율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedVideos.map((video, index) => {
              const engRate = getEngagementRate(video);
              const vph = getVPH(video);
              return (
              <tr key={video.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-4 text-center">
                    {renderRank(index)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0 w-24 h-14 bg-slate-200 rounded overflow-hidden group">
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                      {video.isShort && (
                        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">쇼츠</span>
                      )}
                      <a 
                        href={`https://www.youtube.com/watch?v=${video.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                         <ExternalLink className="text-white drop-shadow-md" size={20} />
                      </a>
                    </div>
                    <div className="min-w-0 max-w-xs">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-slate-500">{video.channelTitle}</span>
                            <span className="text-[10px] text-slate-400">• {new Date(video.publishedAt).toLocaleDateString()}</span>
                        </div>
                        <a 
                            href={`https://www.youtube.com/watch?v=${video.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-slate-900 hover:text-blue-600 truncate block"
                        >
                            {video.title}
                        </a>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                    {avgViews && renderPerformance(video.viewCount, avgViews)}
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 text-slate-600 font-bold text-sm">
                        <Clock size={12} className="text-slate-400" />
                        {vph.toLocaleString()}
                    </div>
                    <p className="text-[10px] text-slate-400">views/hour</p>
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-700">
                  {video.viewCount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1">
                        <span className={`font-bold text-sm ${engRate > 5 ? 'text-green-600' : engRate > 2 ? 'text-blue-600' : 'text-slate-600'}`}>
                            {engRate.toFixed(1)}%
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="flex items-center gap-0.5"><ThumbsUp size={10} /> {video.likeCount.toLocaleString()}</span>
                            <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {video.commentCount.toLocaleString()}</span>
                        </div>
                    </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VideoTable;
