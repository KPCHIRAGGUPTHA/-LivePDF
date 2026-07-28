import { useState } from 'react';

export default function RedlinePanel({
  proposals = [],
  approvalStatus = 'Draft',
  isOwner = false,
  onDecision,
  onApplyChanges,
  onSelectProposal,
  applying = false,
}) {
  const [filter, setFilter] = useState('active'); // 'active' | 'all' | 'applied'

  const isPendingReview = approvalStatus === 'Pending Review';

  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const acceptedProposals = proposals.filter(p => p.status === 'accepted');
  const rejectedProposals = proposals.filter(p => p.status === 'rejected');
  const appliedProposals = proposals.filter(p => p.status === 'applied');

  const activeProposals = proposals.filter(p => p.status === 'pending' || p.status === 'accepted');

  const displayedProposals = filter === 'active'
    ? activeProposals
    : (filter === 'applied' ? appliedProposals : proposals);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0' }}>
      {/* Panel Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>✍️</span>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Redline Proposals</h3>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', backgroundColor: '#e2e8f0', color: '#475569' }}>
            {activeProposals.length} active
          </span>
        </div>

        {/* Apply accepted changes banner for Document Owner */}
        {isOwner && (
          <div style={{ backgroundColor: isPendingReview ? '#fffbebe6' : '#f0fdf4', border: `1px solid ${isPendingReview ? '#fef08a' : '#bbf7d0'}`, borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: isPendingReview ? '#854d0e' : '#166534' }}>
                {acceptedProposals.length} proposal(s) accepted
              </span>
              <button
                disabled={isPendingReview || acceptedProposals.length === 0 || applying}
                onClick={onApplyChanges}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isPendingReview || acceptedProposals.length === 0 ? '#94a3b8' : '#16a34a',
                  color: '#ffffff',
                  cursor: isPendingReview || acceptedProposals.length === 0 || applying ? 'not-allowed' : 'pointer',
                  boxShadow: isPendingReview || acceptedProposals.length === 0 ? 'none' : '0 2px 4px rgba(22, 163, 74, 0.25)',
                  transition: 'all 0.15s ease',
                }}
                title={isPendingReview ? 'Applying redlines is blocked while document is in Pending Review' : ''}
              >
                {applying ? 'Applying...' : '🚀 Apply Accepted Changes'}
              </button>
            </div>

            {/* Warning when in Pending Review lock */}
            {isPendingReview && (
              <div style={{ fontSize: '11px', color: '#a16207', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <span>🔒</span>
                <span>Applying changes is locked during <b>Pending Review</b>. Conclude the review round to apply.</span>
              </div>
            )}

            {!isPendingReview && acceptedProposals.length === 0 && (
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Accept proposals below to enable baking them into a new document version.
              </div>
            )}
          </div>
        )}

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          <button
            onClick={() => setFilter('active')}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: filter === 'active' ? 700 : 500,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: filter === 'active' ? '#2563eb' : '#f1f5f9',
              color: filter === 'active' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Active ({activeProposals.length})
          </button>
          <button
            onClick={() => setFilter('applied')}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: filter === 'applied' ? 700 : 500,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: filter === 'applied' ? '#2563eb' : '#f1f5f9',
              color: filter === 'applied' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            Applied ({appliedProposals.length})
          </button>
          <button
            onClick={() => setFilter('all')}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: filter === 'all' ? 700 : 500,
              borderRadius: '4px',
              border: 'none',
              backgroundColor: filter === 'all' ? '#2563eb' : '#f1f5f9',
              color: filter === 'all' ? '#ffffff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            All ({proposals.length})
          </button>
        </div>
      </div>

      {/* Proposals List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {displayedProposals.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '32px 16px', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
            <div>No redline proposals found.</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>Select any text on the PDF to suggest a replacement or deletion.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {displayedProposals.map((item) => {
              const isDeletion = item.proposalType === 'deletion';
              const isPending = item.status === 'pending';
              const isAccepted = item.status === 'accepted';
              const isRejected = item.status === 'rejected';
              const isApplied = item.status === 'applied';

              let statusBg = '#f1f5f9';
              let statusColor = '#475569';
              let statusText = 'Pending';

              if (isAccepted) {
                statusBg = '#dcfce7';
                statusColor = '#15803d';
                statusText = 'Accepted';
              } else if (isRejected) {
                statusBg = '#fee2e2';
                statusColor = '#b91c1c';
                statusText = 'Rejected';
              } else if (isApplied) {
                statusBg = '#e0e7ff';
                statusColor = '#4338ca';
                statusText = 'Applied';
              }

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectProposal && onSelectProposal(item)}
                  style={{
                    backgroundColor: '#ffffff',
                    border: `1px solid ${isAccepted ? '#86efac' : (isRejected ? '#fca5a5' : '#cbd5e1')}`,
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Proposal Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>{item.authorName}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>• Page {item.pageNumber}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: statusBg, color: statusColor }}>
                      {statusText}
                    </span>
                  </div>

                  {/* Track Changes Diff View */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', fontSize: '12px', borderLeft: `3px solid ${isDeletion ? '#ef4444' : '#2563eb'}`, marginBottom: '8px' }}>
                    <div style={{ color: '#ef4444', textDecoration: 'line-through', marginBottom: isDeletion ? 0 : '4px' }}>
                      {item.originalText}
                    </div>
                    {!isDeletion && item.proposedText && (
                      <div style={{ color: '#2563eb', fontWeight: 600 }}>
                        {item.proposedText}
                      </div>
                    )}
                    {isDeletion && (
                      <div style={{ color: '#94a3b8', fontSize: '10px', fontStyle: 'italic', marginTop: '2px' }}>
                        [Suggested Deletion]
                      </div>
                    )}
                  </div>

                  {/* Accept / Reject Buttons for Document Owner on Pending Proposals */}
                  {isOwner && isPending && (
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDecision) onDecision(item.id, 'rejected');
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          border: '1px solid #fca5a5',
                          backgroundColor: '#fff1f2',
                          color: '#be123c',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Reject
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDecision) onDecision(item.id, 'accepted');
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          border: 'none',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        ✓ Accept
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
