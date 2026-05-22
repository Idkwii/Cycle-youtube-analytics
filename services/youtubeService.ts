
import { Channel, Video } from '../types';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

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
      if (message.includes('quota') || message.includes('limit')) {
        throw new Error(`[할당량 초과] 오늘 사용할 수 있는 YouTube API 한도를 모두 소진했습니다. 내일 오후 4시(KST)에 초기화되거나 다른 API 키를 사용해야 합니다.`);
      }
      if (message.includes('referer') || message.includes('blocked')) {
        throw new Error(`[도메인 차단됨] 현재 도메인에서의 요청이 거부되었습니다.\nGoogle Cloud Console > API 및 서비스 > 사용자 인증 정보 > API 키 설정에서\n'웹사이트 제한'에 현재 도메인 주소를 추가하세요.`);
      }
      throw new Error(`[접근 거부] ${message}`);
    }
    throw new Error(message);
  }
};

// --- Data API (Public) ---

export const fetchChannelInfo = async (identifier: string, apiKey: string): Promise<Omit<Channel, 'folderId'>> => {
  const cleanId = identifier.trim();
  if (!cleanId) throw new Error('채널 식별자를 입력해주세요.');

  // 1. 채널 ID (UC...) 형식인 경우 (비용: 1 유닛)
  if (cleanId.startsWith('UC') && cleanId.length > 20) {
    const url = `${BASE_URL}/channels?part=snippet,contentDetails,statistics&id=${cleanId}&key=${apiKey}`;
    const res = await fetch(url);
    await handleApiError(res);
    const data = await res.json();
    if (data.items?.length) {
      const item = data.items[0];
      return {
        id: item.id,
        title: item.snippet.title,
        handle: item.snippet.customUrl,
        thumbnail: item.snippet.thumbnails.default.url,
        uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
        subscriberCount: item.statistics.subscriberCount || '0',
      };
    }
  }

  // 2. 핸들 (@...) 형식인 경우 (비용: 1 유닛)
  if (cleanId.startsWith('@')) {
    const url = `${BASE_URL}/channels?part=snippet,contentDetails,statistics&forHandle=${encodeURIComponent(cleanId)}&key=${apiKey}`;
    const res = await fetch(url);
    await handleApiError(res);
    const data = await res.json();
    if (data.items?.length) {
      const item = data.items[0];
      return {
        id: item.id,
        title: item.snippet.title,
        handle: item.snippet.customUrl,
        thumbnail: item.snippet.thumbnails.default.url,
        uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
        subscriberCount: item.statistics.subscriberCount || '0',
      };
    }
  }

  // 3. 마지막 수단: 검색 API 사용 (비용: 100 유닛 - 매우 비쌈!)
  console.warn("Using high-cost search API for identifier:", cleanId);
  const searchUrl = `${BASE_URL}/search?part=snippet&type=channel&q=${encodeURIComponent(cleanId)}&maxResults=1&key=${apiKey}`;
  const sRes = await fetch(searchUrl);
  await handleApiError(sRes);
  const sData = await sRes.json();
  if (!sData.items?.length) throw new Error(`'${cleanId}' 채널을 찾을 수 없습니다.`);
  
  // 찾은 ID로 다시 상세 정보 조회 (1 유닛)
  const foundId = sData.items[0].id.channelId;
  const finalUrl = `${BASE_URL}/channels?part=snippet,contentDetails,statistics&id=${foundId}&key=${apiKey}`;
  const fRes = await fetch(finalUrl);
  await handleApiError(fRes);
  const fData = await fRes.json();
  const item = fData.items[0];
  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl,
    thumbnail: item.snippet.thumbnails.default.url,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    subscriberCount: item.statistics.subscriberCount || '0',
  };
};

export const fetchRecentVideos = async (channels: Channel[], apiKey: string, days: number = 30): Promise<Video[]> => {
  if (channels.length === 0) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const videoToChannelMap: Record<string, { channelId: string, channelTitle: string }> = {};
  const allVideoIds: string[] = [];

  // PlaylistItems API
  const playlistPromises = channels.map(async (channel) => {
    let nextPageToken: string | undefined = undefined;
    let shouldContinue = true;

    // [중요] 페이지네이션 루프: 기간 내의 모든 영상을 가져오기 위함
    while (shouldContinue) {
        try {
            const maxResults = 50; // Max allowed by API per page
            let url = `${BASE_URL}/playlistItems?part=snippet,contentDetails&playlistId=${channel.uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
            if (nextPageToken) {
                url += `&pageToken=${nextPageToken}`;
            }

            const res = await fetch(url);
            if (!res.ok) {
                if (res.status === 403 || res.status === 401 || res.status === 400) {
                    await handleApiError(res);
                }
                break; // Fail silently for individual channel errors to keep others working
            }
            const data = await res.json();
            
            if (!data.items || data.items.length === 0) break;

            for (const item of data.items) {
                const publishedAt = new Date(item.snippet.publishedAt);
                // 날짜 비교: cutoffDate보다 최신이면 추가
                if (publishedAt >= cutoffDate) {
                    const vId = item.contentDetails.videoId;
                    allVideoIds.push(vId);
                    videoToChannelMap[vId] = { channelId: channel.id, channelTitle: channel.title };
                } else {
                    // [최적화] API는 시간 역순으로 오므로, cutoffDate보다 오래된 영상이 나오면 루프 종료
                    shouldContinue = false;
                }
            }

            // 다음 페이지가 있고, 아직 날짜 범위 내에 있다면 계속 진행
            nextPageToken = data.nextPageToken;
            if (!nextPageToken || !shouldContinue) {
                break;
            }

        } catch (e) {
            console.warn(`Failed for ${channel.title}`, e);
            break;
        }
    }
  });

  await Promise.all(playlistPromises);
  if (allVideoIds.length === 0) return [];

  const finalVideos: Video[] = [];
  const chunkSize = 50;
  
  for (let i = 0; i < allVideoIds.length; i += chunkSize) {
    const chunk = allVideoIds.slice(i, i + chunkSize);
    try {
      // Videos API 상세 조회 (50개씩)
      const url = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(',')}&key=${apiKey}`;
      const res = await fetch(url);
      await handleApiError(res);
      const data = await res.json();

      if (data.items) {
        data.items.forEach((item: any) => {
          const durationSec = parseDuration(item.contentDetails.duration);
          const channelInfo = videoToChannelMap[item.id];
          finalVideos.push({
            id: item.id,
            channelId: channelInfo?.channelId || item.snippet.channelId,
            channelTitle: channelInfo?.channelTitle || item.snippet.channelTitle,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
            publishedAt: item.snippet.publishedAt,
            viewCount: parseInt(item.statistics.viewCount || '0'),
            likeCount: parseInt(item.statistics.likeCount || '0'),
            commentCount: parseInt(item.statistics.commentCount || '0'),
            duration: item.contentDetails.duration,
            isShort: durationSec <= 180, // 3분(180초) 이하를 숏츠로 간주
          });
        });
      }
    } catch (e) {
      console.error("Chunk error", e);
    }
  }

  return finalVideos;
};
