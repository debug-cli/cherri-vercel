const sections = document.querySelectorAll(".settings-section");
const buttons = document.querySelectorAll(".settings-side button");
const wispServers = document.querySelectorAll(".wisp-servers button")
const currentWisp = document.getElementById("currentWisp");
const savedWisp = GraipWisp.getConfiguredUrl();
const savedCloak = localStorage.getItem("graip_cloak") ?? "";
const savedCloakIcon = localStorage.getItem("graip_cloakIcon") ?? "";
const savedCloakTitle = localStorage.getItem("graip_cloakTitle") ?? "";

const tabIcon = document.getElementById("tabIcon");
const tabTitle = document.querySelector('title');

const themeLink = document.getElementById('css-theme-link');
const savedTheme = localStorage.getItem('graip_theme') ?? 'midnight';

if (savedCloakIcon || savedCloakTitle) {
    tabIcon.href = savedCloakIcon || tabIcon.href;
    document.title = savedCloakTitle || document.title;
}

function setTabTitle(v) {
    document.title = v;
    localStorage.setItem("graip_cloakTitle", v);
}

function setTabIcon(v) {
    tabIcon.href = `https://www.google.com/s2/favicons?domain=${v}&sz=256`;
    localStorage.setItem("graip_cloakIcon", tabIcon.href);
}

function applyTheme(t) {
  if (t !== "default") {
    themeLink.href = `/assets/css/themes/${t}.css`;
    localStorage.setItem("graip_theme", t);
  } else {
    themeLink.href = `/assets/css/colors.css`;
    localStorage.setItem("graip_theme", "default");
  }
}

currentWisp.textContent = savedWisp;

buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
        buttons.forEach((b) => {
            b.classList.remove("active");
        })
        btn.classList.add("active");
    });
})

wispServers.forEach((btn) => {
  btn.addEventListener("click", () => {
    wispServers.forEach((b) => {
      b.classList.remove("active");
    });
    btn.classList.add("active");
  });
});

function settingsNav(section) {
    sections.forEach((sec) => {
        sec.classList.toggle("active", sec.classList.contains(section));
    });
}

const wispStatusEl = document.getElementById("wispStatus");

function setWispStatus(text) {
    if (wispStatusEl) wispStatusEl.textContent = text;
}

/**
 * Save an endpoint and immediately check that it actually speaks wisp, so a dead
 * server is caught here instead of turning into "error code 7: Could not connect to
 * server" on every request later.
 */
function setWispServer(url, isCustom) {
    const normalized = GraipWisp.setActiveServer(url, { custom: !!isCustom });

    if (!normalized) {
        setWispStatus("Invalid URL");
        if (typeof showToast === "function") {
            showToast("error", "That is not a valid wisp URL.", "triangle-exclamation");
        }
        return;
    }

    currentWisp.textContent = normalized;

    const input = document.getElementById("customWisp");
    if (input && input === document.activeElement) input.value = normalized;

    GraipWisp.resetCache();
    setWispStatus("Testing...");

    GraipWisp.probeWispServer(normalized).then((result) => {
        if (result.ok) {
            setWispStatus(`Online (${result.ms}ms)`);
            if (typeof showToast === "function") {
                showToast("success", `Wisp server is online (${result.ms}ms)`, "circle-check");
            }
        } else {
            setWispStatus(`Unreachable (${result.reason})`);
            if (typeof showToast === "function") {
                showToast(
                    "error",
                    "That wisp server did not answer. graip will fall back to the others automatically.",
                    "triangle-exclamation"
                );
            }
        }
    });
}

function setCustomWispServer() {
    const input = document.getElementById("customWisp");
    if (!input || !input.value.trim()) {
        setWispStatus("Enter a URL first");
        return;
    }

    setWispServer(GraipWisp.normalizeWispUrl(input.value) || input.value, true);
}

function testWispServer() {
    const url = GraipWisp.getConfiguredUrl();

    GraipWisp.resetCache();
    setWispStatus("Testing...");

    GraipWisp.probeWispServer(url).then((result) => {
        if (result.ok) {
            setWispStatus(`Online (${result.ms}ms)`);
        } else {
            setWispStatus(`Unreachable (${result.reason})`);
        }
    });
}

// prefill the custom box with whatever was typed in last
(function () {
    const input = document.getElementById("customWisp");
    const custom = localStorage.getItem(GraipWisp.KEYS.custom);
    if (input && custom) input.value = custom;
})();

function cloakMe(o) {
    switch (o) {
        case "gclassroom":
            tabIcon.href = "/assets/img/cloaks/gclassroom.png";
            document.title = "Google Classroom";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "gdrive":
            tabIcon.href = "/assets/img/cloaks/gdrive.png";
            document.title = "My Drive - Google Drive";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "google":
            tabIcon.href = "/assets/img/cloaks/google.png";
            document.title = "Google";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "edpuzzle":
            tabIcon.href = "/assets/img/cloaks/edpuzzle.png";
            document.title = "Edpuzzle";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "iready":
            tabIcon.href = "/assets/img/cloaks/iready.png";
            document.title = "i-Ready Login";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "gmail":
            tabIcon.href = "/assets/img/cloaks/gmail.png";
            document.title = "Gmail";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "blooket":
            tabIcon.href = "/assets/img/cloaks/blooket.png";
            document.title = "Blooket - Fun Learning Games for Students";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "kahoot":
            tabIcon.href = "/assets/img/cloaks/kahoot.png";
            document.title = "Kahoot! | Learning Games | Make Learning Awesome!";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
        case "none":
            tabIcon.href = "/assets/img/fav.png";
            document.title = "graip";
            localStorage.setItem("graip_cloakIcon", tabIcon.href);
            localStorage.setItem("graip_cloakTitle", document.title);
            break;
    }
}