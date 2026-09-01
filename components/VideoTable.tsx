
import React, { useMemo } from 'react';
import { Video, SortOption, AnalysisPeriod } from '../types';
import { ExternalLink, ThumbsUp, MessageCircle, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Minus, EyeOff, Info } from 'lucide-react';

interface VideoTableProps {
  videos: Video[];
  sortOption: SortOption;
  setSortOption: (opt: SortOption) => void;
  period: AnalysisPeriod;
  onHideVideo: (id: string) => void;
}

interface OutlierBadge {
  id: string;
  type: 'comment' | 'like';
  label: string;
  tooltip: string;
  badgeStyle: string;
}

// 이상치 뱃지 계산 함수
const getOutlierBadges = (video: Video, avgChannelViews: number): OutlierBadge[] => {
  const badges: OutlierBadge[] = [];
  if (!video.viewCount || video.viewCount <= 0) return badges;

  const cpv = (video.commentCount / video.viewCount) * 1000;
  const lpv = (video.likeCount / video.viewCount) * 1000;
  const perf = avgChannelViews > 0 ? video.viewCount / avgChannelViews : 0;

  // --- 댓글 이상치 규칙 (우선순위: 1 -> 2 -> 3, 최대 1개) ---
  if (video.viewCount >= 5000 && cpv >= 20) {
    // 1. 💬 댓글이벤트?: 조회수 5,000 이상 && cpv >= 20 -> 보라색
    badges.push({
      id: 'comment-event',
      type: 'comment',
      label: `💬 댓글이벤트? ${cpv.toFixed(1)}/1k`,
      tooltip: `댓글 ${cpv.toFixed(1)}개/1천뷰 (정상 3~10). 자료나눔 댓글 이벤트 의심`,
      badgeStyle: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
    });
  } else if (video.viewCount >= 30000 && cpv < 3 && perf >= 2.5) {
    // 2. 📢 광고의심: 조회수 30,000 이상 && cpv < 3 && perf >= 2.5 -> 빨간색
    badges.push({
      id: 'ad-suspect',
      type: 'comment',
      label: `📢 광고의심 ${cpv.toFixed(1)}/1k`,
      tooltip: `댓글 ${cpv.toFixed(1)}개/1천뷰 (정상 3~10). 성과도 ${perf.toFixed(1)}x인데 댓글이 적어 유료 트래픽 의심`,
      badgeStyle: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
    });
  } else if (video.viewCount >= 50000 && cpv < 1.5) {
    // 3. 🔕 댓글저조: 조회수 50,000 이상 && cpv < 1.5 (2번 미해당 시) -> 주황색
    badges.push({
      id: 'comment-low',
      type: 'comment',
      label: `🔕 댓글저조 ${cpv.toFixed(1)}/1k`,
      tooltip: `댓글 ${cpv.toFixed(1)}개/1천뷰 (정상 3~10). 조회수 대비 댓글 참여 저조`,
      badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
    });
  }

  // --- 좋아요 이상치 규칙 (우선순위: 4 -> 5 -> 6, 최대 1개) ---
  if (video.likeCount > 0 && video.viewCount >= 5000 && lpv >= 60) {
    // 4. 👍 좋아요과다: 좋아요 공개 && 조회수 5,000 이상 && lpv >= 60 -> 파란색
    badges.push({
      id: 'like-high',
      type: 'like',
      label: `👍 좋아요과다 ${lpv.toFixed(1)}/1k`,
      tooltip: `좋아요 ${lpv.toFixed(1)}개/1천뷰 (정상 10~31). 조회수 대비 좋아요 비율 매우 높음`,
      badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
    });
  } else if (video.likeCount > 0 && video.viewCount >= 10000 && lpv < 4) {
    // 5. 👎 좋아요저조: 좋아요 공개 && 조회수 10,000 이상 && lpv < 4 -> 회색
    badges.push({
      id: 'like-low',
      type: 'like',
      label: `👎 좋아요저조 ${lpv.toFixed(1)}/1k`,
      tooltip: `좋아요 ${lpv.toFixed(1)}개/1천뷰 (정상 10~31). 조회수 대비 좋아요 비율 저조`,
      badgeStyle: 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
    });
  } else if (video.likeCount === 0 && video.viewCount >= 10000) {
    // 6. 좋아요숨김: 좋아요 수 0 && 조회수 10,000 이상 -> 연회색
    badges.push({
      id: 'like-hidden',
      type: 'like',
      label: `좋아요숨김`,
      tooltip: `조회수 ${video.viewCount.toLocaleString()}회 이상이나 좋아요 수가 비공개(0개)로 설정됨`,
      badgeStyle: 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
    });
  }

  return badges;
};

const VideoTable: React.FC<VideoTableProps> = ({ videos, sortOption, setSortOption, period, onHideVideo }) => {

  // 채널별 평균 조회수 계산
  const channelAverages = useMemo(() => {
    const stats: Record<string, { total: number; count: number }> = {};
    videos.forEach(v => {
        if (!stats[v.channelId]) {
            stats[v.channelId] = { total: 0, count: 0 };
        }
        stats[v.channelId].total += v.viewCount;
        stats[v.channelId].count += 1;
    });
    
    const averages: Record<string, number> = {};
    Object.keys(stats).forEach(id => {
        averages[id] = stats[id].count > 0 ? stats[id].total / stats[id].count : 0;
    });
    return averages;
  }, [videos]);

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
      case SortOption.PERFORMANCE_DESC: {
          const perfA = (channelAverages[a.channelId] && channelAverages[a.channelId] > 0) ? a.viewCount / channelAverages[a.channelId] : 0;
          const perfB = (channelAverages[b.channelId] && channelAverages[b.channelId] > 0) ? b.viewCount / channelAverages[b.channelId] : 0;
          return perfB - perfA;
      }
      case SortOption.PERFORMANCE_ASC: {
          const perfA = (channelAverages[a.channelId] && channelAverages[a.channelId] > 0) ? a.viewCount / channelAverages[a.channelId] : 0;
          const perfB = (channelAverages[b.channelId] && channelAverages[b.channelId] > 0) ? b.viewCount / channelAverages[b.channelId] : 0;
          return perfA - perfB;
      }
      default: return 0;
    }
  });

  const handleSortClick = (category: 'VIEWS' | 'LIKES' | 'COMMENTS' | 'DATE' | 'PERFORMANCE') => {
    const desc = SortOption[`${category}_DESC` as keyof typeof SortOption];
    const asc = SortOption[`${category}_ASC` as keyof typeof SortOption];
    if (sortOption === desc) {
        setSortOption(asc);
    } else {
        setSortOption(desc);
    }
  };

  const SortButton = ({ label, category }: { label: string; category: 'VIEWS' | 'LIKES' | 'COMMENTS' | 'DATE' | 'PERFORMANCE' }) => {
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

  const getPerformance = (video: Video) => {
      const avg = channelAverages[video.channelId];
      if (!avg || avg === 0) return { ratio: 0, label: '-' };
      const ratio = video.viewCount / avg;
      return { ratio, label: `${ratio.toFixed(1)}x` };
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
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800">최근 업로드 영상 ({period}일)</h3>
          <span className="text-xs text-slate-400 font-normal">
            (정상 기준: 댓글 3~10/1k, 좋아요 10~31/1k)
          </span>
        </div>
        <div className="flex gap-4">
            <SortButton label="조회수" category="VIEWS" />
            <SortButton label="좋아요" category="LIKES" />
            <SortButton label="댓글" category="COMMENTS" />
            <SortButton label="날짜" category="DATE" />
            <SortButton label="성과도" category="PERFORMANCE" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold text-center w-12">#</th>
              <th className="px-6 py-3 font-semibold w-[46%] min-w-[320px]">영상</th>
              <th className="px-6 py-3 font-semibold text-right">조회수</th>
              <th className="px-6 py-3 font-semibold text-right">성과도</th>
              <th className="px-6 py-3 font-semibold text-right">참여율</th>
              <th className="px-4 py-3 font-semibold text-center w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedVideos.map((video, index) => {
              const engRate = getEngagementRate(video);
              const { ratio, label } = getPerformance(video);
              const avgViews = channelAverages[video.channelId] || 0;
              const outlierBadges = getOutlierBadges(video, avgViews);
              
              let perfColor = 'text-slate-500';
              let PerfIcon = Minus;
              if (ratio >= 1.5) {
                  perfColor = 'text-green-600';
                  PerfIcon = TrendingUp;
              } else if (ratio >= 1.1) {
                  perfColor = 'text-green-500';
                  PerfIcon = TrendingUp;
              } else if (ratio < 0.7) {
                  perfColor = 'text-red-500';
                  PerfIcon = TrendingDown;
              }

              return (
              <tr key={video.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-4 text-center">
                    {renderRank(index)}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3.5">
                    <div className="relative flex-shrink-0 w-24 h-14 bg-slate-200 rounded overflow-hidden group">
                      <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-slate-500 font-medium truncate max-w-[160px]">{video.channelTitle}</span>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">• {new Date(video.publishedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <a 
                                href={`https://www.youtube.com/watch?v=${video.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-slate-900 hover:text-blue-600 line-clamp-1 mr-0.5"
                                title={video.title}
                            >
                                {video.title}
                            </a>
                            {outlierBadges.map((badge) => (
                              <div key={badge.id} className="relative group/badge inline-flex items-center">
                                <span 
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border cursor-help whitespace-nowrap transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${badge.badgeStyle}`}
                                  title={badge.tooltip}
                                >
                                  {badge.label}
                                </span>
                                {/* Tooltip Popover */}
                                <div className="pointer-events-none absolute bottom-full left-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 hidden group-hover/badge:flex flex-col items-center z-50 w-64">
                                  <div className="bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-normal px-2.5 py-1.5 rounded-lg shadow-xl leading-relaxed text-left whitespace-normal border border-slate-700/80">
                                    <p className="font-semibold text-amber-300 text-[10px] mb-0.5">{badge.label}</p>
                                    <p>{badge.tooltip}</p>
                                  </div>
                                  <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700/80"></div>
                                </div>
                              </div>
                            ))}
                        </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-700">
                  {video.viewCount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                    <div className={`flex items-center justify-end gap-1 font-bold text-sm ${perfColor}`}>
                        {ratio !== 0 && <PerfIcon size={14} />}
                        {label}
                    </div>
                    <div className="text-[10px] text-slate-400 text-right">
                        평균 {channelAverages[video.channelId] ? Math.round(channelAverages[video.channelId]).toLocaleString() : 0}
                    </div>
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
                <td className="px-4 py-4 text-center">
                    <button 
                        onClick={() => onHideVideo(video.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="목록에서 숨기기"
                    >
                        <EyeOff size={16} />
                    </button>
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
