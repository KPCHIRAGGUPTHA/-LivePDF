import { useState } from 'react';

export default function RedlineOverlay({
  pageNumber,
  proposals = [],
  scale = 1.0,
  activeProposalId,
  onSelectProposal,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  // Filter proposals for this page (show pending and accepted)
  const pageProposals = proposals.filter(p => {
    if (p.pageNumber !== pageNumber) return false;
    if (p.status !== 'pending' && p.status !== 'accepted') return false;
    return true;
  });

  return (
    <div
      aria-label={`Redline Overlay Page ${pageNumber}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 22,
      }}
    >
      {pageProposals.map((proposal) => {
        const isDeletion = proposal.proposalType === 'deletion';
        const isAccepted = proposal.status === 'accepted';
        const isActive = activeProposalId === proposal.id;
        const isHovered = hoveredId === proposal.id;

        const left = proposal.x * scale;
        const top = proposal.y * scale;
        const width = Math.max(20, proposal.width * scale);
        const height = Math.max(12, proposal.height * scale);

        // Color coding
        // Deletion: Red (#ef4444)
        // Replacement: Blue (#2563eb)
        const primaryColor = isDeletion ? '#ef4444' : '#2563eb';
        const bgColor = isDeletion
          ? (isAccepted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)')
          : (isAccepted ? 'rgba(37, 99, 235, 0.25)' : 'rgba(37, 99, 235, 0.15)');

        return (
          <div
            key={proposal.id}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: bgColor,
              borderBottom: `2.5px ${isDeletion ? 'dashed' : 'solid'} ${primaryColor}`,
              borderRadius: '2px',
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: isActive || isHovered ? 35 : 25,
              boxShadow: isActive ? `0 0 0 2px ${primaryColor}` : 'none',
              transition: 'all 0.15s ease',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectProposal) onSelectProposal(proposal);
            }}
            onMouseEnter={() => setHoveredId(proposal.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Small status tag badge */}
            <div
              style={{
                position: 'absolute',
                top: '-16px',
                left: '0px',
                backgroundColor: primaryColor,
                color: '#ffffff',
                fontSize: '9px',
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              {isDeletion ? '✂️ Delete' : '✏️ Replace'} {isAccepted ? '✓' : ''}
            </div>

            {/* Hover Tooltip */}
            {isHovered && !isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: `${height + 6}px`,
                  left: '0px',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  maxWidth: '260px',
                  minWidth: '180px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.4)',
                  zIndex: 40,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontWeight: 700, color: primaryColor, marginBottom: '2px' }}>
                  {proposal.authorName} ({isDeletion ? 'Suggested Deletion' : 'Suggested Replacement'})
                </div>
                <div style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '10px' }}>
                  "{proposal.originalText}"
                </div>
                {!isDeletion && proposal.proposedText && (
                  <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: '11px', marginTop: '2px' }}>
                    ➜ "{proposal.proposedText}"
                  </div>
                )}
                {isAccepted && (
                  <div style={{ color: '#4ade80', fontSize: '9px', marginTop: '4px', fontWeight: 700 }}>
                    ✓ Accepted (Ready to apply)
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
