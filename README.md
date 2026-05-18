# Toodly

## 기술 스택 사전 체크

Toodly는 Electron 데스크톱 앱과 공식 웹사이트를 함께 관리하는 monorepo 구조로 시작한다.

### 최종 추천 스택

- 런타임: Node.js 22 LTS
- 패키지 매니저: pnpm 11
- 언어: TypeScript 6
- Monorepo: pnpm workspace
- Desktop: Electron 42, electron-vite 5, Vite 7, React 19
- Web: Next.js 16, React 19
- Styling: Tailwind CSS 4
- 상태 관리: Zustand 5
- 로컬 DB: SQLite, better-sqlite3
- ORM: Drizzle ORM
- 테스트: Vitest, Playwright
- 포맷/린트: Biome 2

### 확인 결과

현재 기준으로 아래 주요 패키지에서 deprecated 표시는 확인되지 않았다.

- Electron
- Vite
- React
- TypeScript
- Tailwind CSS
- Zustand
- Drizzle ORM
- better-sqlite3
- Vitest
- Playwright
- Next.js
- Biome
- pnpm

### 주의사항

- Electron 최신 버전은 Node.js 22.12 이상을 요구하므로 Node.js 22 LTS 이상으로 맞춘다.
- electron-vite 5의 Vite peer dependency는 `^5 || ^6 || ^7`이므로 Vite는 7.x로 고정한다.
- better-sqlite3는 Electron 패키징 시 native module rebuild 이슈가 생길 수 있으므로 electron-builder 설정에서 고려한다.
- Tailwind CSS 4는 v3와 설정 방식이 다르므로 v4 기준으로 구성한다.
- React 19와 Next.js 16 조합은 peer dependency 기준 문제 없다.

### 현재 판단

기존 추천 스택은 유지하되, Vite는 8 대신 7로 고정한다.
가장 주의할 부분은 Electron과 better-sqlite3 조합의 패키징/rebuild 이슈다.
