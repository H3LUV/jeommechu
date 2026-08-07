# 점메추

현재 위치 반경 1km의 실제 식당을 추천하고, 개인·팀 점심 결정을 돕는 웹/안드로이드 서비스입니다.

## 구성

- `src/` Cloudflare Worker API 및 팀 방 Durable Object
- `public/` 웹 프런트엔드
- `android/` Android WebView APK 빌드 소스
- `.github/workflows/` CI 및 APK 빌드
- `wrangler.jsonc` Cloudflare Workers 설정

## 개발

```bash
npm install
npm run check
npm run dev
```

배포 시 Cloudflare Worker에 `KAKAO_REST_API_KEY` secret이 필요합니다.
