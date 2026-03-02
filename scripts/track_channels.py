import os
import json
import re
import time
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

# ── .env 파일 로드 (로컬 실행 시) ─────────────────────────
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

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

def get_existing_page_id(video_id: str) -> Optional[str]:
    """Video ID로 기존 레코드 조회 → page_id 반환 (없으면 None)"""
    payload = {
        "filter": {"property": "Video ID", "rich_text": {"equals": video_id}},
        "page_size": 1,
    }
    res = requests.post(
        f"{NOTION_BASE}/databases/{NOTION_DATABASE_ID}/query",
        headers=NOTION_HEADERS,
        json=payload,
        timeout=30,
    )
    results = res.json().get("results", [])
    return results[0]["id"] if results else None


def build_props(video: dict, channel_title: str,
                performance_idx: float, today: str) -> dict:
    """노션 properties 딕셔너리 생성"""
    return {
        "영상 제목":       {"title":     [{"text": {"content": video["title"][:2000]}}]},
        "채널":            {"select":    {"name": channel_title}},
        "업로드일":        {"date":      {"start": video["publishedAt"][:10]}},
        "마지막 업데이트": {"date":      {"start": today}},
        "조회수":          {"number":    video["stats"]["viewCount"]},
        "좋아요":          {"number":    video["stats"]["likeCount"]},
        "댓글":            {"number":    video["stats"]["commentCount"]},
        "퍼포먼스 지수":   {"number":    round(performance_idx, 1)},
        "급상승 여부":     {"checkbox":  performance_idx >= 200},
        "URL":             {"url":       f"https://youtube.com/watch?v={video['id']}"},
        "Video ID":        {"rich_text": [{"text": {"content": video["id"]}}]},
    }


def upsert_notion_page(video: dict, channel_title: str,
                       performance_idx: float, today: str) -> str:
    """기존 레코드면 업데이트, 없으면 새로 생성. 'created'/'updated'/'failed' 반환"""
    props = build_props(video, channel_title, performance_idx, today)
    page_id = get_existing_page_id(video["id"])

    for attempt in range(3):
        if page_id:
            res = requests.patch(
                f"{NOTION_BASE}/pages/{page_id}",
                headers=NOTION_HEADERS,
                json={"properties": props},
                timeout=30,
            )
        else:
            body: dict = {
                "parent": {"database_id": NOTION_DATABASE_ID},
                "properties": props,
            }
            if video["thumbnail"]:
                body["cover"] = {"type": "external", "external": {"url": video["thumbnail"]}}
            res = requests.post(f"{NOTION_BASE}/pages", headers=NOTION_HEADERS,
                                json=body, timeout=30)

        if res.status_code == 200:
            return "updated" if page_id else "created"
        if res.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        print(f"  [Notion 오류] {res.status_code} {res.text[:200]}")
        return "failed"
    return "failed"


# ── 메인 ─────────────────────────────────────────────────

def main():
    with open("channels.json", encoding="utf-8") as f:
        channels = json.load(f)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_videos = created = updated = failed = 0

    print(f"{'='*50}")
    print(f"경쟁사 유튜브 트래킹 시작: {today}")
    print(f"채널 수: {len(channels)}개 | 기간: 최근 {DAYS_BACK}일")
    print(f"{'='*50}")

    for ch in channels:
        print(f"\n[{ch['title']}] 수집 중...")
        videos = get_recent_videos(ch["uploadsPlaylistId"])

        if not videos:
            print(f"  → 최근 {DAYS_BACK}일 내 업로드 없음")
            continue

        stats = get_video_stats([v["id"] for v in videos])
        for v in videos:
            v["stats"] = stats.get(v["id"],
                {"viewCount": 0, "likeCount": 0, "commentCount": 0, "isShort": False})

        videos = [v for v in videos if not v["stats"]["isShort"]]
        if not videos:
            print(f"  → 숏츠만 있어서 스킵")
            continue

        views = [v["stats"]["viewCount"] for v in videos if v["stats"]["viewCount"] > 0]
        avg   = sum(views) / len(views) if views else 1

        ch_created = ch_updated = ch_failed = 0
        for v in videos:
            total_videos += 1
            perf   = v["stats"]["viewCount"] / avg * 100
            result = upsert_notion_page(v, ch["title"], perf, today)
            if result == "created":
                created += 1
                ch_created += 1
            elif result == "updated":
                updated += 1
                ch_updated += 1
            else:
                failed += 1
                ch_failed += 1
            time.sleep(0.35)

        print(f"  → {len(videos)}개 영상 | 신규 {ch_created}건 | 업데이트 {ch_updated}건" +
              (f" | 실패 {ch_failed}건" if ch_failed else ""))

    print(f"\n{'='*50}")
    print(f"완료: 총 {total_videos}개 | 신규 {created}건 | 업데이트 {updated}건 | 실패 {failed}건")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
