import { Channel, Video } from '../types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

// ISO 8601 duration parser to seconds
const parseDuration = (duration: string): number => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;

  const hours = (parseInt(match[1] || '0') || 0);
  const minutes = (parseInt(match[2] || '0') || 0);
  const seconds = (parseInt(match[3] || '0') || 0);

  return hours * 3600 + minutes * 60 + seconds;
};

const handleApiError = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `API 호출 실패 (Status: ${response.status})`;
    
    if (response.status === 403) {
      if (message.includes('referer')) {
        throw new Error(`[도메인 차단] Google Cloud Console에서 현재 도메인(pages.dev)을 API 키 허용 목록에 추가해야 합니다.`);
      }
      throw new Error(`[API 키/할당량 오류] ${message}`);
    } else if (response.status === 400) {
      throw new Error(`[잘못된 요청] ${message}`);
    } else {
      throw new Error(message);
    }
  }
};

export const fetchChannelInfo = async (identifier: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const cleanId = identifier.trim();
  if (!cleanId) throw new Error('채널 식별자를 입력해주세요.');

  const fetchById = async (id: string) => {
    const url = `${BASE_URL}/channels?part=snippet,contentDetails&id=${id}&key=${apiKey}`;
    const res = await fetch(url);
    await handleApiError(res);
    const data = await res.json();
    if (!data.items?.length) throw new Error('채널을 찾을 수 없습니다.');
    const item = data.items[0];
    return {
      id: item.id,
      title: item.snippet.title,
      handle: item.snippet.customUrl,
      thumbnail: item.snippet.thumbnails.default.url,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  };

  const fetchByHandle = async (handle: string) => {
    const url = `${BASE_URL}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
    const res = await fetch(url);
    await handleApiError(res);
    const data = await res.json();
    if (!data.items?.length) return searchByName(handle);
    const item = data.items[0];
    return {
      id: item.id,
      title: item.snippet.title,
      handle: item.snippet.customUrl,
      thumbnail: item.snippet.thumbnails.default.url,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  };

  const searchByName = async (name: string) => {
    const url = `${BASE_URL}/search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=1&key=${apiKey}`;
    const res = await fetch(url);
    await handleApiError(res);
    const data = await res.json();
    if (!data.items?.length) throw new Error(`'${name}' 채널을 찾을 수 없습니다.`);
    return fetchById(data.items[0].id.channelId);
  };

  if (cleanId.startsWith('@')) return fetchByHandle(cleanId);
  if (cleanId.startsWith('UC') && cleanId.length > 20) return fetchById(cleanId);
  return searchByName(cleanId);
};

export const fetchRecentVideos = async (channels: Channel[], apiKey: string, days: number = 30): Promise<Video[]> => {
  if (channels.length === 0) return [];

  const allVideos: Video[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const channelPromises = channels.map(async (channel) => {
    try {
      // 기간이 길어질수록 더 많은 영상을 확인해야 함 (30일 선택시 maxResults 증가)
      const maxResults = days > 7 ? 50 : 20;
      const plUrl = `${BASE_URL}/playlistItems?part=snippet,contentDetails&playlistId=${channel.uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
      const plRes = await fetch(plUrl);
      if (!plRes.ok) return [];

      const plData = await plRes.json();
      if (!plData.items) return [];

      const videoIds: string[] = [];
      for (const item of plData.items) {
        const publishedAt = new Date(item.snippet.publishedAt);
        if (publishedAt >= cutoffDate) {
          videoIds.push(item.contentDetails.videoId);
        }
      }

      if (videoIds.length === 0) return [];

      const vUrl = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`;
      const vRes = await fetch(vUrl);
      if (!vRes.ok) return [];

      const vData = await vRes.json();
      if (!vData.items) return [];

      return vData.items.map((item: any) => {
        const durationSec = parseDuration(item.contentDetails.duration);
        return {
          id: item.id,
          channelId: channel.id,
          channelTitle: channel.title,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          publishedAt: item.snippet.publishedAt,
          viewCount: parseInt(item.statistics.viewCount || '0'),
          likeCount: parseInt(item.statistics.likeCount || '0'),
          commentCount: parseInt(item.statistics.commentCount || '0'),
          duration: item.contentDetails.duration,
          isShort: durationSec <= 180,
        };
      });
    } catch (error) {
      console.error(`Error for ${channel.title}:`, error);
      return [];
    }
  });

  const results = await Promise.all(channelPromises);
  results.forEach(videos => allVideos.push(...videos));
  return allVideos;
};