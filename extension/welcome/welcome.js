// Asks for the mic once for the extension origin. docs/ARCHITECTURE.md section 12.
document.getElementById("allow").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = "All set. You can close this tab.";
  } catch {
    status.textContent = "The microphone was blocked. Click the icon in the address bar to allow it, then try again.";
  }
});
