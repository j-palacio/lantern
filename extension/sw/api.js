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
