import { useState } from 'react';
import type { AiAuth, ToodlyData, UpdateData } from '../types';

export function AiControl({ data, updateData }: { data: ToodlyData; updateData: UpdateData }) {
  const auth = data.ai?.auth ?? { connected: false };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = (nextAuth: AiAuth) => updateData((current) => ({ ...current, ai: { auth: nextAuth, summaries: current.ai?.summaries ?? {} } }));
  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const fallback = { connected: true, provider: 'mock', storage: 'browser-preview' };
      const nextAuth = window.toodly ? await window.toodly.loginAi().catch(() => fallback) : fallback;
      setAuth(nextAuth);
    } catch {
      setError('AI 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    setLoading(true);
    setError('');
    try {
      const fallback = { connected: false };
      const nextAuth = window.toodly ? await window.toodly.logoutAi().catch(() => fallback) : fallback;
      setAuth(nextAuth);
    } catch {
      setError('로그아웃에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const status = auth.pending ? 'OAuth 로그인 대기중' : auth.connected ? 'AI 연결됨' : 'AI 미연결';
  const detail = error || auth.error || (auth.connected ? `${auth.provider ?? 'AI'} · ${auth.storage ?? 'secure-storage'}` : '로그인 없이도 기본 정리는 표시됩니다.');
  return <div className="ai-control"><div><strong>{status}</strong><span className={error || auth.error ? 'error-text' : ''}>{detail}</span></div><button className={auth.connected ? 'ghost-btn' : 'primary-btn compact'} disabled={loading || auth.pending} onClick={auth.connected ? logout : login} type="button">{loading ? '처리중' : auth.connected ? '로그아웃' : 'AI 로그인'}</button></div>;
}
