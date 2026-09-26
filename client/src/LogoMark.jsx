/** Brand mark — teal tile with abstract project/list mark (not an “i”) */
export function LogoMark({ size = 36, className = "brand-mark" }) {
  return (
    <span className={className} aria-hidden="true" style={{ width: size, height: size }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} role="img">
        <rect width="64" height="64" rx="14" fill="#00BEBE" />
        {/* Mini list / kanban column */}
        <rect x="14" y="14" width="22" height="10" rx="3" fill="#fff" />
        <rect x="14" y="28" width="22" height="10" rx="3" fill="#fff" />
        <rect x="14" y="42" width="22" height="10" rx="3" fill="#fff" />
        {/* Tall project bar */}
        <rect x="42" y="14" width="10" height="38" rx="3" fill="#fff" />
      </svg>
    </span>
  );
}
