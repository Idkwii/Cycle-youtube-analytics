import os
import json
import re
import time
import requests
from datetime import datetime, timedelta, timezone

# ── 환경변수 ──────────────────────────────────────────────
YOUTUBE_API_KEY     = os.environ["YOUTUBE_API_KEY"]
NOTION_TOKEN        = os.environ["NOTION_TOKEN"]
NOTION_DATABASE_ID  = os.environ["NOTION_DATABASE_ID"]

DAYS_BACK    = 7
YT_BASE      = "https://www.googleapis.com/youtube/v3"
NOTION_BASE  = "https://api.notion.com/v1"

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}


# ── YouTube API ───────────────────────────────────────────

def get_recent_videos(playlist_id: str, days_back: int = DAYS_BACK) -> list[dict]:
    """업로드 플레이리스트에서 최근 N일 영상 목록 반환 (1 unit/call)"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    videos, page_token = [], None

    while True:
        params = {
            "part": "contentDetails,snippet",
            "playlistId": playlist_id,
            "maxResults": 50,
            "key": YOUTUBE_API_KEY,
        }
        if page_token:
            params["pageToken"] = page_token

        res = requests.get(f"{YT_BASE}/playlistItems", params=params, timeout=30)
        data = res.json()

        if "error" in data:
            print(f"  [YT 오류] {data['error']['message']}")
            break

        stop = False
        for item in data.get("items", []):
            pub_str = item["snippet"]["publishedAt"]
            pub_dt  = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            if pub_dt < cutoff:
                stop = True
                break
            thumbnails = item["snippet"].get("thumbnails", {})
            thumb = (thumbnails.get("maxres") or thumbnails.get("high") or
                     thumbnails.get("medium") or {}).get("url", "")
            videos.append({
                "id":          item["contentDetails"]["videoId"],
                "title":       item["snippet"]["title"],
                "thumbnail":   thumb,
                "publishedAt": pub_str,
            })

        if stop or "nextPageToken" not in data:
            break
        page_token = data["nextPageToken"]

    return videos


def get_video_stats(video_ids: list[str]) -> dict:
    """영상 통계 + 길이 배치 조회 (50개씩, 1 unit/call)"""
    stats = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        params = {
            "part": "statistics,contentDetails",
            "id": ",".join(batch),
            "key": YOUTUBE_API_KEY,
        }
        res  = requests.get(f"{YT_BASE}/videos", params=params, timeout=30)
        data = res.json()

        for item in data.get("items", []):
            s = item["statistics"]
            duration = item["contentDetails"].get("duration", "PT0S")
            match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
            total_sec = (
                int(match.group(1) or 0) * 3600
                + int(match.group(2) or 0) * 60
                + int(match.group(3) or 0)
            ) if match else 0

            stats[item["id"]] = {
                "viewCount":    int(s.get("viewCount", 0)),
                "likeCount":    int(s.get("likeCount", 0)),
                "commentCount": int(s.get("commentCount", 0)),
                "isShort":      total_sec <= 180,
            }
    return stats


# ── Notion API ────────────────────────────────────────────

def page_exists(video_id: str, snapshot_date: str) -> bool:
    """오늘 이미 저장된 레코드인지 확인 (중복 방지)"""
    payload = {
        "filter": {
            "and": [
                {"property": "Video ID",     "rich_text": {"equals": video_id}},
                {"property": "스냅샷 날짜", "date":      {"equals": snapshot_date}},
            ]
        },
        "page_size": 1,
    }
    res = requests.post(
        f"{NOTION_BASE}/databases/{NOTION_DATABASE_ID}/query",
        headers=NOTION_HEADERS,
        json=payload,
        timeout=30,
    )
    return len(res.json().get("results", [])) > 0


def create_notion_page(video: dict, channel_title: str,
                       performance_idx: float, snapshot_date: str) -> bool:
    """노션 DB에 영상 레코드 생성"""
    props = {
        "영상 제목":    {"title":     [{"text": {"content": video["title"][:2000]}}]},
        "채널":         {"select":    {"name": channel_title}},
        "업로드일":     {"date":      {"start": video["publishedAt"][:10]}},
        "스냅샷 날짜":  {"date":      {"start": snapshot_date}},
        "조회수":       {"number":    video["stats"]["viewCount"]},
        "좋아요":       {"number":    video["stats"]["likeCount"]},
        "댓글":         {"number":    video["stats"]["commentCount"]},
        "퍼포먼스 지수":{"number":    round(performance_idx, 1)},
        "쇼츠 여부":    {"checkbox":  video["stats"]["isShort"]},
        "영상 URL":     {"url":       f"https://youtube.com/watch?v={video['id']}"},
        "Video ID":     {"rich_text": [{"text": {"content": video["id"]}}]},
    }

    body: dict = {"parent": {"database_id": NOTION_DATABASE_ID}, "properties": props}
    if video["thumbnail"]:
        body["cover"] = {"type": "external", "external": {"url": video["thumbnail"]}}

    for attempt in range(3):
        res = requests.post(f"{NOTION_BASE}/pages", headers=NOTION_HEADERS,
                            json=body, timeout=30)
        if res.status_code == 200:
            return True
        if res.status_code == 429:          # rate limit
            time.sleep(2 ** attempt)
            continue
        print(f"  [Notion 오류] {res.status_code} {res.text[:200]}")
        return False
    return False


# ── 메인 ─────────────────────────────────────────────────

def main():
    with open("channels.json", encoding="utf-8") as f:
        channels = json.load(f)

    snapshot_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_videos = saved = skipped = 0

    print(f"{'='*50}")
    print(f"경쟁사 유튜브 트래킹 시작: {snapshot_date}")
    print(f"채널 수: {len(channels)}개 | 기간: 최근 {DAYS_BACK}일")
    print(f"{'='*50}")

    for ch in channels:
        print(f"\n[{ch['title']}] 수집 중...")
        videos = get_recent_videos(ch["uploadsPlaylistId"])

        if not videos:
            print(f"  → 최근 {DAYS_BACK}일 내 업로드 없음")
            continue

        # 통계 일괄 조회
        stats = get_video_stats([v["id"] for v in videos])
        for v in videos:
            v["stats"] = stats.get(v["id"],
                {"viewCount": 0, "likeCount": 0, "commentCount": 0, "isShort": False})

        # 채널 평균 조회수 계산
        views = [v["stats"]["viewCount"] for v in videos if v["stats"]["viewCount"] > 0]
        avg   = sum(views) / len(views) if views else 1

        # 노션 저장
        for v in videos:
            total_videos += 1
            if page_exists(v["id"], snapshot_date):
                skipped += 1
                continue
            perf = v["stats"]["viewCount"] / avg * 100
            if create_notion_page(v, ch["title"], perf, snapshot_date):
                saved += 1
            time.sleep(0.35)  # Notion rate limit 방지

        print(f"  → {len(videos)}개 영상 | 저장 {saved}건 | 스킵(중복) {skipped}건")

    print(f"\n{'='*50}")
    print(f"완료: 총 {total_videos}개 영상 | 저장 {saved}건 | 스킵 {skipped}건")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
