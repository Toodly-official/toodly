const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let autoUpdater;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = undefined;
}

let pinWindow;
let mainWindow;
let pinAlwaysOnTop = true;
let db;
let useSqlite = false;
let memoryToken;
let pendingAuthWindow;
let oauthState;
let updateStatus = { state: 'idle', message: '업데이트 확인 전' };

const isDev = !app.isPackaged;
const AI_SERVICE = 'Toodly AI';
const AI_ACCOUNT = 'oauth-token';
const PROTOCOL = 'toodly';

const initialData = {
  todos: [],
  tags: ['기획', '기술검토', '기록', '회의', '회사', '회고', '휴일', 'TODO'],
  ai: { auth: { connected: false }, summaries: {} },
};

function getKeytar() {
  try {
    return require('keytar');
  } catch {
    return undefined;
  }
}

async function saveToken(tokenPayload) {
  const serialized = typeof tokenPayload === 'string' ? tokenPayload : JSON.stringify(tokenPayload);
  const keytar = getKeytar();
  if (keytar) {
    await keytar.setPassword(AI_SERVICE, AI_ACCOUNT, serialized);
    return 'secure-storage';
  }
  memoryToken = serialized;
  return 'memory-dev-fallback';
}

async function getTokenPayload() {
  const keytar = getKeytar();
  const raw = keytar ? await keytar.getPassword(AI_SERVICE, AI_ACCOUNT) : memoryToken;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return { access_token: raw, provider: 'unknown' };
  }
}

async function clearToken() {
  const keytar = getKeytar();
  if (keytar) await keytar.deletePassword(AI_SERVICE, AI_ACCOUNT);
  memoryToken = undefined;
}

async function hasToken() {
  return Boolean(await getTokenPayload());
}

function normalizeTodo(todo) {
  const startDate = todo?.startDate ?? todo?.createdAt ?? new Date().toISOString().slice(0, 10);
  return {
    id: todo?.id ?? Date.now(),
    title: todo?.title ?? '',
    done: Boolean(todo?.done),
    startDate,
    ...(todo?.endDate ? { endDate: todo.endDate } : {}),
    status: todo?.status ?? (todo?.done ? 'ended' : 'active'),
    ...(todo?.completedAt ? { completedAt: todo.completedAt } : {}),
    ...(todo?.tag ? { tag: todo.tag } : {}),
    ...(todo?.memo ? { memo: todo.memo } : {}),
  };
}

function normalizeData(data) {
  const todos = (data?.todos ?? initialData.todos).map(normalizeTodo);
  return {
    todos,
    tags: data?.tags ?? initialData.tags,
    ai: {
      auth: data?.ai?.auth ?? { connected: false },
      summaries: data?.ai?.summaries ?? {},
    },
  };
}

function getAuthCache(data = loadData()) {
  return data.ai?.auth ?? { connected: false };
}

async function updateAuthCache(auth) {
  const data = normalizeData(loadData());
  return saveData({ ...data, ai: { ...data.ai, auth } });
}

function buildMockSummary(range, payload) {
  const done = payload?.doneGroups ?? [];
  const next = payload?.nextGroups ?? [];
  return {
    id: `${range}-${Date.now()}`,
    range,
    provider: 'local',
    createdAt: new Date().toISOString(),
    doneLines: done.length ? done.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 정리했습니다.`) : ['완료된 작업이 없습니다.'],
    nextLines: next.length ? next.map((group) => `${group.tag}: ${group.tasks.join(', ')} 작업을 이어갑니다.`) : ['예정 작업이 없습니다.'],
  };
}

function buildAiPrompt(range, payload) {
  return [
    'Toodly 작업내역을 한국어로 짧게 정리해줘.',
    '반드시 JSON만 반환해. 형식: {"doneLines":["..."],"nextLines":["..."]}',
    `범위: ${range}`,
    `완료 작업: ${JSON.stringify(payload?.doneGroups ?? [])}`,
    `예정 작업: ${JSON.stringify(payload?.nextGroups ?? [])}`,
  ].join('\n');
}

async function callAiProvider(range, payload) {
  const tokenPayload = await getTokenPayload();
  const apiKey = tokenPayload?.access_token || process.env.TOODLY_AI_API_KEY;
  if (!apiKey) return buildMockSummary(range, payload);

  const apiUrl = process.env.TOODLY_AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.TOODLY_AI_MODEL || 'gpt-4o-mini';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You summarize task logs into concise Korean bullet lines.' },
        { role: 'user', content: buildAiPrompt(range, payload) },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) throw new Error(`AI provider failed: ${response.status}`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content.replace(/^```json\s*|```$/g, '').trim());
  return {
    id: `${range}-${Date.now()}`,
    range,
    provider: tokenPayload?.provider || process.env.TOODLY_AI_PROVIDER || 'openai-compatible',
    createdAt: new Date().toISOString(),
    doneLines: Array.isArray(parsed.doneLines) ? parsed.doneLines : buildMockSummary(range, payload).doneLines,
    nextLines: Array.isArray(parsed.nextLines) ? parsed.nextLines : buildMockSummary(range, payload).nextLines,
  };
}

function buildOAuthUrl() {
  const authUrl = process.env.TOODLY_OAUTH_AUTH_URL;
  const clientId = process.env.TOODLY_OAUTH_CLIENT_ID;
  const redirectUri = process.env.TOODLY_OAUTH_REDIRECT_URI || `${PROTOCOL}://auth/callback`;
  if (!authUrl || !clientId) return undefined;
  oauthState = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const url = new URL(authUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', oauthState);
  const scope = process.env.TOODLY_OAUTH_SCOPE;
  if (scope) url.searchParams.set('scope', scope);
  return url.toString();
}

async function exchangeOAuthCode(code) {
  const tokenUrl = process.env.TOODLY_OAUTH_TOKEN_URL;
  const clientId = process.env.TOODLY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TOODLY_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.TOODLY_OAUTH_REDIRECT_URI || `${PROTOCOL}://auth/callback`;
  if (!tokenUrl || !clientId) {
    return { access_token: `mock-${code}`, provider: 'mock', expires_at: 'mock-session' };
  }
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri });
  if (clientSecret) body.set('client_secret', clientSecret);
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`OAuth token exchange failed: ${response.status}`);
  return { ...(await response.json()), provider: process.env.TOODLY_AI_PROVIDER || 'oauth' };
}

function safeAuthFromToken(tokenPayload, storage) {
  return {
    connected: true,
    provider: tokenPayload.provider || process.env.TOODLY_AI_PROVIDER || 'oauth',
    expiresAt: tokenPayload.expires_at || tokenPayload.expiresAt || 'session',
    storage,
  };
}

async function completeLoginFromCode(code) {
  const tokenPayload = await exchangeOAuthCode(code);
  const storage = await saveToken(tokenPayload);
  const auth = safeAuthFromToken(tokenPayload, storage);
  await updateAuthCache(auth);
  if (pendingAuthWindow && !pendingAuthWindow.isDestroyed()) pendingAuthWindow.focus();
  pendingAuthWindow = undefined;
  return auth;
}

async function handleToodlyUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== `${PROTOCOL}:` || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') return;
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    if (oauthState && state && state !== oauthState) throw new Error('OAuth state mismatch');
    if (code) await completeLoginFromCode(code);
  } catch (error) {
    const auth = { connected: false, error: 'OAuth 로그인 실패' };
    await updateAuthCache(auth);
  }
}

function dataPath() {
  return path.join(app.getPath('userData'), 'toodly.sqlite');
}

function jsonFallbackPath() {
  return path.join(app.getPath('userData'), 'toodly-data.json');
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(name, defaults) {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    return { ...defaults, ...(state[name] ?? {}) };
  } catch {
    return defaults;
  }
}

function saveWindowState(name, window) {
  try {
    const previous = fs.existsSync(windowStatePath()) ? JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')) : {};
    fs.writeFileSync(windowStatePath(), JSON.stringify({ ...previous, [name]: window.getBounds() }, null, 2));
  } catch {
    // ignore window-state write failures
  }
}

function setupStore() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dataPath());
    useSqlite = true;
    createSchema();
    migrateLegacyStateIfNeeded();
  } catch (error) {
    useSqlite = false;
    if (!fs.existsSync(jsonFallbackPath())) {
      fs.writeFileSync(jsonFallbackPath(), JSON.stringify(initialData, null, 2));
    }
  }
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      status TEXT,
      completed_at TEXT,
      tag TEXT,
      memo TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todos_done_created_at ON todos(done, created_at);
    CREATE INDEX IF NOT EXISTS idx_todos_tag ON todos(tag);
    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_auth_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      connected INTEGER NOT NULL DEFAULT 0,
      provider TEXT,
      expires_at TEXT,
      storage TEXT,
      pending INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_summaries (
      id TEXT PRIMARY KEY,
      range TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      done_lines TEXT NOT NULL,
      next_lines TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_summaries_range_created_at ON ai_summaries(range, created_at);
  `);
  ensureTodoColumns();
}

function tableExists(name) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function legacyScheduleDataToTodos(schedules = []) {
  return schedules.map((item) => ({
    id: item.id + 100_000,
    title: item.title,
    done: Boolean(item.done),
    startDate: item.scheduledAt ?? item.scheduled_at,
    ...(item.endedAt || item.endDate ? { endDate: item.endedAt ?? item.endDate } : {}),
    status: item.status ?? (item.endedAt || item.endDate ? 'ended' : 'active'),
    ...(item.completedAt ? { completedAt: item.completedAt } : {}),
    ...(item.tag ? { tag: item.tag } : {}),
    ...(item.memo ? { memo: item.memo } : {}),
  })).filter((item) => item.title && item.startDate);
}

function loadLegacyScheduleTodos() {
  if (!tableExists('schedules')) return [];
  return db.prepare('SELECT id, scheduled_at, title, memo, tag FROM schedules ORDER BY scheduled_at, id').all()
    .map((row) => ({
      id: row.id + 100_000,
      title: row.title,
      done: false,
      startDate: row.scheduled_at,
      status: 'active',
      ...(row.tag ? { tag: row.tag } : {}),
      ...(row.memo ? { memo: row.memo } : {}),
    }));
}

function ensureTodoColumns() {
  const columns = new Set(db.prepare('PRAGMA table_info(todos)').all().map((column) => column.name));
  const missing = [
    ['start_date', 'TEXT'],
    ['end_date', 'TEXT'],
    ['status', 'TEXT'],
    ['memo', 'TEXT'],
  ].filter(([name]) => !columns.has(name));
  for (const [name, type] of missing) {
    db.exec(`ALTER TABLE todos ADD COLUMN ${name} ${type}`);
  }
}

function migrateLegacyStateIfNeeded() {
  const version = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('storage_version')?.value;
  if (version === '3') return;

  const legacy = db.prepare('SELECT value FROM app_state WHERE key = ?').get('state');
  const legacyValue = legacy ? JSON.parse(legacy.value) : undefined;
  const hasRows = db.prepare('SELECT COUNT(*) AS count FROM todos').get().count > 0
    || (tableExists('schedules') && db.prepare('SELECT COUNT(*) AS count FROM schedules').get().count > 0)
    || db.prepare('SELECT COUNT(*) AS count FROM tags').get().count > 0;
  const source = legacyValue ? normalizeData(legacyValue) : (hasRows ? loadData() : initialData);
  const convertedTodos = [
    ...legacyScheduleDataToTodos(legacyValue?.schedules),
    ...loadLegacyScheduleTodos(),
  ];
  const existingIds = new Set(source.todos.map((todo) => todo.id));
  const todos = [...source.todos, ...convertedTodos.filter((todo) => !existingIds.has(todo.id)).map(normalizeTodo)];
  saveData({ ...source, todos }, false);
  if (tableExists('schedules')) db.exec('DROP TABLE schedules');
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run('storage_version', '3');
}

function loadData() {
  if (useSqlite) return loadSqliteData();
  return normalizeData(JSON.parse(fs.readFileSync(jsonFallbackPath(), 'utf8')));
}

function loadSqliteData() {
  const todos = db.prepare('SELECT id, title, done, created_at, start_date, end_date, status, completed_at, tag, memo FROM todos ORDER BY COALESCE(start_date, created_at) DESC, id DESC').all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      done: Boolean(row.done),
      startDate: row.start_date ?? row.created_at,
      ...(row.end_date ? { endDate: row.end_date } : {}),
      status: row.status ?? (row.done ? 'ended' : 'active'),
      ...(row.completed_at ? { completedAt: row.completed_at } : {}),
      ...(row.tag ? { tag: row.tag } : {}),
      ...(row.memo ? { memo: row.memo } : {}),
    }));
  const tags = db.prepare('SELECT name FROM tags ORDER BY name').all().map((row) => row.name);
  const authRow = db.prepare('SELECT connected, provider, expires_at, storage, pending, error FROM ai_auth_cache WHERE id = 1').get();
  const summaryRows = db.prepare('SELECT id, range, provider, created_at, done_lines, next_lines FROM ai_summaries ORDER BY created_at DESC').all();
  const summaries = summaryRows.reduce((acc, row) => ({
    ...acc,
    [row.range]: {
      id: row.id,
      range: row.range,
      provider: row.provider,
      createdAt: row.created_at,
      doneLines: JSON.parse(row.done_lines),
      nextLines: JSON.parse(row.next_lines),
    },
  }), {});

  return normalizeData({
    todos,
    tags,
    ai: {
      auth: authRow ? {
        connected: Boolean(authRow.connected),
        ...(authRow.provider ? { provider: authRow.provider } : {}),
        ...(authRow.expires_at ? { expiresAt: authRow.expires_at } : {}),
        ...(authRow.storage ? { storage: authRow.storage } : {}),
        ...(authRow.pending ? { pending: Boolean(authRow.pending) } : {}),
        ...(authRow.error ? { error: authRow.error } : {}),
      } : { connected: false },
      summaries,
    },
  });
}

function saveData(data, notify = true) {
  data = normalizeData(data);
  if (useSqlite) {
    saveSqliteData(data);
  } else {
    fs.writeFileSync(jsonFallbackPath(), JSON.stringify(data, null, 2));
  }

  if (notify) broadcastData(data);
  return data;
}

function saveSqliteData(data) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM todos; DELETE FROM tags; DELETE FROM ai_auth_cache; DELETE FROM ai_summaries;');

    const insertTodo = db.prepare('INSERT INTO todos (id, title, done, created_at, start_date, end_date, status, completed_at, tag, memo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const todo of data.todos) {
      insertTodo.run(
        todo.id,
        todo.title,
        todo.done ? 1 : 0,
        todo.startDate,
        todo.startDate,
        todo.endDate ?? null,
        todo.status ?? (todo.done ? 'ended' : 'active'),
        todo.completedAt ?? null,
        todo.tag ?? null,
        todo.memo ?? null,
      );
    }

    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)');
    const tagNames = new Set([...data.tags, ...data.todos.map((todo) => todo.tag)].filter(Boolean));
    for (const tag of tagNames) insertTag.run(tag, new Date().toISOString());

    const auth = data.ai?.auth ?? { connected: false };
    db.prepare('INSERT INTO ai_auth_cache (id, connected, provider, expires_at, storage, pending, error) VALUES (1, ?, ?, ?, ?, ?, ?)')
      .run(auth.connected ? 1 : 0, auth.provider ?? null, auth.expiresAt ?? null, auth.storage ?? null, auth.pending ? 1 : 0, auth.error ?? null);

    const insertSummary = db.prepare('INSERT INTO ai_summaries (id, range, provider, created_at, done_lines, next_lines) VALUES (?, ?, ?, ?, ?, ?)');
    for (const summary of Object.values(data.ai?.summaries ?? {})) {
      if (!summary) continue;
      insertSummary.run(summary.id, summary.range, summary.provider, summary.createdAt, JSON.stringify(summary.doneLines), JSON.stringify(summary.nextLines));
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function broadcastData(data) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send('toodly:data-updated', data);
  });
}

function setUpdateStatus(nextStatus) {
  updateStatus = { ...updateStatus, ...nextStatus };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send('toodly:update-status', updateStatus);
  });
  return updateStatus;
}

function setupAutoUpdater() {
  if (isDev) {
    setUpdateStatus({ state: 'disabled', message: '개발 모드에서는 업데이트를 확인하지 않습니다.' });
    return;
  }
  if (!autoUpdater) {
    setUpdateStatus({ state: 'error', message: '업데이트 모듈을 사용할 수 없습니다.' });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => setUpdateStatus({ state: 'checking', message: '업데이트 확인 중' }));
  autoUpdater.on('update-available', (info) => setUpdateStatus({ state: 'available', message: `새 버전 ${info.version ?? ''} 다운로드 중`.trim(), version: info.version }));
  autoUpdater.on('update-not-available', (info) => setUpdateStatus({ state: 'latest', message: '최신 버전입니다.', version: info.version }));
  autoUpdater.on('download-progress', (progress) => setUpdateStatus({ state: 'downloading', message: `업데이트 다운로드 중 ${Math.round(progress.percent)}%`, progress: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', (info) => setUpdateStatus({ state: 'ready', message: '업데이트 설치 준비 완료', version: info.version, progress: 100 }));
  autoUpdater.on('error', () => setUpdateStatus({ state: 'error', message: '업데이트 확인에 실패했습니다.' }));
}

async function checkForUpdates() {
  if (isDev) return setUpdateStatus({ state: 'disabled', message: '개발 모드에서는 업데이트를 확인하지 않습니다.' });
  if (!autoUpdater) return setUpdateStatus({ state: 'error', message: '업데이트 모듈을 사용할 수 없습니다.' });
  setUpdateStatus({ state: 'checking', message: '업데이트 확인 중' });
  await autoUpdater.checkForUpdatesAndNotify();
  return updateStatus;
}

function installUpdate() {
  if (!autoUpdater || updateStatus.state !== 'ready') return updateStatus;
  autoUpdater.quitAndInstall(false, true);
  return setUpdateStatus({ state: 'installing', message: '업데이트 설치 중' });
}

function loadWindow(window, view) {
  if (isDev) {
    window.loadURL(`http://127.0.0.1:5173/?window=${view}`);
    return;
  }

  window.loadFile(path.join(__dirname, '../dist/index.html'), {
    query: { window: view },
  });
}

function createPinWindow() {
  const bounds = loadWindowState('pin', { width: 380, height: 780 });
  pinWindow = new BrowserWindow({
    ...bounds,
    minWidth: 340,
    minHeight: 620,
    resizable: true,
    alwaysOnTop: pinAlwaysOnTop,
    title: 'Toodly Pin',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  pinWindow.on('close', () => saveWindowState('pin', pinWindow));
  loadWindow(pinWindow, 'pin');
}

function setPinAlwaysOnTop(enabled) {
  pinAlwaysOnTop = Boolean(enabled);
  if (pinWindow && !pinWindow.isDestroyed()) pinWindow.setAlwaysOnTop(pinAlwaysOnTop);
  return pinAlwaysOnTop;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  const bounds = loadWindowState('main', { width: 1280, height: 900 });
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 720,
    title: 'Toodly',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 22, y: 20 },
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadWindow(mainWindow, 'main');
  mainWindow.on('close', () => saveWindowState('main', mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });

  return mainWindow;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', (_event, argv) => {
  const protocolUrl = argv.find((value) => value.startsWith(`${PROTOCOL}://`));
  if (protocolUrl) void handleToodlyUrl(protocolUrl);
  createMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  void handleToodlyUrl(url);
});

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(PROTOCOL);
  setupStore();
  setupAutoUpdater();
  createPinWindow();
  void checkForUpdates().catch(() => setUpdateStatus({ state: 'error', message: '업데이트 확인에 실패했습니다.' }));

  ipcMain.handle('open-main-window', () => {
    createMainWindow();
    return true;
  });

  ipcMain.handle('toodly:get-pin-always-on-top', () => pinAlwaysOnTop);
  ipcMain.handle('toodly:set-pin-always-on-top', (_event, enabled) => setPinAlwaysOnTop(enabled));

  ipcMain.handle('toodly:get-data', () => loadData());
  ipcMain.handle('toodly:set-data', (_event, data) => saveData(data));
  ipcMain.handle('toodly:get-update-status', () => updateStatus);
  ipcMain.handle('toodly:check-for-updates', () => checkForUpdates());
  ipcMain.handle('toodly:install-update', () => installUpdate());
  ipcMain.handle('toodly:get-auth', async () => ({ ...getAuthCache(), connected: await hasToken() }));
  ipcMain.handle('toodly:login-ai', async () => {
    pendingAuthWindow = createMainWindow();
    const oauthUrl = buildOAuthUrl();
    if (oauthUrl) {
      await shell.openExternal(oauthUrl);
      return { connected: false, provider: 'oauth', pending: true };
    }
    return completeLoginFromCode('mock-code');
  });
  ipcMain.handle('toodly:logout-ai', async () => {
    await clearToken();
    const auth = { connected: false };
    await updateAuthCache(auth);
    return auth;
  });
  ipcMain.handle('toodly:summarize-ai', async (_event, range, payload) => {
    const data = normalizeData(loadData());
    let summary;
    try {
      summary = await callAiProvider(range, payload);
    } catch {
      summary = buildMockSummary(range, payload);
    }
    const next = { ...data, ai: { ...data.ai, summaries: { ...data.ai.summaries, [range]: summary } } };
    saveData(next);
    return summary;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPinWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
