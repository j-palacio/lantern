// Visual and timing tunables. Shared namespace for all content scripts.
(globalThis.Lantern ??= {}).config = {
  API: "http://localhost:8787",
  ACCENT: "#ffb703",       // ring, button
  DANGER: "#d62828",       // scam warnings
  DIM: 0.45,               // page dim around the highlighted element
  MAX_ELEMENTS: 150,
  MAX_TEXT: 4000,          // visible page text sent to the backend
  SETTLE_QUIET_MS: 400,    // DOM quiet this long = page settled (section 10)
  SETTLE_MAX_MS: 2500,
  COVER_MS: 400,           // target covered this long = target_covered
};
