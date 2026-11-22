// Pre-init v3.3.0 — desktop shell, θέμα, διαφάνεια, θόλωμα (blur) και σύνταξη
(function () {
  try {
    var isDesktop = Boolean((window.mathglassDesktop && window.mathglassDesktop.isDesktop) || /[?&]mode=desktop\b/.test(location.search));
    if (isDesktop) {
      document.documentElement.setAttribute('data-desktop', 'true');
    }
    var t = localStorage.getItem('latex_theme');
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');

    var tr = localStorage.getItem('latex_transparency_level');
    var level = tr !== null ? parseFloat(tr) : 0;
    if (!(level > 0) && localStorage.getItem('latex_transparent') === 'true') {
      level = 50;
    }

    if (level > 0) {
      level = Math.min(100, level);
      document.documentElement.setAttribute('data-transparent', 'true');
      document.documentElement.style.setProperty('--panel-alpha', (1 - level / 100));
    } else {
      document.documentElement.setAttribute('data-transparent', 'false');
      document.documentElement.style.setProperty('--panel-alpha', 1);
    }

    var bl = localStorage.getItem('latex_blur_enabled');
    document.documentElement.setAttribute('data-blur', isDesktop ? 'false' : (bl === 'false' ? 'false' : 'true'));

    var sx = localStorage.getItem('latex_syntax_highlight');
    document.documentElement.setAttribute('data-syntax', sx === 'false' ? 'false' : 'true');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-transparent', 'false');
    document.documentElement.setAttribute('data-blur', 'true');
    document.documentElement.setAttribute('data-syntax', 'true');
  }
})();
