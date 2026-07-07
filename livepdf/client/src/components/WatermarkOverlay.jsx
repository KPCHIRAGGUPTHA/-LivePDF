import { useEffect, useRef } from 'react';

export default function WatermarkOverlay({ email, width, height }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas for drawing
    ctx.clearRect(0, 0, width, height);

    // Save state before translation/rotation
    ctx.save();

    // Style configuration
    ctx.fillStyle = 'rgba(148, 163, 184, 0.12)'; // slate color with ~12% opacity
    ctx.font = '500 15px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Center translation and rotate (counter-clockwise 30 degrees)
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-30 * Math.PI / 180);
    ctx.translate(-width / 2, -height / 2);

    const dateStr = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const text = `${email || 'Shared via LivePDF'} • ${dateStr}`;

    // Grid details
    const textWidth = ctx.measureText(text).width + 120; // 120px padding between columns
    const textHeight = 100; // 100px padding between rows

    // Render grid over an expanded bounds to cover rotated corners
    const startX = -width;
    const endX = width * 2;
    const startY = -height;
    const endY = height * 2;

    for (let x = startX; x < endX; x += textWidth) {
      for (let y = startY; y < endY; y += textHeight) {
        ctx.fillText(text, x, y);
      }
    }

    ctx.restore();
  }, [email, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
