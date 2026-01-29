
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

/**
 * YouTube API의 공통 에러 처리를 위한 헬퍼 함수
 */
const handleApiError = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `API 호출 실패 (Status: ${response.status})`;
    
    if (response.status === 403) {
      throw new Error(`[API 키/할당량 오류] ${message}`);
    } else if (response.status === 400) {
      throw new Error(`[잘못된 요청] ${message}`);
    } else {
      throw new Error(message);
    }
  }
};

/**
 * 채널명(검색어)으로 채널 정보를 검색합니다.
 */
const searchChannelByName = async (name: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const searchUrl = `${BASE_URL}/search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=1&key=${apiKey}`;
  const response = await fetch(searchUrl);
  await handleApiError(response);
  
  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error(`'${name}'에 해당하는 채널을 찾을 수 없습니다.`);
  }

  const channelId = data.items[0].id.channelId;
  // 상세 정보를 가져오기 위해 다시 호출 (uploadsPlaylistId 필요)
  return fetchChannelById(channelId, apiKey);
};

/**
 * 채널 ID로 정확한 정보를 가져옵니다.
 */
const fetchChannelById = async (channelId: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const url = `${BASE_URL}/channels?part=snippet,contentDetails&id=${channelId}&key=${apiKey}`;
  const response = await fetch(url);
  await handleApiError(response);
  
  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    throw new Error('채널 상세 정보를 가져오는 데 실패했습니다.');
  }

  const item = data.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl,
    thumbnail: item.snippet.thumbnails.default.url,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
};

/**
 * 핸들(@)로 채널 정보를 가져옵니다.
 */
const fetchChannelByHandle = async (handle: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const url = `${BASE_URL}/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`;
  const response = await fetch(url);
  await handleApiError(response);
  
  const data = await response.json();
  if (!data.items || data.items.length === 0) {
    // 핸들로 못 찾으면 일반 검색으로 전환
    return searchChannelByName(handle, apiKey);
  }

  const item = data.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl,
    thumbnail: item.snippet.thumbnails.default.url,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
};

export const fetchChannelInfo = async (identifier: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const cleanId = identifier.trim();
  
  if (!cleanId) throw new Error('채널 식별자를 입력해주세요.');

  // 1. 핸들 형식인 경우 (@으로 시작)
  if (cleanId.startsWith('@')) {
    return fetchChannelByHandle(cleanId, apiKey);
  }
  
  // 2. 채널 ID 형식인 경우 (UC...로 시작)
  if (cleanId.startsWith('UC') && cleanId.length > 20) {
    return fetchChannelById(cleanId, apiKey);
  }

  // 3. 그 외 일반 텍스트는 이름으로 검색
  return searchChannelByName(cleanId, apiKey);
};

export const fetchRecentVideos = async (channels: Channel[], apiKey: string): Promise<Video[]> => {
  if (channels.length === 0) return [];

  const allVideos: Video[] = [];
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const channelPromises = channels.map(async (channel) => {
    try {
      const plResponse = await fetch(
        `${BASE_URL}/playlistItems?part=snippet,contentDetails&playlistId=${channel.uploadsPlaylistId}&maxResults=15&key=${apiKey}`
      );
      if (!plResponse.ok) return []; // 개별 채널 오류는 무시하고 계속 진행

      const plData = await plResponse.json();
      if (!plData.items) return [];

      const videoIds: string[] = [];
      for (const item of plData.items) {
        const publishedAt = new Date(item.snippet.publishedAt);
        if (publishedAt >= oneWeekAgo) {
            videoIds.push(item.contentDetails.videoId);
        }
      }

      if (videoIds.length === 0) return [];

      const vResponse = await fetch(
        `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`
      );
      if (!vResponse.ok) return [];

      const vData = await vResponse.json();
      if (!vData.items) return [];

      return vData.items.map((item: any) => {
        const durationSec = parseDuration(item.contentDetails.duration);
        const isShort = durationSec <= 180; 

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
          isShort,
        };
      });
    } catch (error) {
      console.error(`Error fetching videos for channel ${channel.title}`, error);
      return [];
    }
  });

  const results = await Promise.all(channelPromises);
  results.forEach(videos => allVideos.push(...videos));
  
  return allVideos;
};
