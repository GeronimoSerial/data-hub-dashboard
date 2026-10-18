/** Simplified NASA insignia ("meatball") used to credit IMERG rainfall data. */
export function LogoNasa({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="NASA">
      <circle cx="50" cy="50" r="48" fill="#0b3d91" />
      <ellipse cx="50" cy="52" rx="44" ry="13" fill="none" stroke="#fff" strokeWidth="2" transform="rotate(-22 50 52)" />
      <path d="M12 72 L58 40 L54 48 L92 26 L50 58 L54 50 Z" fill="#fc3d21" />
      <text x="50" y="59" textAnchor="middle" fontFamily="Arial Black, Helvetica, sans-serif" fontWeight="900" fontSize="25" fill="#fff" fontStyle="italic">NASA</text>
      <circle cx="28" cy="30" r="1.6" fill="#fff" />
      <circle cx="70" cy="22" r="1.2" fill="#fff" />
      <circle cx="78" cy="74" r="1.4" fill="#fff" />
      <circle cx="36" cy="80" r="1" fill="#fff" />
    </svg>
  )
}
