import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../types';

export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle', message: '업데이트 확인 전' });

  useEffect(() => {
    void window.toodly?.getUpdateStatus().then(setStatus).catch(() => undefined);
    return window.toodly?.onUpdateStatus(setStatus);
  }, []);

  const check = async () => {
    const next = await window.toodly?.checkForUpdates().catch(() => ({ state: 'error', message: '업데이트 확인에 실패했습니다.' } as UpdateStatus));
    if (next) setStatus(next);
  };

  const install = async () => {
    const next = await window.toodly?.installUpdate().catch(() => ({ state: 'error', message: '업데이트 설치에 실패했습니다.' } as UpdateStatus));
    if (next) setStatus(next);
  };

  return { status, check, install };
}
