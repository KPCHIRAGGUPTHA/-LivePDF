import { useState } from 'react';
import DiffTooltip from './DiffTooltip';

const TYPE_COLORS = {
  ADDED:    { bg: 'rgba(34,197,94,0.15)',  border: '#22c55e' },
  REMOVED:  { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444' },
  MODIFIED: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b' },
};

export default function DiffOverlay({ changes, scale, pageHeight }) {
  const [activeChange, setActiveChange] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  function handleClick(e, change) {
    e.stopPropagation();
    setActiveChange(change);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }

  // PDF coordinates: origin bottom-left, y increases upward
  // Screen coordinates: origin top-left, y increases downward
  // Conversion: screen_y = (page_height - pdf_y1) * scale
  function toScreenRect(change) {
    return {
      left:   change.x0 * scale,
      top:    change.y0 * scale,
      width:  (change.x1 - change.x0) * scale,
      height: (change.y1 - change.y0) * scale,
    };
  }

  return (
    <>
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onClick={() => setActiveChange(null)}
      >
        {changes.map((change, i) => {
          const rect = toScreenRect(change);
          const colors = TYPE_COLORS[change.type];
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                background: colors.bg,
                border: `1.5px solid ${colors.border}`,
                borderRadius: 2,
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: 10,
              }}
              onClick={(e) => handleClick(e, change)}
            />
          );
        })}
      </div>

      {activeChange && (
        <DiffTooltip
          change={activeChange}
          position={tooltipPos}
          onClose={() => setActiveChange(null)}
        />
      )}
    </>
  );
}
