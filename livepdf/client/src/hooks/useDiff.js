import { useState, useEffect } from 'react';

export default function useDiff(socket, initialDiff = null) {
  const [changeMap, setChangeMap] = useState([]);
  const [diffStats, setDiffStats] = useState(null);
  const [diffReady, setDiffReady] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Load initial diff if provided (e.g., from page load REST request)
  useEffect(() => {
    if (initialDiff) {
      setChangeMap(initialDiff.changeMap || initialDiff.change_map || []);
      setDiffStats({
        total: initialDiff.totalChanges || initialDiff.total_changes || 0,
        added: initialDiff.addedCount || initialDiff.added_count || 0,
        removed: initialDiff.removedCount || initialDiff.removed_count || 0,
        modified: initialDiff.modifiedCount || initialDiff.modified_count || 0,
      });
      setDiffReady(true);
      setSummary(initialDiff.summary || null);
      // If diff is ready but there is no summary yet, show loading skeleton
      setSummaryLoading(!initialDiff.summary);
    } else {
      setChangeMap([]);
      setDiffStats(null);
      setDiffReady(false);
      setSummary(null);
      setSummaryLoading(false);
    }
  }, [initialDiff]);

  useEffect(() => {
    if (!socket) return;

    const handleDiffReady = (payload) => {
      setChangeMap(payload.changeMap);
      setDiffStats({
        total: payload.totalChanges,
        added: payload.addedCount,
        removed: payload.removedCount,
        modified: payload.modifiedCount,
      });
      setDiffReady(true);
      setSummaryLoading(true); // AI summary begins generating
      setSummary(null);
    };

    const handleDiffUpdated = (payload) => {
      if (payload.changeMap) {
        setChangeMap(payload.changeMap);
      }
      setSummary(payload.summary || null);
      setSummaryLoading(false);
    };

    socket.on('diff:ready', handleDiffReady);
    socket.on('diff:updated', handleDiffUpdated);

    return () => {
      socket.off('diff:ready', handleDiffReady);
      socket.off('diff:updated', handleDiffUpdated);
    };
  }, [socket]);

  // Filter changes for a specific page
  function getChangesForPage(pageIndex) {
    return changeMap.filter(c => c.page === pageIndex);
  }

  return {
    changeMap,
    diffStats,
    diffReady,
    summary,
    summaryLoading,
    getChangesForPage,
    setChangeMap,
    setDiffStats,
    setDiffReady,
    setSummary,
    setSummaryLoading,
  };
}
