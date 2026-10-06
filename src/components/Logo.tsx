const SPOKE_ANGLES = [0, 72, 144, 216, 288];

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: 16 + r * Math.sin(rad), y: 16 - r * Math.cos(rad) };
}

export function Logo({
  className,
  tireColor = "#23262B",
  rimColor = "#FFFFFF",
  hubColor = "#2563A6",
}: {
  className?: string;
  tireColor?: string;
  rimColor?: string;
  hubColor?: string;
}) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Sjödalen Bilar">
      <circle cx="16" cy="16" r="15" fill={tireColor} />
      <circle cx="16" cy="16" r="9" fill={rimColor} />
      {SPOKE_ANGLES.map((a) => {
        const { x, y } = polar(a, 5);
        return <circle key={a} cx={x} cy={y} r="1.3" fill={tireColor} />;
      })}
      <circle cx="16" cy="16" r="2.6" fill={hubColor} />
    </svg>
  );
}
