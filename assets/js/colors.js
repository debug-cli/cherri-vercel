/**
 * Apply the saved theme as early as possible so pages do not flash the default
 * palette. Pages that do not have the stylesheet hook (or run this before the
 * link exists) must not throw: a missing #css-theme-link used to abort this
 * script on 404.html, which left the saved theme unapplied.
 */
const link = document.getElementById('css-theme-link');
const theme = localStorage.getItem('graip_theme') ?? 'midnight';

if (link && theme !== 'default') {
    link.href = `/assets/css/themes/${theme}.css`;
}
