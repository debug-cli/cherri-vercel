/**
 * Legacy Hyperbeam VM launcher.
 *
 * Only one page ever had the matching markup (#create-btn, #cooldown,
 * #fullscreen-btn, #vm-frame). `pages/vms.html` and `pages/assistant.html` both
 * include this file, but their VM UI is an embedded iframe, so the old code
 * threw "Cannot read properties of null" on load. Every DOM lookup is now
 * optional and the whole module no-ops when the launcher is absent.
 */
const COOLDOWN = 20 * 60 * 1000;
const STORAGE_KEY = "graip_vm_cooldown";

/** @returns {HTMLElement|null} */
function vmEl(id) {
  return document.getElementById(id);
}

function getRemaining() {
  const start = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!start) return 0;
  const remaining = COOLDOWN - (Date.now() - start);
  return remaining > 0 ? remaining : 0;
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function startCooldown() {
  localStorage.setItem(STORAGE_KEY, Date.now());
  updateTimer();
}

function setDisabled(id, disabled) {
  const el = vmEl(id);
  if (el) el.disabled = disabled;
}

function updateTimer() {
  const timerEl = vmEl("cooldown");
  if (!timerEl) return;

  const interval = setInterval(() => {
    const remaining = getRemaining();
    if (remaining <= 0) {
      timerEl.innerText = "";
      clearInterval(interval);
      setDisabled("create-btn", false);
    } else {
      timerEl.innerText = `Cooldown: ${formatTime(remaining)}`;
      setDisabled("create-btn", true);
    }
  }, 1000);
}

async function createVM() {
  const button = vmEl("create-btn");
  if (!button) return;

  const remaining = getRemaining();
  if (remaining > 0) {
    showToast(
      "error",
      `You are on cooldown! ${formatTime(remaining)} remaining.`,
      "fas fa-octagon-xmark"
    );
    return;
  }

  button.innerText = "Creating...";
  button.disabled = true;
  setDisabled("fullscreen-btn", false);

  try {
    const res = await fetch("https://api.x8r.dev/api/hyperbeam-sdk", {
      method: "POST",
    });
    const data = await res.json();
    const frame = vmEl("vm-frame");
    if (frame) {
      frame.src = data.embed_url || data.url || "";
      frame.style.display = "block";
    }
    startCooldown();
  } catch (e) {
    showToast("error", "Failed to create VM", "fas fa-octagon-xmark");
    button.disabled = false;
  } finally {
    button.innerText = "New VM";
  }
}

(function initVMLauncher() {
  const button = vmEl("create-btn");

  if (button) {
    button.addEventListener("click", createVM);

    window.addEventListener("DOMContentLoaded", () => {
      if (getRemaining() > 0) {
        updateTimer();
        button.disabled = true;
      } else {
        button.disabled = false;
      }
    });
  }

  if (typeof showToast === "function") {
    showToast(
      "success",
      "VMs are still in beta! Report bugs in the Discord or on the repo.",
      "fas fa-exclamation-circle"
    );
  }
})();
