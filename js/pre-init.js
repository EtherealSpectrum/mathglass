// Pre-init v3.4.0 — desktop shell, θέμα, διαφάνεια, θόλωμα, γραμματοσειρές και διάταξη
(function () {
  var SANS_MAP = {
    default: '"Segoe UI", "Noto Sans", system-ui, -apple-system, Helvetica, Arial, sans-serif',
    segoe: '"Segoe UI", system-ui, sans-serif',
    arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, Tahoma, sans-serif',
    tahoma: 'Tahoma, Geneva, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif'
  };
  var MONO_MAP = {
    default: '"JetBrains Mono", "Cascadia Code", "DejaVu Sans Mono", "Liberation Mono", Consolas, Menlo, monospace',
    jetbrains: '"JetBrains Mono", Consolas, monospace',
    consolas: 'Consolas, "Cascadia Code", "Courier New", monospace',
    fira: '"Fira Code", "Cascadia Mono", Consolas, monospace',
    courier: '"Courier New", Courier, monospace'
  };
  try {
    var root = document.documentElement;
    var isDesktop = Boolean((window.mathglassDesktop && window.mathglassDesktop.isDesktop) || /[?&]mode=desktop\b/.test(location.search));
    if (isDesktop) {
      root.setAttribute('data-desktop', 'true');
    }
    var t = localStorage.getItem('latex_theme');
    root.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');

    var tr = localStorage.getItem('latex_transparency_level');
    var parsedTr = tr !== null ? parseFloat(tr) : NaN;
    var level = !Number.isNaN(parsedTr) ? parsedTr : 35;
    if (!(level > 0) && tr === null && localStorage.getItem('latex_transparent') === 'true') {
      level = 50;
    }

    if (level > 0) {
      level = Math.min(100, level);
      root.setAttribute('data-transparent', 'true');
      root.setAttribute('data-full-transparent', level >= 100 ? 'true' : 'false');
      root.style.setProperty('--panel-alpha', (1 - level / 100));
    } else {
      root.setAttribute('data-transparent', 'false');
      root.setAttribute('data-full-transparent', 'false');
      root.style.setProperty('--panel-alpha', 1);
    }

    var bl = localStorage.getItem('latex_blur_enabled');
    root.setAttribute('data-blur', isDesktop ? 'false' : (bl === 'false' ? 'false' : 'true'));

    var sx = localStorage.getItem('latex_syntax_highlight');
    root.setAttribute('data-syntax', sx === 'false' ? 'false' : 'true');

    var cl = localStorage.getItem('latex_preview_click_cursor_lock');
    root.setAttribute('data-cursor-lock', cl === 'true' ? 'true' : 'false');

    var nl = localStorage.getItem('latex_notepad_layout');
    root.setAttribute('data-notepad-layout', nl === 'bottom' ? 'bottom' : 'right');

    var bh = parseFloat(localStorage.getItem('latex_notepad_bottom_height'));
    if (!Number.isNaN(bh) && bh >= 80) {
      root.style.setProperty('--notepad-bottom-height', Math.round(bh) + 'px');
    }

    var sf = localStorage.getItem('latex_sans_font');
    if (sf && SANS_MAP[sf]) root.style.setProperty('--sans', SANS_MAP[sf]);

    var mf = localStorage.getItem('latex_mono_font');
    if (mf && MONO_MAP[mf]) root.style.setProperty('--mono', MONO_MAP[mf]);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-transparent', 'true');
    document.documentElement.setAttribute('data-full-transparent', 'false');
    document.documentElement.style.setProperty('--panel-alpha', 0.65);
    document.documentElement.setAttribute('data-blur', 'true');
    document.documentElement.setAttribute('data-syntax', 'true');
  }
})();
