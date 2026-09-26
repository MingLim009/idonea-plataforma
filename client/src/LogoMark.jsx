/** Brand mark — teal tile with white “i” (matches favicon) */
export function LogoMark({ size = 36, className = "brand-mark" }) {
  return (
    <span className={className} aria-hidden="true" style={{ width: size, height: size }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} role="img">
        <rect width="64" height="64" rx="14" fill="#00BEBE" />
        <circle cx="32" cy="16" r="5" fill="#fff" />
        <rect x="27" y="25" width="10" height="28" rx="3" fill="#fff" />
      </svg>
    </span>
  );
}
