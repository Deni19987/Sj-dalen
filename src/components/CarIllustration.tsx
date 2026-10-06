import type { BodyType } from "../lib/types";

const CABINS: Record<BodyType, { x: number; width: number; y: number; height: number }> = {
  kombi: { x: 52, width: 106, y: 28, height: 36 },
  suv: { x: 50, width: 100, y: 20, height: 44 },
  sedan: { x: 58, width: 78, y: 32, height: 32 },
  halvkombi: { x: 60, width: 68, y: 32, height: 32 },
  skåpbil: { x: 40, width: 118, y: 16, height: 48 },
};

const INK = "#23262B";

export function CarIllustration({
  colorHex,
  bodyType,
  className,
}: {
  colorHex: string;
  bodyType: BodyType;
  className?: string;
}) {
  const cabin = CABINS[bodyType];
  const bodyY = 64;
  const tall = bodyType === "suv" || bodyType === "skåpbil";
  const bodyH = tall ? 38 : 32;
  const wheelY = bodyY + bodyH;
  const wheelR = tall ? 17 : 15;

  return (
    <svg viewBox="0 0 200 120" className={className} role="img" aria-label={`Illustration av en ${bodyType}`}>
      <ellipse cx="100" cy="108" rx="82" ry="6" fill={INK} opacity="0.12" />
      <rect x={cabin.x} y={cabin.y} width={cabin.width} height={cabin.height} rx="10" fill={colorHex} stroke={INK} strokeWidth="3" />
      <rect
        x={cabin.x + 8}
        y={cabin.y + 7}
        width={cabin.width - 16}
        height={cabin.height - 18}
        rx="4"
        fill="#EAF0F4"
        fillOpacity="0.85"
      />
      <rect x={cabin.x + cabin.width / 2 - 1.5} y={cabin.y + 7} width="3" height={cabin.height - 18} fill={INK} />
      <rect x="18" y={bodyY} width="164" height={bodyH} rx="14" fill={colorHex} stroke={INK} strokeWidth="3" />
      <rect x="170" y={bodyY + bodyH - 20} width="12" height="9" rx="3" fill="#2563A6" />
      <rect x="20" y={bodyY + bodyH - 20} width="8" height="9" rx="2" fill={INK} opacity="0.55" />
      {[62, 158].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={wheelY} r={wheelR} fill={INK} />
          <circle cx={cx} cy={wheelY} r={wheelR - 8} fill="#9AA0A6" />
        </g>
      ))}
    </svg>
  );
}
