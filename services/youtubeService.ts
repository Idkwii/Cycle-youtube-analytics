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

export const fetchChannelInfo = async (identifier: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  // Check if identifier is a handle (starts with @) or looks like an ID
  let queryParam = '';
  if (identifier.startsWith('@')) {
    queryParam = `forHandle=${encodeURIComponent(identifier)}`;
  } else {
    queryParam = `id=${identifier}`;
  }

  const response = await fetch(`${BASE_URL}/channels?part=snippet,contentDetails&${queryParam}&key=${apiKey}`);
  const data = await response.json();

  if (!data.items || data.items.length === 0) {
    // Fallback: Try search if ID lookup fails and it wasn't a handle
    if (!identifier.startsWith('@')) {
        const searchRes = await fetch(`${BASE_URL}/search?part=snippet&type=channel&q=${identifier}&key=${apiKey}`);
        const searchData = await searchRes.json();
        if (searchData.items && searchData.items.length > 0) {
            // Recursively call with the found ID
            return fetchChannelInfo(searchData.items[0].id.channelId, apiKey);
        }
    }
    throw new Error('채널을 찾을 수 없습니다');
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

export const fetchRecentVideos = async (channels: Channel[], apiKey: string): Promise<Video[]> => {
  if (channels.length === 0) return [];

  const allVideos: Video[] = [];
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  // We fetch in parallel for all channels
  const channelPromises = channels.map(async (channel) => {
    try {
      // 1. Get recent uploads from playlist
      const plResponse = await fetch(
        `${BASE_URL}/playlistItems?part=snippet,contentDetails&playlistId=${channel.uploadsPlaylistId}&maxResults=10&key=${apiKey}`
      );
      const plData = await plResponse.json();

      if (!plData.items) return [];

      const videoIds: string[] = [];

      // Filter by date first to reduce ID lookups
      for (const item of plData.items) {
        const publishedAt = new Date(item.snippet.publishedAt);
        if (publishedAt >= oneWeekAgo) {
            const vidId = item.contentDetails.videoId;
            videoIds.push(vidId);
        }
      }

      if (videoIds.length === 0) return [];

      // 2. Get detailed video stats and duration
      const vResponse = await fetch(
        `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoIds.join(',')}&key=${apiKey}`
      );
      const vData = await vResponse.json();

      if (!vData.items) return [];

      return vData.items.map((item: any) => {
        const durationSec = parseDuration(item.contentDetails.duration);
        // We define "Shorts" as <= 60 seconds. YouTube technically classifies vertical <60s as shorts,
        // but API doesn't have an explicit "isShort" flag in snippet. Duration is the best proxy.
        const isShort = durationSec <= 60; 

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