import streamlit as st
import pandas as pd
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import isodate
from datetime import datetime, timedelta
import time

# --- 페이지 설정 ---
st.set_page_config(
    page_title="Cycle Youtube Analytics",
    page_icon="🎬",
    layout="wide"
)

# --- CSS 커스텀 (테이블 이미지 크기 등) ---
st.markdown("""
<style>
    [data-testid="stSidebar"] {
        background-color: #f8f9fa;
    }
    img {
        border-radius: 8px;
    }
</style>
""", unsafe_allow_html=True)

# --- Session State 초기화 ---
if 'api_key' not in st.session_state:
    st.session_state.api_key = ''
if 'channels' not in st.session_state:
    st.session_state.channels = [] # List of dict: {id, title, handle, thumbnail, uploads_id, folder_id}
if 'folders' not in st.session_state:
    st.session_state.folders = [] # List of dict: {id, name}
if 'videos' not in st.session_state:
    st.session_state.videos = [] # Cache for videos

# --- Youtube API 서비스 함수 ---
def get_youtube_service(api_key):
    try:
        return build('youtube', 'v3', developerKey=api_key)
    except Exception as e:
        st.error(f"API 연결 실패: {e}")
        return None

def fetch_channel_info(identifier, api_key, folders):
    youtube = get_youtube_service(api_key)
    if not youtube: return None

    try:
        # 1. 핸들(@name) 또는 ID로 채널 검색
        if identifier.startswith('@'):
            request = youtube.channels().list(part="snippet,contentDetails", forHandle=identifier)
        else:
            request = youtube.channels().list(part="snippet,contentDetails", id=identifier)
        
        response = request.execute()
        
        # 검색 결과 없으면 일반 검색 시도 (채널명 등)
        if not response.get('items'):
            search_request = youtube.search().list(part="snippet", type="channel", q=identifier, maxResults=1)
            search_response = search_request.execute()
            if search_response.get('items'):
                channel_id = search_response['items'][0]['snippet']['channelId']
                return fetch_channel_info(channel_id, api_key, folders)
            else:
                st.error("채널을 찾을 수 없습니다.")
                return None

        item = response['items'][0]
        
        # 중복 체크
        if any(c['id'] == item['id'] for c in st.session_state.channels):
            st.warning("이미 등록된 채널입니다.")
            return None

        # 폴더가 하나도 없으면 '기본 폴더' 자동 생성
        target_folder_id = None
        if not st.session_state.folders:
             new_folder_id = f"f-{int(time.time())}"
             st.session_state.folders.append({"id": new_folder_id, "name": "기본 폴더"})
             target_folder_id = new_folder_id
        else:
             target_folder_id = st.session_state.folders[0]['id']

        return {
            "id": item['id'],
            "title": item['snippet']['title'],
            "handle": item['snippet'].get('customUrl', ''),
            "thumbnail": item['snippet']['thumbnails']['default']['url'],
            "uploads_id": item['contentDetails']['relatedPlaylists']['uploads'],
            "folder_id": target_folder_id # 기본적으로 첫 번째 폴더 혹은 자동생성된 폴더에 할당
        }

    except HttpError as e:
        st.error(f"API 오류: {e}")
        return None

@st.cache_data(ttl=600, show_spinner=False)
def get_recent_videos(_channels, api_key):
    # _channels: unhashable list 이슈 방지를 위해 인자명 앞에 _ 붙임 (Streamlit 캐싱)
    if not _channels: return []
    
    youtube = get_youtube_service(api_key)
    if not youtube: return []

    all_videos = []
    one_week_ago = datetime.now() - timedelta(days=7)

    for channel in _channels:
        try:
            # 1. 업로드 재생목록에서 최근 영상 가져오기
            pl_request = youtube.playlistItems().list(
                part="snippet,contentDetails",
                playlistId=channel['uploads_id'],
                maxResults=20 
            )
            pl_response = pl_request.execute()
            
            video_ids = []
            for item in pl_response.get('items', []):
                published_at = datetime.fromisoformat(item['snippet']['publishedAt'].replace('Z', '+00:00'))
                if published_at.replace(tzinfo=None) >= one_week_ago:
                    video_ids.append(item['contentDetails']['videoId'])
            
            if not video_ids:
                continue

            # 2. 영상 세부 정보(통계, 길이) 가져오기
            vid_request = youtube.videos().list(
                part="snippet,statistics,contentDetails",
                id=",".join(video_ids)
            )
            vid_response = vid_request.execute()

            for item in vid_response.get('items', []):
                duration = isodate.parse_duration(item['contentDetails']['duration'])
                is_short = duration.total_seconds() < 60

                all_videos.append({
                    "id": item['id'],
                    "channel_id": channel['id'],
                    "channel_title": channel['title'],
                    "title": item['snippet']['title'],
                    "thumbnail": item['snippet']['thumbnails'].get('medium', item['snippet']['thumbnails']['default'])['url'],
                    "published_at": datetime.fromisoformat(item['snippet']['publishedAt'].replace('Z', '+00:00')),
                    "view_count": int(item['statistics'].get('viewCount', 0)),
                    "like_count": int(item['statistics'].get('likeCount', 0)),
                    "comment_count": int(item['statistics'].get('commentCount', 0)),
                    "duration_sec": duration.total_seconds(),
                    "is_short": is_short,
                    "url": f"https://www.youtube.com/watch?v={item['id']}"
                })

        except Exception as e:
            print(f"Error fetching {channel['title']}: {e}")
            continue
            
    return all_videos

# --- 사이드바 UI ---
with st.sidebar:
    st.header("⚙️ 설정 & 관리")
    
    # 1. API Key
    api_key_input = st.text_input("YouTube API Key", value=st.session_state.api_key, type="password")
    if api_key_input != st.session_state.api_key:
        st.session_state.api_key = api_key_input
        st.rerun()

    st.divider()

    # 2. 폴더 추가
    with st.expander("📁 폴더 관리", expanded=False):
        new_folder = st.text_input("새 폴더 이름")
        if st.button("폴더 추가"):
            if new_folder:
                st.session_state.folders.append({
                    "id": f"f-{int(time.time())}",
                    "name": new_folder
                })
                st.success(f"'{new_folder}' 추가됨")
                st.rerun()

    # 3. 채널 추가
    with st.expander("📺 채널 추가", expanded=True):
        new_channel_id = st.text_input("핸들(@name) 또는 ID")
        
        # 폴더 선택 (채널 추가 시)
        folder_options = {f['id']: f['name'] for f in st.session_state.folders}
        selected_folder_for_add = None
        
        if folder_options:
            selected_folder_for_add = st.selectbox(
                "폴더 선택", 
                options=list(folder_options.keys()), 
                format_func=lambda x: folder_options[x]
            )
        else:
            st.caption("폴더가 없으면 '기본 폴더'가 자동 생성됩니다.")

        if st.button("채널 추가하기"):
            if not st.session_state.api_key:
                st.error("API Key를 먼저 입력하세요.")
            elif new_channel_id:
                with st.spinner("채널 정보 확인 중..."):
                    channel_info = fetch_channel_info(new_channel_id, st.session_state.api_key, st.session_state.folders)
                    if channel_info:
                        if selected_folder_for_add:
                            channel_info['folder_id'] = selected_folder_for_add
                        
                        st.session_state.channels.append(channel_info)
                        st.success(f"'{channel_info['title']}' 추가 완료!")
                        # 데이터 즉시 갱신을 위해 캐시 무효화가 필요할 수 있음
                        st.cache_data.clear()
                        st.rerun()

    st.divider()

    # 4. 네비게이션 (계층 구조 필터링)
    st.subheader("👀 뷰 모드")
    
    # Level 1: 폴더 선택
    folder_map = {f['id']: f['name'] for f in st.session_state.folders}
    folder_choices = ["전체 보기"] + list(folder_map.values())
    selected_folder_name = st.selectbox("폴더 필터", folder_choices)
    
    selected_folder_id = None
    if selected_folder_name != "전체 보기":
        # 이름으로 ID 찾기 (단순화를 위해 이름 유니크 가정 혹은 첫번째 매칭)
        for fid, fname in folder_map.items():
            if fname == selected_folder_name:
                selected_folder_id = fid
                break

    # Level 2: 채널 선택 (선택된 폴더 내의 채널만 표시)
    channel_choices = ["전체 채널"]
    filtered_channels_for_select = st.session_state.channels
    
    if selected_folder_id:
        filtered_channels_for_select = [c for c in st.session_state.channels if c['folder_id'] == selected_folder_id]
    
    channel_map = {c['id']: c['title'] for c in filtered_channels_for_select}
    channel_choices += list(channel_map.values())
    
    selected_channel_name = st.selectbox("채널 상세 보기", channel_choices)
    
    selected_channel_id = None
    if selected_channel_name != "전체 채널":
        for cid, cname in channel_map.items():
            if cname == selected_channel_name:
                selected_channel_id = cid
                break

    if st.button("🔄 데이터 새로고침"):
        st.cache_data.clear()
        st.rerun()

# --- 메인 대시보드 로직 ---

# 1. 데이터 가져오기 (전체)
if st.session_state.api_key and st.session_state.channels:
    videos = get_recent_videos(st.session_state.channels, st.session_state.api_key)
else:
    videos = []

# 2. 필터링 로직 (폴더 -> 채널 -> 숏폼/롱폼)
filtered_videos = videos

# 2-1. 계층 필터 (Sidebar 선택값 반영)
current_view_title = "전체 채널 분석"

if selected_channel_id:
    filtered_videos = [v for v in filtered_videos if v['channel_id'] == selected_channel_id]
    current_view_title = f"📺 {selected_channel_name} 분석"
elif selected_folder_id:
    # 해당 폴더에 속한 채널 ID 목록
    folder_channel_ids = [c['id'] for c in st.session_state.channels if c['folder_id'] == selected_folder_id]
    filtered_videos = [v for v in filtered_videos if v['channel_id'] in folder_channel_ids]
    current_view_title = f"📁 {selected_folder_name} 분석"

# 2-2. 형식 필터 (메인 화면 상단)
col_title, col_filter = st.columns([2, 1])
with col_title:
    st.title(current_view_title)
    st.caption("최근 7일간 업로드된 영상 데이터입니다.")

with col_filter:
    type_filter = st.radio("영상 형식", ["전체", "롱폼(>1분)", "숏폼(<1분)"], horizontal=True)

if type_filter == "롱폼(>1분)":
    filtered_videos = [v for v in filtered_videos if not v['is_short']]
elif type_filter == "숏폼(<1분)":
    filtered_videos = [v for v in filtered_videos if v['is_short']]

# --- 대시보드 렌더링 ---

if not st.session_state.api_key:
    st.info("👈 사이드바에 YouTube API Key를 입력하여 시작하세요.")
elif not st.session_state.channels:
    st.info("👈 사이드바에서 분석할 유튜브 채널을 추가해주세요.")
elif not filtered_videos:
    st.warning("선택한 조건에 해당하는 최근 7일 내 영상이 없습니다.")
else:
    # 1. 통계 카드 (Metrics)
    total_videos = len(filtered_videos)
    total_views = sum(v['view_count'] for v in filtered_videos)
    total_likes = sum(v['like_count'] for v in filtered_videos)
    total_comments = sum(v['comment_count'] for v in filtered_videos)

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("영상 수", f"{total_videos:,}개")
    m2.metric("총 조회수", f"{total_views:,}회")
    m3.metric("총 좋아요", f"{total_likes:,}개")
    m4.metric("총 댓글", f"{total_comments:,}개")

    st.markdown("---")

    # 2. 차트 (채널별 조회수 비교 - 전체 보기 모드일 때만 유용)
    if not selected_channel_id and len(filtered_videos) > 0:
        st.subheader("📊 채널별 조회수 TOP 5")
        
        # 데이터 집계
        df_chart = pd.DataFrame(filtered_videos)
        if not df_chart.empty:
            chart_data = df_chart.groupby('channel_title')['view_count'].sum().sort_values(ascending=False).head(5)
            st.bar_chart(chart_data)

    # 3. 데이터 테이블
    st.subheader("📝 상세 영상 리스트")
    
    # DataFrame 변환
    df = pd.DataFrame(filtered_videos)
    
    if not df.empty:
        # 보여줄 컬럼 선택 및 정렬용 데이터 가공
        df_display = df[['thumbnail', 'title', 'published_at', 'view_count', 'like_count', 'comment_count', 'url', 'channel_title']].copy()
        
        # 날짜 포맷팅 (YYYY-MM-DD HH:MM)
        df_display['published_at'] = df_display['published_at'].dt.strftime('%Y-%m-%d %H:%M')
        
        # 컬럼 이름 한글화
        df_display = df_display.rename(columns={
            'thumbnail': '썸네일',
            'title': '제목',
            'published_at': '게시일',
            'view_count': '조회수',
            'like_count': '좋아요',
            'comment_count': '댓글',
            'channel_title': '채널명',
            'url': '링크'
        })
        
        # 컬럼 순서 재배치
        df_display = df_display[['썸네일', '채널명', '제목', '링크', '게시일', '조회수', '좋아요', '댓글']]

        # Streamlit Dataframe 설정
        st.dataframe(
            df_display,
            column_config={
                "썸네일": st.column_config.ImageColumn(
                    "썸네일",
                    width="small",
                    help="영상 썸네일"
                ),
                "링크": st.column_config.LinkColumn(
                    "이동",
                    help="클릭하여 유튜브에서 보기",
                    display_text="▶️ 영상 보기"
                ),
                "조회수": st.column_config.NumberColumn(
                    "조회수",
                    format="%d"
                ),
                "좋아요": st.column_config.NumberColumn(
                    "좋아요",
                    format="%d"
                ),
                "댓글": st.column_config.NumberColumn(
                    "댓글",
                    format="%d"
                ),
                # 제목 컬럼은 텍스트로 두고, 링크 컬럼을 별도로 제공하는 것이 Streamlit에서 가장 깔끔합니다.
                # (제목 텍스트 자체에 링크를 거는 기능은 LinkColumn만으로는 제한적임)
            },
            hide_index=True,
            use_container_width=True,
            height=600
        )
