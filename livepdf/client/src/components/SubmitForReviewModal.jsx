import { useState, useEffect } from 'react';

export default function SubmitForReviewModal({
  isOpen,
  onClose,
  docId,
  docTitle,
  onSubmitted,
}) {
  const [candidates, setCandidates] = useState([]);
  const [selectedReviewerIds, setSelectedReviewerIds] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && docId) {
      fetchCandidates();
    }
  }, [isOpen, docId]);

  async function fetchCandidates() {
    setFetchingUsers(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${docId}/comments/users-for-mention`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (res.ok) setCandidates(data || []);
    } catch (err) {
      console.error('Failed to load review candidates:', err);
    } finally {
      setFetchingUsers(false);
    }
  }

  if (!isOpen) return null;

  function toggleReviewer(userId) {
    if (selectedReviewerIds.includes(userId)) {
      setSelectedReviewerIds(selectedReviewerIds.filter(id => id !== userId));
    } else {
      setSelectedReviewerIds([...selectedReviewerIds, userId]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (selectedReviewerIds.length === 0) {
      setError('Please select at least one reviewer.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${docId}/approval/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          reviewerIds: selectedReviewerIds,
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit document for review');

      if (onSubmitted) onSubmitted(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
          width: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            Submit "{docTitle}" for Approval
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Select Required Reviewers
            </label>
            
            {fetchingUsers ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>Loading eligible reviewers...</div>
            ) : candidates.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                No external recipients or team members found. Share the document with users via Private Link or Team Org first to designate reviewers.
              </div>
            ) : (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', maxHeight: '180px', overflowY: 'auto', padding: '8px' }}>
                {candidates.map(candidate => (
                  <label
                    key={candidate.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedReviewerIds.includes(candidate.id)}
                      onChange={() => toggleReviewer(candidate.id)}
                      style={{ accentColor: '#2563eb' }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{candidate.fullName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{candidate.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Optional Instructions / Notes
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Explain key areas reviewers should check..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedReviewerIds.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {loading ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
