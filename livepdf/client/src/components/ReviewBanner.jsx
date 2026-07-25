import { useState } from 'react';

export default function ReviewBanner({
  docId,
  approvalStatus,
  approvalHistory = [],
  currentUser,
  onDecisionSubmitted,
}) {
  const [showModal, setShowModal] = useState(false);
  const [activeDecision, setActiveDecision] = useState(null); // 'rejected' | 'changes_requested'
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!approvalStatus || approvalStatus === 'Draft') return null;

  // Get current active round (latest round)
  const latestRoundNumber = approvalHistory.length > 0
    ? Math.max(...approvalHistory.map(r => r.round))
    : 1;

  const currentRound = approvalHistory.find(r => r.round === latestRoundNumber) || { reviewers: [] };
  const reviewers = currentRound.reviewers || [];
  
  const approvedCount = reviewers.filter(r => r.status === 'approved').length;
  const totalCount = reviewers.length;

  // Check if current user is an assigned reviewer in this round who hasn't submitted yet
  const userReviewRecord = currentUser
    ? reviewers.find(r => r.reviewerId === currentUser.id)
    : null;

  const isPendingReviewer = userReviewRecord && userReviewRecord.status === 'pending';

  async function handleAction(decision, customFeedback = null) {
    if ((decision === 'rejected' || decision === 'changes_requested') && (!customFeedback || !customFeedback.trim())) {
      setActiveDecision(decision);
      setShowModal(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${docId}/approval/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          decision,
          feedback: customFeedback || feedback,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record decision');

      setShowModal(false);
      setFeedback('');
      if (onDecisionSubmitted) onDecisionSubmitted(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const statusColors = {
    'Pending Review': { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
    'Approved': { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
    'Rejected': { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
    'Changes Requested': { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  };

  const style = statusColors[approvalStatus] || statusColors['Pending Review'];

  return (
    <div
      style={{
        backgroundColor: style.bg,
        borderBottom: `2px solid ${style.border}`,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Status overview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            backgroundColor: style.text,
            color: '#ffffff',
            textTransform: 'uppercase',
          }}
        >
          {approvalStatus}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: style.text }}>
          Review Progress: {approvedCount} of {totalCount} reviewers approved (Round {latestRoundNumber})
        </span>
      </div>

      {/* Reviewer Action Buttons */}
      {isPendingReviewer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            disabled={loading}
            onClick={() => handleAction('approved')}
            style={{
              padding: '6px 12px',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✓ Approve
          </button>
          <button
            disabled={loading}
            onClick={() => handleAction('changes_requested')}
            style={{
              padding: '6px 12px',
              backgroundColor: '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✎ Request Changes
          </button>
          <button
            disabled={loading}
            onClick={() => handleAction('rejected')}
            style={{
              padding: '6px 12px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}

      {/* Modal for Feedback/Reason */}
      {showModal && (
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
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              width: '420px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 700 }}>
              {activeDecision === 'rejected' ? 'Provide Rejection Reason' : 'Describe Requested Changes'}
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
              Please explain why you are selecting {activeDecision === 'rejected' ? 'rejection' : 'changes requested'} to notify the author.
            </p>

            {error && (
              <div style={{ color: '#dc2626', fontSize: '12px', marginBottom: '8px' }}>
                {error}
              </div>
            )}

            <textarea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Enter detailed feedback..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                disabled={loading || !feedback.trim()}
                onClick={() => handleAction(activeDecision, feedback)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: activeDecision === 'rejected' ? '#dc2626' : '#d97706',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Submit {activeDecision === 'rejected' ? 'Rejection' : 'Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
