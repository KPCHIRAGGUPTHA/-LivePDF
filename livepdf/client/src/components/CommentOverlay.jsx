import { useState } from 'react';

export default function CommentOverlay({
  pageNumber,
  comments = [],
  scale = 1.0,
  activeCommentId,
  onSelectComment,
  currentUserId,
  showResolved = false,
}) {
  const [hoveredCommentId, setHoveredCommentId] = useState(null);

  // Filter comments for this page & resolved visibility
  const pageComments = comments.filter(c => {
    if (c.pageNumber !== pageNumber) return false;
    if (!showResolved && c.isResolved) return false;
    return true;
  });

  return (
    <div
      aria-label={`Comment Overlay Page ${pageNumber}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none', // Let clicks pass through except on markers
        zIndex: 20,
      }}
    >
      {pageComments.map((comment, index) => {
        // Position scaled to current zoom scale
        const posX = comment.x * scale;
        const posY = comment.y * scale;

        const isHovered = hoveredCommentId === comment.id;
        const isActive = activeCommentId === comment.id;

        // Check if current user is mentioned in this comment
        const isMentioned = currentUserId && comment.content && (
          comment.content.includes(currentUserId) || comment.content.includes('@' + currentUserId)
        );

        // Color coding
        let badgeBg = '#2563eb'; // Blue for open
        let borderClr = '#1d4ed8';

        if (comment.isResolved) {
          badgeBg = '#16a34a'; // Green for resolved
          borderClr = '#15803d';
        } else if (isMentioned) {
          badgeBg = '#d97706'; // Amber for unread mentions
          borderClr = '#b45309';
        }

        return (
          <div
            key={comment.id || index}
            style={{
              position: 'absolute',
              left: `${posX}px`,
              top: `${posY}px`,
              pointerEvents: 'auto',
              transform: 'translate(-50%, -50%)',
              cursor: 'pointer',
              zIndex: isActive || isHovered ? 30 : 25,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectComment(comment);
            }}
            onMouseEnter={() => setHoveredCommentId(comment.id)}
            onMouseLeave={() => setHoveredCommentId(null)}
          >
            {/* Circular Marker Badge */}
            <div
              style={{
                width: isActive ? '28px' : '24px',
                height: isActive ? '28px' : '24px',
                borderRadius: '50%',
                backgroundColor: badgeBg,
                color: '#ffffff',
                border: `2px solid ${isActive ? '#ffffff' : borderClr}`,
                boxShadow: isActive
                  ? '0 0 0 3px rgba(37, 99, 235, 0.4), 0 4px 6px -1px rgba(0,0,0,0.2)'
                  : '0 2px 4px rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 'bold',
                transition: 'all 0.15s ease',
              }}
              title={`Comment #${index + 1} by ${comment.authorName}`}
            >
              {index + 1}
            </div>

            {/* Hover Tooltip Preview */}
            {isHovered && !isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: '32px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  maxWidth: '220px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                  pointerEvents: 'none',
                }}
              >
                <div style={{ fontWeight: 600, color: '#93c5fd', fontSize: '10px' }}>
                  {comment.authorName} {comment.isResolved && '✓ (Resolved)'}
                </div>
                <div style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {comment.content}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
