import { useUpdateStatus } from '../hooks/useUpdateStatus';

export function UpdateNotice() {
  const { status, check, install } = useUpdateStatus();
  const busy = status.state === 'checking' || status.state === 'downloading' || status.state === 'installing';
  const showInstall = status.state === 'ready';
  return <div className={`update-notice ${status.state}`}><div><strong>앱 업데이트</strong><span>{status.message}{status.version ? ` · v${status.version}` : ''}</span></div>{showInstall ? <button className="primary-btn compact" onClick={install} type="button">재시작 후 업데이트</button> : <button className="ghost-btn" disabled={busy} onClick={check} type="button">{busy ? '처리중' : '업데이트 확인'}</button>}</div>;
}
