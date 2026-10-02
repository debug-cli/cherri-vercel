const sections = document.querySelectorAll(".settings-section");
const buttons = document.querySelectorAll(".settings-side button");
const wispServers = document.querySelectorAll(".wisp-servers button")
const currentWisp = document.getElementById("currentWisp");
const savedWisp = CherriWisp.getConfiguredUrl();
const savedCloak = localStorage.getItem("cherri_cloak") ?? "";
const savedCloakIcon = localStorage.getItem("cherri_cloakIcon") ?? "";
const savedCloakTitle = localStorage.getItem("cherri_cloakTitle") ?? "";

const tabIcon = document.getElementById("tabIcon");
const tabTitle = document.querySelector('title');

const themeLink = document.getElementById('css-theme-link');
const savedTheme = localStorage.getItem('cherri_theme') ?? 'default';

if (savedCloakIcon || savedCloakTitle) {
    tabIcon.href = savedCloakIcon || tabIcon.href;
    document.title = savedCloakTitle || document.title;
}

function setTabTitle(v) {
    document.title = v;
    localStorage.setItem("cherri_cloakTitle", v);
}

function setTabIcon(v) {
    tabIcon.href = `https://www.google.com/s2/favicons?domain=${v}&sz=256`;
    localStorage.setItem("cherri_cloakIcon", tabIcon.href);
}

function applyTheme(t) {
  if (t !== "default") {
    themeLink.href = `/assets/css/themes/${t}.css`;
    localStorage.setItem("cherri_theme", t);
  } else {
    themeLink.href = `/assets/css/colors.css`;
    localStorage.setItem("cherri_theme", "default");
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
    const normalized = CherriWisp.setActiveServer(url, { custom: !!isCustom });

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

    CherriWisp.resetCache();
    setWispStatus("Testing...");

    CherriWisp.probeWispServer(normalized).then((result) => {
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
                    "That wisp server did not answer. cherri will fall back to the others automatically.",
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

    setWispServer(CherriWisp.normalizeWispUrl(input.value) || input.value, true);
}

function testWispServer() {
    const url = CherriWisp.getConfiguredUrl();

    CherriWisp.resetCache();
    setWispStatus("Testing...");

    CherriWisp.probeWispServer(url).then((result) => {
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
    const custom = localStorage.getItem(CherriWisp.KEYS.custom);
    if (input && custom) input.value = custom;
})();

function cloakMe(o) {
    switch (o) {
        case "gclassroom":
            tabIcon.href = "/assets/img/cloaks/gclassroom.png";
            document.title = "Google Classroom";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "gdrive":
            tabIcon.href = "/assets/img/cloaks/gdrive.png";
            document.title = "My Drive - Google Drive";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "google":
            tabIcon.href = "/assets/img/cloaks/google.png";
            document.title = "Google";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "edpuzzle":
            tabIcon.href = "/assets/img/cloaks/edpuzzle.png";
            document.title = "Edpuzzle";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "iready":
            tabIcon.href = "/assets/img/cloaks/iready.png";
            document.title = "i-Ready Login";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "gmail":
            tabIcon.href = "/assets/img/cloaks/gmail.png";
            document.title = "Gmail";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "blooket":
            tabIcon.href = "/assets/img/cloaks/blooket.png";
            document.title = "Blooket - Fun Learning Games for Students";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "kahoot":
            tabIcon.href = "/assets/img/cloaks/kahoot.png";
            document.title = "Kahoot! | Learning Games | Make Learning Awesome!";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
        case "none":
            tabIcon.href = "/assets/img/fav.png";
            document.title = "cherri";
            localStorage.setItem("cherri_cloakIcon", tabIcon.href);
            localStorage.setItem("cherri_cloakTitle", document.title);
            break;
    }
}