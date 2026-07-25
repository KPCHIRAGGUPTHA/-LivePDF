import { useState, useEffect } from 'react';

export default function ApprovalHistoryModal({
  isOpen,
  onClose,
  docId,
  docTitle,
}) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && docId) {
      fetchHistory();
    }
  }, [isOpen, docId]);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${docId}/approval/history`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load approval history');
      setHistory(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const statusBadges = {
    'Approved': { bg: '#dcfce7', text: '#15803d' },
    'Rejected': { bg: '#fee2e2', text: '#b91c1c' },
    'Changes Requested': { bg: '#fef3c7', text: '#b45309' },
    'Pending Review': { bg: '#dbeafe', text: '#1d4ed8' },
    'Draft': { bg: '#f1f5f9', text: '#475569' },
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Approval History
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b' }}>"{docTitle}"</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>Loading history...</div>
        ) : error ? (
          <div style={{ color: '#dc2626', fontSize: '13px', padding: '12px' }}>{error}</div>
        ) : !history || !history.rounds || history.rounds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>
            No approval review rounds have been submitted for this document yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {history.rounds.map(round => (
              <div key={round.round} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', backgroundColor: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                    Round {round.round} (Version {round.versionNumber})
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {round.reviewers.map(r => {
                    const badge = statusBadges[r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : r.status === 'changes_requested' ? 'Changes Requested' : 'Pending Review'];
                    return (
                      <div key={r.id} style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>{r.reviewerName}</span>
                            <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>({r.reviewerEmail})</span>
                          </div>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: badge.bg, color: badge.text, textTransform: 'uppercase' }}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </div>
                        {r.feedback && (
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', fontStyle: 'italic', backgroundColor: '#f1f5f9', padding: '6px 8px', borderRadius: '4px' }}>
                            "{r.feedback}"
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', textAlign: 'right' }}>
                          {new Date(r.updatedAt || r.createdAt).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
