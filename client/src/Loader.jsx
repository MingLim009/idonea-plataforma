export function Loader({ label = "loading...", fullscreen = true }) {
  return (
    <div className={`loader${fullscreen ? " loader-full" : ""}`} role="status" aria-live="polite">
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
