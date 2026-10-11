// Backend calls. docs/ARCHITECTURE.md section 6.2.
export const API = "http://localhost:8787";

export async function postDecide(body) {
  let res;
  try {
    res = await fetch(`${API}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { error: "Lantern's helper server is not running.", retryable: true };
  }
  if (!res.ok) return { error: `Server error ${res.status}`, retryable: res.status >= 500 };
  return res.json();
}

// Rules-only scam check for a page Lantern is not guiding. Never throws: null when the server is down.
export async function postScamCheck(body) {
  try {
    const res = await fetch(`${API}/scamcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
