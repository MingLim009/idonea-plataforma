import { LogoMark } from "./LogoMark.jsx";

export function Loader({ label = "Carregando…", fullscreen = true }) {
  return (
    <div className={`loader${fullscreen ? " loader-full" : ""}`} role="status" aria-live="polite">
      {fullscreen && (
        <div className="loader-motif" aria-hidden="true">
          <svg className="loader-motif-arc loader-motif-arc-a" viewBox="0 0 420 420" fill="none">
            <circle cx="210" cy="210" r="168" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
            <circle cx="210" cy="210" r="132" stroke="currentColor" strokeWidth="1.25" opacity="0.22" />
            <path d="M42 210c0-92.8 75.2-168 168-168" stroke="#00bebe" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M378 210c0 92.8-75.2 168-168 168" stroke="#f98f03" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
          </svg>
          <svg className="loader-motif-arc loader-motif-arc-b" viewBox="0 0 280 280" fill="none">
            <circle cx="140" cy="140" r="110" stroke="currentColor" strokeWidth="1" opacity="0.2" />
            <path d="M30 140c0-60.8 49.2-110 110-110" stroke="#5ee0e0" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          </svg>
          <span className="loader-orb loader-orb-1" />
          <span className="loader-orb loader-orb-2" />
        </div>
      )}
      <div className="loader-brand">
        <LogoMark size={44} />
        <span className="loader-brand-name">idônea</span>
      </div>
      <div className="loader-arcs" aria-hidden="true">
        <svg className="loader-ring loader-ring-1" viewBox="0 0 120 120">
          <circle className="loader-arc-path" cx="60" cy="60" r="52" />
        </svg>
        <svg className="loader-ring loader-ring-2" viewBox="0 0 120 120">
          <circle className="loader-arc-path" cx="60" cy="60" r="40" />
        </svg>
        <svg className="loader-ring loader-ring-3" viewBox="0 0 120 120">
          <circle className="loader-arc-path" cx="60" cy="60" r="28" />
        </svg>
      </div>
      <p className="loader-label">{label}</p>
    </div>
  );
}
