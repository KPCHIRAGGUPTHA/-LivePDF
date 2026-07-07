import { useEffect, useCallback } from 'react';
import api from '../utils/api';

const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes

export default function useSignedUrlRefresh({ token, active, onRefresh }) {
  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      const res = await api.get(`/share/${token}`);
      if (res.data.signedUrl) {
        onRefresh(res.data.signedUrl);
      }
    } catch {
      // Signed URL refresh failed
    }
  }, [token, active, onRefresh]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, active]);
}
