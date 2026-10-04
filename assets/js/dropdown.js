// thanks to https://waves.lat for custom dropdowns || https://gitlab.com/waveslab/waves
const appSettings = {
  backend: localStorage.getItem("graip_backend") || "Scramjet",
  searchEngine: localStorage.getItem("graip_searchEngine") || "Google",
  decoy: localStorage.getItem("decoy") || "None",
  wisp: localStorage.getItem("graip_wispUrlSelected") || "Phantom",
  theme: localStorage.getItem("graip_theme") || "midnight",
  store: localStorage.getItem("graip_gameStore") || "Classplay",
};

const searchEngineSelector = document.querySelector(".search-engine-selector");
const searchEngineSelected = searchEngineSelector.querySelector(
  ".search-engine-selected"
);
const searchEngineOptions = searchEngineSelector.querySelector(
  ".search-engine-options"
);

const decoySelector = document.querySelector(".decoy-selector");
const decoySelected = decoySelector.querySelector(".decoy-selected");
const decoyOptions = decoySelector.querySelector(".decoy-options");

const backendSelector = document.querySelector(".backend-selector");
const backendSelected = backendSelector.querySelector(".backend-selected");
const backendOptions = backendSelector.querySelector(".backend-options");

const themeSelector = document.querySelector(".theme-selector");
const themeSelected = themeSelector.querySelector(".theme-selected");
const themeOptions = themeSelector.querySelector(".theme-options");

const storeSelector = document.querySelector(".store-selector");
const storeSelected = storeSelector.querySelector(".store-selected");
const storeOptions = storeSelector.querySelector(".store-options");

const decoyPresets = {
  Google: {
    title: "Google",
    icon: "https://www.google.com/favicon.ico",
  },
  "Google Docs": {
    title: "Untitled document - Google Docs",
    icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon-2023q4.ico",
  },
  Youtube: {
    title: "YouTube",
    icon: "https://www.youtube.com/s/desktop/014dbbed/img/favicon_32x32.png",
  },
  "Google Drive": {
    title: "My Drive - Google Drive",
    icon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png",
  },
  "Khan Acadamy": {
    title: "Khan Academy | Free Online Courses",
    icon: "https://www.khanacademy.org/favicon.ico",
  },
  Canvas: {
    title: "Dashboard | Canvas",
    icon: "https://community.canvaslms.com/favicon.ico",
  },
  "Google Classroom": {
    title: "Classroom",
    icon: "https://ssl.gstatic.com/classroom/favicon.png",
  },
  "Delta Math": {
    title: "Delta Math - Assignment",
    icon: "https://www.google.com/s2/favicons?domain=deltamath.com&sz=256",
  },
  Microsoft: {
    title: "Microsoft 365",
    icon: "https://www.microsoft.com/favicon.ico",
  },
  Scratch: {
    title: "Scratch - Imagine, Program, Share",
    icon: "https://scratch.mit.edu/favicon.ico",
  },
  Billibilli: {
    title: "Bilibili - Video Sharing Platform",
    icon: "https://www.bilibili.com/favicon.ico",
  },
  Schoology: {
    title: "Home | Schoology",
    icon: "https://asset-cdn.schoology.com/sites/all/themes/schoology_theme/favicon.ico",
  },
};


function closeAllSelectors() {
  document
    .querySelectorAll(
      ".backend-show, .transport-show, .search-engine-show, .decoy-show, .cloak-link-show, .wisp-show, .theme-show, .store-show"
    )
    .forEach((el) =>
      el.classList.remove(
        "backend-show",
        "transport-show",
        "search-engine-show",
        "decoy-show",
        "cloak-link-show",
        "wisp-show",
        "theme-show",
        "store-show"
      )
    );
  document
    .querySelectorAll(
      ".backend-arrow-active, .transport-arrow-active, .search-engine-arrow-active, .decoy-arrow-active, .cloak-link-arrow-active, .wisp-arrow-active, .theme-arrow-active, .store-arrow-active"
    )
    .forEach((el) =>
      el.classList.remove(
        "backend-arrow-active",
        "transport-arrow-active",
        "search-engine-arrow-active",
        "decoy-arrow-active",
        "cloak-link-arrow-active",
        "wisp-arrow-active",
        "theme-arrow-active",
        "store-arrow-active"
      )
    );
  document.querySelectorAll(".wisp-selected[aria-expanded='true']").forEach((el) => {
    el.setAttribute("aria-expanded", "false");
  });
}

const allBackendOptions = ["Ultraviolet", "Scramjet"];
const allTransportOptions = ["Epoxy", "Libcurl"];
const allSearchEngineOptions = [
  "DuckDuckGo",
  "Brave",
  "Qwant",
  "Google",
  "Bing",
  "Startpage",
];
const allDecoyOptions = [
  "None",
  "Google",
  "Google Docs",
  "Youtube",
  "Google Drive",
  "Khan Acadamy",
  "Canvas",
  "Google Classroom",
  "Delta Math",
  "Microsoft",
  "Scratch",
  "Billibilli",
];

const wispPresets = GraipWisp.PRESETS;
const wispSelectablePresets = wispPresets.filter((preset) =>
  ["Phantom", "Mercury", "Definitely Science 1", "Anura 1", "Terbium 1"].includes(
    preset.id
  )
);
const customWispOption = "Custom server…";
const wispSelector = document.querySelector(".wisp-selector");
const wispSelected = wispSelector.querySelector(".wisp-selected");
const wispOptions = wispSelector.querySelector(".wisp-options");
const wispCustomSettings = document.querySelector(".wisp-custom-settings");
const wispInput = document.querySelector(".wispInput");

function selectedWispPreset() {
  const selectedId = localStorage.getItem(GraipWisp.KEYS.preset);
  if (selectedId === "Fallback" || selectedId === "Custom") return null;

  const configured = GraipWisp.normalizeWispUrl(GraipWisp.getConfiguredUrl());
  const configuredPreset = wispPresets.find((preset) => preset.url === configured);
  if (configuredPreset && configuredPreset.id !== selectedId) return configuredPreset;
  return wispPresets.find((preset) => preset.id === selectedId) || configuredPreset || null;
}

function availableWispPresets() {
  const selected = selectedWispPreset();
  if (
    selected &&
    !wispSelectablePresets.some((preset) => preset.id === selected.id)
  ) {
    return [selected, ...wispSelectablePresets];
  }
  return wispSelectablePresets;
}

function updateWispSelector() {
  const preset = selectedWispPreset();
  const activeUrl = GraipWisp.normalizeWispUrl(GraipWisp.getConfiguredUrl());
  const customUrl = GraipWisp.normalizeWispUrl(
    localStorage.getItem(GraipWisp.KEYS.custom)
  );
  const selection = localStorage.getItem(GraipWisp.KEYS.preset);
  const isFallback = selection === "Fallback";
  const isCustom = selection === "Custom" && activeUrl === customUrl;
  const label = preset
    ? preset.name
    : isCustom
      ? customWispOption
      : isFallback
        ? "Automatic fallback"
        : wispPresets[0].name;

  wispSelected.textContent = label;
  wispSelected.setAttribute("aria-expanded", "false");
  wispCustomSettings.style.display = label === customWispOption ? "block" : "none";
  if (wispInput) {
    wispInput.value = localStorage.getItem(GraipWisp.KEYS.custom) || "";
  }
  if (typeof setCurrentWispServer === "function") {
    setCurrentWispServer(activeUrl);
  }
}

function selectWisp(option) {
  if (option === customWispOption) {
    const customUrl = localStorage.getItem(GraipWisp.KEYS.custom);
    wispSelected.textContent = customWispOption;
    wispCustomSettings.style.display = "block";
    if (wispInput) wispInput.value = customUrl || "";
    if (customUrl) {
      const url = GraipWisp.setActiveServer(customUrl, { custom: true });
      if (url) {
        GraipWisp.resetCache();
        updateWispSelector();
        setWispStatus("Selected; reload Graip to use this route");
      }
    } else {
      setWispStatus("Enter a custom server URL, then select Set");
    }
    return;
  }

  const preset = wispSelectablePresets.find((entry) => entry.name === option);
  if (!preset) return;

  const url = GraipWisp.setActiveServer(preset.url);
  if (!url) return;
  localStorage.setItem(GraipWisp.KEYS.preset, preset.id);
  GraipWisp.resetCache();
  updateWispSelector();
  setWispStatus("Selected; reload Graip to use this route");
}

wispSelected.addEventListener("click", (event) => {
  event.stopPropagation();
  const wasOpen = wispOptions.classList.contains("wisp-show");
  closeAllSelectors();
  if (wasOpen) return;

  wispOptions.innerHTML = "";
  [...availableWispPresets().map((preset) => preset.name), customWispOption]
    .filter((name) => name !== wispSelected.textContent)
    .forEach((name) => {
      const option = document.createElement("div");
      option.textContent = name;
      option.setAttribute("role", "option");
      option.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        closeAllSelectors();
        selectWisp(name);
      });
      wispOptions.appendChild(option);
    });
  wispOptions.classList.add("wisp-show");
  wispSelected.classList.add("wisp-arrow-active");
  wispSelected.setAttribute("aria-expanded", "true");
});

wispSelected.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    wispSelected.click();
  }
});

updateWispSelector();

const allThemeOptions = [
  "default",
  "void",
  "ocean",
  "forest",
  "ember",
  "dunes",
  "lavendar",
  "midnight",
  "coral",
  "golden",
  "lime",
  "magenta",
  "neon",
  "royal blue",
  "sea",
  "violet",
];

const allStoreOptions = ["Classplay", "GN-Math"];

function createSelector(
  selectorType,
  selectedEl,
  optionsEl,
  allOptions,
  currentVal,
  storageKey,
  eventName,
  successMsg
) {
  selectedEl.textContent = currentVal;

  selectedEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = optionsEl.classList.contains(`${selectorType}-show`);
    closeAllSelectors();

    if (!wasOpen) {
      optionsEl.innerHTML = "";
      allOptions.forEach((optionText) => {
        if (optionText !== selectedEl.textContent) {
          const div = document.createElement("div");
          div.textContent = optionText;
          div.addEventListener("click", function (e) {
            e.stopPropagation();
            const val = this.textContent;
            selectedEl.textContent = val;

            const storageVal =
              storageKey === "backend" || storageKey === "transport"
                ? val.toLowerCase()
                : val;

            appSettings[storageKey] = storageVal;
            localStorage.setItem(storageKey, storageVal);
            closeAllSelectors();
            if (eventName)
              document.dispatchEvent(
                new CustomEvent(eventName, {
                  detail: storageVal,
                })
              );
            if (successMsg) showToast("success", successMsg, "check-circle");

            if (storageKey === "cloakLink") {
              runMenuCloak();
            }
          });
          optionsEl.appendChild(div);
        }
      });
      optionsEl.classList.add(`${selectorType}-show`);
      selectedEl.classList.add(`${selectorType}-arrow-active`);
    }
  });
}

function applyDecoy(s) {
  const selected = decoyPresets[s];
  let favicon = document.querySelector("link[rel*='icon']");

  if (s === "None" || !selected) {
    console.log(
      "Stayed as " +
        favicon.href +
        " " +
        document.title +
        " and " +
        s +
        " was selected"
    );
    document.title = "graip";
    favicon.href = "/assets/img/fav.png";
    return;
  } else {
    document.title = selected.title;
    favicon.href = selected.icon;
    console.log("Set to " + favicon.href + " " + document.title);
  }
}

createSelector(
  "search-engine",
  searchEngineSelected,
  searchEngineOptions,
  allSearchEngineOptions,
  appSettings.searchEngine,
  "graip_searchEngine",
  null,
  "Successfully updated Search Engine!"
);

createSelector(
  "decoy",
  decoySelected,
  decoyOptions,
  allDecoyOptions,
  appSettings.decoy,
  "decoy",
  "decoyUpdated",
  "Successfully updated cloak!"
);

createSelector(
  "backend",
  backendSelected,
  backendOptions,
  allBackendOptions,
  appSettings.backend,
  "graip_backend",
  "backendUpdated",
  "Successfully updated backend!"
);

createSelector(
  "theme",
  themeSelected,
  themeOptions,
  allThemeOptions,
  appSettings.theme,
  "graip_theme",
  "themeUpdated",
  "Successfully updated theme! Refresh to see background change."
);

createSelector(
  "store",
  storeSelected,
  storeOptions,
  allStoreOptions,
  appSettings.store,
  "graip_gameStore",
  "storeUpdated",
  "Successfully updated game library!"
);

document.addEventListener("decoyUpdated", (e) => applyDecoy(e.detail));
document.addEventListener("themeUpdated", (e) => {
  const link = document.getElementById("css-theme-link");
  const theme = e.detail ?? "default";

  if (theme !== "default") {
    link.href = `/assets/css/themes/${theme}.css`;
  } else {
    link.href = "/assets/css/colors.css";
  }
});
document.addEventListener("wispUpdated", (e) => {
  selectWisp(e.detail);
});
document.addEventListener("graipWispServerChanged", updateWispSelector);
window.addEventListener("load", () => {
  applyDecoy(localStorage.getItem("decoy"));
  console.log("Cloaked as " + localStorage.getItem("decoy"));
});
