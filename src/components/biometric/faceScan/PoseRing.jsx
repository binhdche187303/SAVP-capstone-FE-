/**
 * Vòng vạch kiểu Face ID quanh khung camera (màn hình đã lật gương nên trái của
 * người dùng = bên trái màn hình). Góc SVG: 0° = phải, 90° = dưới, 180° = trái, 270° = trên.
 */
const DIRECTION_ANGLE = { right: 0, down: 90, left: 180, up: 270 };
const SPAN = 40;
const TICKS = 72;

function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export default function PoseRing({ size, innerDiameter, captured, target, progress }) {
  const c = size / 2;
  const r1 = innerDiameter / 2 + 8;
  const r2 = innerDiameter / 2 + 22;
  const frontDone = captured.has('front');

  return (
    <svg width={size} height={size} className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: TICKS }, (_, i) => {
        const deg = (i * 360) / TICKS;
        const rad = (deg * Math.PI) / 180;
        let dir = null;
        let dist = 999;
        for (const [p, a] of Object.entries(DIRECTION_ANGLE)) {
          const d = angleDiff(deg, a);
          if (d <= SPAN && d < dist) { dir = p; dist = d; }
        }
        let color = frontDone ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.4)';
        let grow = 0;
        if (dir && captured.has(dir)) {
          color = '#22c55e'; grow = 4;
        } else if (dir && dir === target) {
          const lit = dist <= SPAN * progress;
          color = lit ? '#22c55e' : '#3b82f6';
          grow = lit ? 4 : 2;
        } else if (target === 'front' && progress > 0) {
          color = i / TICKS <= progress ? '#22c55e' : color;
        }
        return (
          <line
            key={i}
            x1={c + r1 * Math.cos(rad)}
            y1={c + r1 * Math.sin(rad)}
            x2={c + (r2 + grow) * Math.cos(rad)}
            y2={c + (r2 + grow) * Math.sin(rad)}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ transition: 'stroke 150ms' }}
          />
        );
      })}
    </svg>
  );
}
