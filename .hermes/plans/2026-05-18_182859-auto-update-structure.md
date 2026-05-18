# Toodly 자동 업데이트 구조 계획

> **For Hermes:** 형님 승인 전 구현 금지. 승인 후 최소 범위로 진행.

**Goal:** 설치된 Toodly 앱이 새 버전을 감지하고 안전하게 업데이트할 수 있는 구조를 잡는다.

**Architecture:** Electron 앱 패키징 이후 `electron-updater` 기반으로 업데이트 체크/다운로드/재시작 적용 흐름을 둔다. 배포 채널은 우선 GitHub Releases 기준으로 설계하되, 실제 릴리스 자동화는 패키징 이후 별도 단계로 둔다.

**Tech Stack:** Electron, Vite React, electron-builder, electron-updater, GitHub Releases

---

## 현재 전제

- 현재 앱은 `apps/desktop`의 Electron + Vite 구조다.
- 아직 패키징 설정이 명확히 잡히지 않았다.
- 자동 업데이트는 4번 패키징과 강하게 연결된다.
- 따라서 5번은 바로 완성 구현보다, 업데이트 가능한 앱 구조를 먼저 잡는 게 맞다.

## 제안 구조

### 1. 패키징 도구 기준 확정

- `electron-builder` 사용
- 이유:
  - `.dmg`, `.exe` 모두 지원
  - `electron-updater`와 바로 연결 가능
  - GitHub Releases 배포가 단순함

### 2. 업데이트 흐름

앱 시작 후:

1. 앱 실행
2. 프로덕션 빌드인지 확인
3. 업데이트 서버/GitHub Releases 확인
4. 새 버전 있으면 백그라운드 다운로드
5. 다운로드 완료 시 UI에 “업데이트 재시작” 표시
6. 사용자가 누르면 `quitAndInstall()` 실행

개발 모드에서는 업데이트 체크 안 함.

### 3. 메인 프로세스 책임

`apps/desktop/electron/main.cjs`

- `electron-updater` 초기화
- 업데이트 체크 시작
- 업데이트 상태 이벤트 수신
- renderer로 상태 전달
- renderer 요청 시 재시작 업데이트 실행

예상 IPC:

- `toodly:update-check`
- `toodly:update-install`
- `toodly:update-status`

### 4. 프리로드 책임

`apps/desktop/electron/preload.cjs`

- renderer에 안전 API 노출

예상 API:

```js
window.toodly.checkForUpdates()
window.toodly.installUpdate()
window.toodly.onUpdateStatus(callback)
```

### 5. UI 책임

`apps/desktop/src/App.tsx`

- 업데이트 상태 표시만 최소 추가
- 예시 상태:
  - 확인 중
  - 최신 버전
  - 다운로드 중
  - 설치 준비 완료
  - 실패

초기 구현은 설정 화면 없이, 메인 화면 하단/상단의 작은 알림 카드 정도로 충분.

### 6. package 설정

`apps/desktop/package.json`

추가 후보:

- `electron-builder`
- `electron-updater`

스크립트 후보:

- `dist:mac`
- `dist:win`
- `dist`

build 설정 후보:

- `appId`: `com.toodly.app`
- `productName`: `Toodly`
- `publish`: GitHub Releases
- `protocols`: `toodly://`

### 7. 지금 바로 하지 않을 것

- GitHub Actions 릴리스 자동화
- 코드 서명/공증
- Windows 인증서 서명
- staged rollout
- delta update 세부 튜닝
- Google Calendar 연동

이건 오버엔지니어링이라 이후 패키징/배포 단계에서 처리.

## 구현 순서

### Task 1: 패키징/업데이트 의존성 추가

**Files:**
- Modify: `apps/desktop/package.json`

**내용:**
- `electron-builder`, `electron-updater` 추가
- dist 스크립트 추가
- 기본 build 설정 추가

### Task 2: 메인 프로세스 업데이트 서비스 추가

**Files:**
- Modify: `apps/desktop/electron/main.cjs`

**내용:**
- `autoUpdater` import
- 개발 모드에서는 비활성화
- 업데이트 상태 broadcast 함수 추가
- `checkForUpdatesAndNotify()` 연결
- `quitAndInstall()` IPC 추가

### Task 3: preload API 추가

**Files:**
- Modify: `apps/desktop/electron/preload.cjs`

**내용:**
- update check/install/status API 노출

### Task 4: 최소 UI 알림 추가

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- 필요 시 Modify: `apps/desktop/src/styles.css`

**내용:**
- 업데이트 상태 카드 추가
- 설치 준비 완료 상태에서만 재시작 버튼 표시

### Task 5: 검증

**Commands:**

```bash
pnpm --filter @toodly/desktop build
pnpm --filter @toodly/desktop exec electron-builder --dir
```

**Expected:**
- TypeScript/Vite build 통과
- Electron 패키지 디렉터리 생성 성공

## 리스크

- 실제 자동 업데이트는 GitHub Releases에 배포 파일이 있어야 완전 검증 가능하다.
- macOS 자동 업데이트는 실사용 배포 단계에서 코드 서명/공증 이슈가 생길 수 있다.
- Windows도 서명 없으면 보안 경고가 뜰 수 있다.

## 결론

지금은 “자동 업데이트가 붙을 수 있는 구조”까지만 잡고, 실제 릴리스/서명/공증은 패키징 단계 이후로 미루는 게 적절하다.
