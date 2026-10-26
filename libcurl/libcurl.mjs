/*
 * graip | ESM entry point for Scramjet's libcurl transport.
 *
 * The bundle itself lives in libcurl/index.mjs (vendored
 * @mercuryworkshop/libcurl-transport@2.0.6, which embeds libcurl.js 0.7.5).
 * This file only re-exports it, so bare-mux (Ultraviolet) and the page-side
 * Scramjet controller share one copy of the ~2 MB WASM bundle instead of
 * shipping two identical ones.
 */
export * from "./index.mjs";
export { default } from "./index.mjs";
