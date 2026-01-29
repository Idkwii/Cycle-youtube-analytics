# Cycle Youtube Analytics (React Version)

YouTube Data API를 사용하여 채널 성과를 분석하는 **React** 웹 애플리케이션입니다.

## 🚀 배포 방법 (Cloudflare Pages - 권장)

1. **GitHub에 코드 푸시**: 이 프로젝트를 GitHub 저장소에 올립니다.
2. **Cloudflare 대시보드 접속**: [Cloudflare Dashboard](https://dash.cloudflare.com/)에서 **"Workers & Pages"** -> **"Create application"** -> **"Pages"** -> **"Connect to Git"**을 선택합니다.
3. **저장소 선택**: 코드가 담긴 GitHub 저장소를 선택합니다.
4. **빌드 설정**:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. **환경 변수 (선택 사항)**: 
   - `Settings` -> `Environment variables`에서 `VITE_YOUTUBE_API_KEY`를 추가하면 기본 API 키를 미리 세팅할 수 있습니다.
6. **Save and Deploy**: 배포가 완료되면 `*.pages.dev` 주소가 생성됩니다.

## 🛠 로컬 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

## 🔗 주요 기능
- **새로고침**: 사이드바 상단 버튼으로 즉시 데이터 업데이트
- **팀원 공유**: '설정 및 API' 메뉴 안의 버튼을 클릭하여 현재 세팅(채널, 폴더, API 키)을 링크로 복사
- **폴더 관리**: 드래그 앤 드롭으로 채널 이동 및 관리
