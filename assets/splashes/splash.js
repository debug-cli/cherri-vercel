(async function loadSplash() {
  const splashTextEl = document.getElementById("splash");
  if (!splashTextEl) return;

  try {
    const response = await fetch("/assets/splashes/splashes.txt");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const splashes = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!splashes.length) return;

    const splash = splashes[Math.floor(Math.random() * splashes.length)];
    const fragment = document.createDocumentFragment();
    const linkPattern = /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
    let cursor = 0;
    let match;

    // Splash text is plain text by default. The small Markdown-link form keeps
    // the existing clickable promo splashes without inserting arbitrary HTML.
    while ((match = linkPattern.exec(splash))) {
      if (match.index > cursor) {
        fragment.append(document.createTextNode(splash.slice(cursor, match.index)));
      }
      const link = document.createElement("a");
      link.href = match[2];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = match[1];
      fragment.append(link);
      cursor = linkPattern.lastIndex;
    }

    if (cursor < splash.length) {
      fragment.append(document.createTextNode(splash.slice(cursor)));
    }
    splashTextEl.replaceChildren(fragment);
  } catch (error) {
    window.GraipLog && window.GraipLog.warn("ui", "splash list unavailable", {
      error: (error && error.message) || String(error),
    });
  }
})();
