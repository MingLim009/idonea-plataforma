export function Loader({ label, fullscreen = true }) {
  return (
    <div className={`loader${fullscreen ? " loader-full" : ""}`} role="status" aria-live="polite">
      <div className="loader-arcs" aria-hidden="true">
        <svg className="loader-ring loader-ring-1" viewBox="0 0 80 80">
          <circle className="loader-arc-path" cx="40" cy="40" r="34" />
        </svg>
        <svg className="loader-ring loader-ring-2" viewBox="0 0 80 80">
          <circle className="loader-arc-path" cx="40" cy="40" r="26" />
        </svg>
        <svg className="loader-ring loader-ring-3" viewBox="0 0 80 80">
          <circle className="loader-arc-path" cx="40" cy="40" r="18" />
        </svg>
      </div>
      {label ? <p className="loader-label">{label}</p> : null}
    </div>
  );
}
