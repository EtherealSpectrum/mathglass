import { KEYS } from '../core/constants.js';
import { $, on, clamp } from '../core/dom.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';
import * as toolbar from './toolbar.js';

const TUTORIAL_SEEN_KEY = 'latex_tutorial_seen';
const DATASET_CHOSEN_KEY = 'latex_dataset_chosen';
const OOBE_SLIDE_INTERVAL_MS = 3800;

const OOBE_PRESETS = [
  {
    key: 'basic',
    title: 'Επίπεδο 1 · Βασικά Μαθηματικά',
    badge: 'Γυμνάσιο · Άλγεβρα & Γεωμετρία',
    desc: 'Καθαρό, απλό σετ για Γυμνάσιο και καθημερινή χρήση: πράξεις, κλάσματα, ρίζες, σύνολα και γεωμετρία.',
    highlights: [
      'Δυνάμεις, κλάσματα, ρίζες & πράξεις',
      'Βασική τριγωνομετρία, λογάριθμοι & απόλυτες τιμές',
      'Σύνολα, ελληνικό αλφάβητο & γεωμετρικά σύμβολα',
      'Απλά συστήματα εξισώσεων & χρώματα',
    ],
    samples: [
      '\\frac{a}{b}',
      '\\sqrt{x}',
      '\\sin x',
      '\\alpha\\,\\beta\\,\\Delta',
      '\\mathbb{R}',
      '\\in\\,\\cup\\,\\cap',
      '\\widehat{AB\\Gamma}',
      '\\overline{AB}',
      '\\pm',
      '90^{\\circ}',
    ],
    fallbackCounts: { groups: 14, items: 120 },
  },
  {
    key: 'codecogs_alike',
    title: 'Επίπεδο 2 · Προχωρημένα Μαθηματικά',
    badge: 'Λύκειο & Ανάλυση · Προεπιλογή',
    desc: 'Ολοκληρωμένη συλλογή για Λύκειο, Πανελλαδικές και Ανάλυση: όρια, παράγωγοι, ολοκληρώματα, μιγαδικοί και πίνακες.',
    highlights: [
      'Όρια, παράγωγοι, ολοκληρώματα & σειρές',
      'Μιγαδικοί αριθμοί & θεωρία αριθμών',
      'Πίνακες, ορίζουσες, λογική & ποσοδείκτες',
      'Πιθανότητες, στατιστική & πλήρης τριγωνομετρία',
    ],
    samples: [
      '\\dfrac{a}{b}',
      '\\int_{a}^{b}',
      '\\sum_{i=1}^{n}',
      '\\lim_{x\\to\\infty}',
      '\\binom{n}{k}',
      '\\Re(z)',
      '\\Longleftrightarrow',
      '\\mathbb{E}[X]',
      '\\partial',
      '\\mathcal{L}',
    ],
    fallbackCounts: { groups: 20, items: 251 },
  },
  {
    key: 'science',
    title: 'Επίπεδο 3 · Επιστήμες / Μηχανική',
    badge: 'Πανεπιστήμιο & Έρευνα · Πλήρες Σετ',
    desc: 'Το πλήρες επιστημονικό σετ για Φυσική, Πολυτεχνείο και έρευνα με γραμμική άλγεβρα, διανύσματα και εξειδικευμένους τελεστές.',
    highlights: [
      'Γραμμική Άλγεβρα (det, rank, tr, eig)',
      'Διανυσματικός Λογισμός (grad, div, curl, ∇²)',
      'Πολλαπλά, επικαμπύλια & τριπλά ολοκληρώματα',
      'Πλήρης συλλογή τελεστών, βελών & στατιστικής',
    ],
    samples: [
      '\\nabla\\times\\mathbf{F}',
      '\\operatorname{rank}(A)',
      '\\det(A)',
      '\\iiint_V',
      '\\oint_C',
      '\\hbar',
      '\\otimes',
      '\\operatorname{Cov}(X,Y)',
      '\\vdash',
      '\\propto',
    ],
    fallbackCounts: { groups: 23, items: 441 },
  },
];

let overlayEl = null;
let backdropEl = null;
let spotlightEl = null;
let cardEl = null;
let tutorialOpen = false;
let currentStepIdx = 0;
let activeSteps = [];
let initialNotepadOpen = false;
let initialNotepadViewMode = 'wysiwyg';
let stepPrepToken = 0;

let oobeOverlayEl = null;
let oobeOpen = false;
let oobeSlideIdx = 1;
let oobeAutoPlaying = true;
let oobeSlideTimer = null;
let oobeInitialDataset = 'codecogs_alike';
let oobeAfterCloseTutorialCheck = false;

function isDesktopEnv() {
  return Boolean(window.mathglassDesktop?.isDesktop);
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function getPresetCounts(presetKey, fallback) {
  const map = {
    codecogs_alike: window.TOOLBARS_CODECOGS_ALIKE,
    basic: window.TOOLBARS_BASIC,
    science: window.TOOLBARS_SCIENCE,
  };
  const rows = map[presetKey];
  if (!Array.isArray(rows) || !rows.length) return fallback;
  let groups = 0;
  let items = 0;
  for (const r of rows) {
    const gs = r?.groups || [];
    groups += gs.length;
    for (const g of gs) {
      items += (g?.items || []).length;
    }
  }
  return groups > 0 ? { groups, items } : fallback;
}

function applyDatasetLive(datasetKey, persistChoice) {
  const valid = OOBE_PRESETS.some(p => p.key === datasetKey) ? datasetKey : 'codecogs_alike';
  state.dataset = valid;
  const ds = $('#toolbar-dataset-select');
  if (ds) ds.value = valid;
  if (persistChoice) {
    set(KEYS.dataset, valid);
  }
  window.__rebuildToolbar?.();
}

function stopOobeAutoTimer() {
  if (oobeSlideTimer) {
    clearTimeout(oobeSlideTimer);
    oobeSlideTimer = null;
  }
}

function scheduleOobeAutoAdvance() {
  stopOobeAutoTimer();
  if (!oobeOpen || !oobeAutoPlaying) return;
  oobeSlideTimer = setTimeout(() => {
    if (!oobeOpen || !oobeAutoPlaying) return;
    oobeSlideIdx = (oobeSlideIdx + 1) % OOBE_PRESETS.length;
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
    renderOobeModal();
    scheduleOobeAutoAdvance();
  }, OOBE_SLIDE_INTERVAL_MS);
}

function ensureOobeMounted() {
  if (oobeOverlayEl && document.body.contains(oobeOverlayEl)) return;
  oobeOverlayEl = document.createElement('div');
  oobeOverlayEl.className = 'mg-oobe-overlay';
  oobeOverlayEl.id = 'mg-oobe-overlay';
  oobeOverlayEl.setAttribute('role', 'dialog');
  oobeOverlayEl.setAttribute('aria-modal', 'true');
  oobeOverlayEl.setAttribute('aria-labelledby', 'mg-oobe-title');
  document.body.appendChild(oobeOverlayEl);
}

function renderSampleHtml(tex) {
  try {
    if (typeof katex !== 'undefined' && typeof katex.renderToString === 'function') {
      return katex.renderToString(tex, { throwOnError: false, displayMode: false });
    }
  } catch { }
  return `<code>${tex}</code>`;
}

function renderOobeModal() {
  if (!oobeOverlayEl) return;
  const activePreset = OOBE_PRESETS[oobeSlideIdx] || OOBE_PRESETS[1];
  const counts = getPresetCounts(activePreset.key, activePreset.fallbackCounts);

  const cardsHtml = OOBE_PRESETS.map((p, idx) => {
    const selected = idx === oobeSlideIdx;
    const pCounts = getPresetCounts(p.key, p.fallbackCounts);
    return `
      <button
        type="button"
        class="mg-oobe-option${selected ? ' is-selected' : ''}"
        data-oobe-idx="${idx}"
        role="radio"
        aria-checked="${selected}"
      >
        <span class="mg-oobe-radio" aria-hidden="true"></span>
        <span class="mg-oobe-opt-body">
          <span class="mg-oobe-opt-top">
            <span class="mg-oobe-opt-title">${p.title}</span>
            <span class="mg-oobe-opt-meta">${pCounts.groups} ομάδες</span>
          </span>
          <span class="mg-oobe-opt-sub">${p.badge}</span>
        </span>
      </button>
    `;
  }).join('');

  const highlightsHtml = activePreset.highlights
    .map(text => `<li class="mg-oobe-hi-item">${text}</li>`)
    .join('');

  const samplesHtml = activePreset.samples
    .map(tex => `<span class="mg-oobe-sample-cell" title="${tex}">${renderSampleHtml(tex)}</span>`)
    .join('');

  const dotsHtml = OOBE_PRESETS.map((p, idx) => `
    <button
      type="button"
      class="mg-oobe-dot${idx === oobeSlideIdx ? ' is-active' : ''}"
      data-oobe-dot="${idx}"
      aria-label="Προβολή διαφάνειας: ${p.title}"
      title="${p.title}"
    ></button>
  `).join('');

  oobeOverlayEl.innerHTML = `
    <div class="mg-oobe-backdrop" data-oobe-dismiss="true"></div>
    <div class="mg-oobe-card">
      <div class="mg-oobe-header">
        <div class="mg-oobe-eyebrow">Αρχική ρύθμιση · MathGlass</div>
        <button type="button" class="mg-oobe-close" id="mg-oobe-close-x" title="Παράλειψη (Esc)" aria-label="Κλείσιμο">&times;</button>
      </div>
      <h2 class="mg-oobe-title" id="mg-oobe-title">Επιλέξτε το σετ εργαλειοθήκης σας</h2>
      <p class="mg-oobe-subtitle">Οι διαφάνειες εναλλάσσονται αυτόματα για να συγκρίνετε τις διαφορές. Μπορείτε να το αλλάξετε αργότερα από τις Ρυθμίσεις.</p>

      <div class="mg-oobe-grid">
        <div class="mg-oobe-options" role="radiogroup" aria-label="Σετ Εργαλειοθήκης">
          ${cardsHtml}
        </div>

        <div class="mg-oobe-showcase" aria-live="polite">
          <div class="mg-oobe-slide" key="${activePreset.key}">
            <div class="mg-oobe-slide-head">
              <div>
                <div class="mg-oobe-slide-name">${activePreset.title}</div>
                <div class="mg-oobe-slide-desc">${activePreset.desc}</div>
              </div>
              <div class="mg-oobe-slide-stats">${counts.groups} ομάδες · ${counts.items} σύμβολα</div>
            </div>

            <div class="mg-oobe-samples-grid" aria-label="Δείγμα συμβόλων">
              ${samplesHtml}
            </div>

            <ul class="mg-oobe-hi-list">
              ${highlightsHtml}
            </ul>
          </div>

          <div class="mg-oobe-slide-bar">
            <div class="mg-oobe-slide-nav">
              <button type="button" class="mg-oobe-nav-btn" id="mg-oobe-prev-slide" title="Προηγούμενη διαφάνεια" aria-label="Προηγούμενη διαφάνεια">&#8249;</button>
              <div class="mg-oobe-dots">${dotsHtml}</div>
              <button type="button" class="mg-oobe-nav-btn" id="mg-oobe-next-slide" title="Επόμενη διαφάνεια" aria-label="Επόμενη διαφάνεια">&#8250;</button>
            </div>
            <button
              type="button"
              class="mg-oobe-play-btn${oobeAutoPlaying ? ' is-playing' : ''}"
              id="mg-oobe-autoplay-toggle"
              aria-pressed="${oobeAutoPlaying}"
              title="${oobeAutoPlaying ? 'Παύση αυτόματης εναλλαγής διαφανειών' : 'Συνέχιση αυτόματης εναλλαγής διαφανειών'}"
            >
              ${oobeAutoPlaying ? 'Παύση διαφανειών' : 'Αυτόματη προβολή'}
            </button>
          </div>
          <div class="mg-oobe-timer-track" aria-hidden="true">
            <div class="mg-oobe-timer-fill${oobeAutoPlaying && !prefersReducedMotion() ? ' is-animating' : ''}"></div>
          </div>
        </div>
      </div>

      <div class="mg-oobe-footer">
        <button type="button" class="mg-tut-btn mg-tut-btn-ghost" id="mg-oobe-skip">Παράλειψη</button>
        <button type="button" class="mg-tut-btn mg-tut-btn-primary" id="mg-oobe-confirm">Συνέχεια με «${activePreset.title}»</button>
      </div>
    </div>
  `;

  oobeOverlayEl.querySelectorAll('[data-oobe-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-oobe-idx'));
      if (!Number.isFinite(idx)) return;
      oobeSlideIdx = clamp(idx, 0, OOBE_PRESETS.length - 1);
      oobeAutoPlaying = false;
      stopOobeAutoTimer();
      applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
      renderOobeModal();
    });
  });

  oobeOverlayEl.querySelectorAll('[data-oobe-dot]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-oobe-dot'));
      if (!Number.isFinite(idx)) return;
      oobeSlideIdx = clamp(idx, 0, OOBE_PRESETS.length - 1);
      oobeAutoPlaying = false;
      stopOobeAutoTimer();
      applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
      renderOobeModal();
    });
  });

  $('#mg-oobe-prev-slide')?.addEventListener('click', () => {
    oobeSlideIdx = (oobeSlideIdx - 1 + OOBE_PRESETS.length) % OOBE_PRESETS.length;
    oobeAutoPlaying = false;
    stopOobeAutoTimer();
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
    renderOobeModal();
  });

  $('#mg-oobe-next-slide')?.addEventListener('click', () => {
    oobeSlideIdx = (oobeSlideIdx + 1) % OOBE_PRESETS.length;
    oobeAutoPlaying = false;
    stopOobeAutoTimer();
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
    renderOobeModal();
  });

  $('#mg-oobe-autoplay-toggle')?.addEventListener('click', () => {
    oobeAutoPlaying = !oobeAutoPlaying;
    renderOobeModal();
    if (oobeAutoPlaying) scheduleOobeAutoAdvance();
    else stopOobeAutoTimer();
  });

  $('#mg-oobe-confirm')?.addEventListener('click', () => {
    closeDatasetChooser(true, true);
  });

  $('#mg-oobe-skip')?.addEventListener('click', () => {
    closeDatasetChooser(false, true);
  });

  $('#mg-oobe-close-x')?.addEventListener('click', () => {
    closeDatasetChooser(false, true);
  });

  oobeOverlayEl.querySelector('[data-oobe-dismiss="true"]')?.addEventListener('click', () => {
    closeDatasetChooser(false, true);
  });
}

export function isDatasetChooserOpen() {
  return oobeOpen;
}

export function openDatasetChooser(force = true, chainTutorialAfter = false) {
  if (!force) {
    try {
      if (localStorage.getItem(DATASET_CHOSEN_KEY) === 'true') return false;
    } catch { }
  }
  if (oobeOpen) return true;

  oobeInitialDataset = state.dataset || 'codecogs_alike';
  oobeAfterCloseTutorialCheck = Boolean(chainTutorialAfter);
  const idx = OOBE_PRESETS.findIndex(p => p.key === oobeInitialDataset);
  oobeSlideIdx = idx !== -1 ? idx : 1;
  oobeAutoPlaying = true;
  oobeOpen = true;

  if (!force) {
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
  }

  ensureOobeMounted();
  oobeOverlayEl.classList.add('active');
  document.body.classList.add('oobe-open');
  renderOobeModal();
  scheduleOobeAutoAdvance();
  return true;
}

export function closeDatasetChooser(applySelected = true, markChosen = true) {
  if (!oobeOpen) return;
  oobeOpen = false;
  stopOobeAutoTimer();

  const chosenKey = applySelected
    ? (OOBE_PRESETS[oobeSlideIdx]?.key || 'codecogs_alike')
    : oobeInitialDataset;

  applyDatasetLive(chosenKey, applySelected);

  if (markChosen) {
    try {
      localStorage.setItem(DATASET_CHOSEN_KEY, 'true');
    } catch { }
  }

  oobeOverlayEl?.classList.remove('active');
  document.body.classList.remove('oobe-open');

  if (oobeAfterCloseTutorialCheck) {
    oobeAfterCloseTutorialCheck = false;
    setTimeout(() => {
      openTutorial(false);
    }, 120);
  } else {
    requestAnimationFrame(() => window.__focusActiveEditor?.());
  }
}

export function handleDatasetChooserKey(e) {
  if (!oobeOpen) return false;
  if (e.key === 'Escape') {
    e.preventDefault?.();
    closeDatasetChooser(false, true);
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault?.();
    closeDatasetChooser(true, true);
    return true;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault?.();
    oobeSlideIdx = (oobeSlideIdx + 1) % OOBE_PRESETS.length;
    oobeAutoPlaying = false;
    stopOobeAutoTimer();
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
    renderOobeModal();
    return true;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault?.();
    oobeSlideIdx = (oobeSlideIdx - 1 + OOBE_PRESETS.length) % OOBE_PRESETS.length;
    oobeAutoPlaying = false;
    stopOobeAutoTimer();
    applyDatasetLive(OOBE_PRESETS[oobeSlideIdx].key, false);
    renderOobeModal();
    return true;
  }
  return false;
}

function getAllStepDefinitions() {
  const isDesktop = isDesktopEnv();
  return [
    {
      id: 'welcome',
      mode: 'editor',
      title: 'Καλώς ήρθατε στο MathGlass',
      body:
        'Ο σύγχρονος επεξεργαστής μαθηματικών LaTeX με ζωντανή απόδοση KaTeX και ενσωματωμένο Σημειωματάριο phpBB. Ας δούμε γρήγορα τι κάνει κάθε κουμπί.',
      shortcuts: ['→ Επόμενο', '← Προηγούμενο', 'Esc Παράλειψη'],
      targets: null,
    },
    {
      id: 'toolbars',
      mode: 'editor',
      title: 'Μπάρες Συμβόλων KaTeX',
      body:
        'Κάντε κλικ σε οποιοδήποτε σύμβολο για άμεση εισαγωγή στον κώδικα. Ομάδες με ▾ ανοίγουν επιπλέον σύμβολα, ενώ το εικονίδιο πίνακα δημιουργεί προσαρμοσμένους πίνακες.',
      shortcuts: ['Alt+M Πίνακας'],
      targets: ['#toolbars-container'],
    },
    {
      id: 'symbol-search',
      mode: 'editor',
      title: 'Έξυπνη Αναζήτηση Συμβόλων',
      body:
        'Βρείτε γρήγορα σύμβολα από όλα τα σετ πληκτρολογώντας στα Ελληνικά (π.χ. κλάσμα, άπειρο, ολοκλήρωμα), στα Αγγλικά ή με εντολή LaTeX.',
      shortcuts: ['Alt+/', 'Ctrl+Shift+F'],
      targets: ['#toolbar-search-btn'],
    },
    {
      id: 'latex-editor',
      mode: 'editor',
      title: 'Επεξεργαστής Κώδικα & Αυτόματη Συμπλήρωση',
      body:
        'Γράψτε LaTeX με χρωματισμό σύνταξης και αυτόματα άγκιστρα { }. Πληκτρολογήστε \\ (και στα Ελληνικά, π.χ. \\ριζα ή \\κλασμα) για έξυπνες προτάσεις εντολών.',
      shortcuts: ['\\ + Tab/Enter Συμπλήρωση', 'Alt+J Άγκιστρα { }'],
      targets: ['#latex-highlight-wrap'],
    },
    {
      id: 'preview-led',
      mode: 'editor',
      title: 'Φωτάκι Κατάστασης & Ζωντανή Επεξεργασία',
      body:
        'Το φωτάκι δείχνει πού βρίσκεστε: γκρι όταν γράφετε Κώδικα, πράσινο όταν κάνετε κλικ μέσα στη ζωντανή προεπισκόπηση για άμεση επεξεργασία (υποστηρίζει /, *, ^, _, βελάκια & Tab).',
      shortcuts: ['Κλικ στην προεπισκόπηση = WYSIWYG', 'Alt+9 Κέρσορας'],
      targets: ['#preview-nav-indicator'],
    },
    {
      id: 'preview-controls',
      mode: 'editor',
      title: 'Κλίμακα & Στοίχιση Προεπισκόπησης',
      body:
        'Το AUTO προσαρμόζει αυτόματα το μέγεθος, το εικονίδιο βέλους εναλλάσσει κεντρική / αριστερή στοίχιση και τα − / + αλλάζουν το zoom της εξίσωσης.',
      shortcuts: ['Alt+0 AUTO', 'Alt+A Στοίχιση', 'Alt+- / Alt+= Zoom'],
      targets: ['.preview-controls'],
    },
    {
      id: 'footer-controls',
      mode: 'editor',
      title: 'Μορφοποίηση Εξαγωγής & Κάτω Μπάρα',
      body:
        isDesktop
          ? 'Ενεργοποιήστε περιτύλιξη $, \\textstyle ή \\displaystyle, συμπτύξτε τους διακόπτες (▾), αντιγράψτε την εξίσωση ή εξάγετέ τη σε PNG, PDF, SVG, HTML, Markdown, MathML & BBCode.'
          : 'Ενεργοποιήστε περιτύλιξη $, \\textstyle ή \\displaystyle, συμπτύξτε τους διακόπτες (▾), αντιγράψτε, εξάγετε (PNG, PDF, SVG, MathML, BBCode) ή εισαγάγετε κατευθείαν στη σελίδα.',
      shortcuts: isDesktop
        ? ['Alt+1/2/3 Διακόπτες', 'Alt+V Σύμπτυξη', 'Alt+C Αντιγραφή', 'Alt+Z Εξαγωγή']
        : ['Alt+1/2/3', 'Alt+C Αντιγραφή', 'Alt+Z Εξαγωγή', 'Ctrl+Enter Εισαγωγή'],
      targets: ['footer'],
    },
    {
      id: 'header-settings-recent',
      mode: 'editor',
      title: 'Ρυθμίσεις & Πρόσφατα / Ιστορικό',
      body:
        'Το γρανάζι ανοίγει τις Ρυθμίσεις (σετ συμβόλων, γραμματοσειρές, χρωματισμός, Σταθερός Κέρσορας). Το ρολόι εμφανίζει τα πρόσφατα σύμβολα, το ιστορικό και τις αγαπημένες εξισώσεις (★).',
      shortcuts: ['Alt+S Ρυθμίσεις', 'Alt+R Πρόσφατα'],
      targets: ['#settings-toggle', '#recent-toggle'],
    },
    {
      id: 'header-modes-view',
      mode: 'editor',
      title: 'Σημειωματάριο, Διαφάνεια & Εμφάνιση',
      body:
        'Από αριστερά: άνοιγμα Σημειωματάριου phpBB, διαφάνεια παραθύρου' +
        (!isDesktop ? ' & εφέ θολώματος (Blur)' : '') +
        ', απόκρυψη προεπισκόπησης, απόκρυψη εργαλειοθήκης συμβόλων και αλλαγή φωτεινού/σκοτεινού θέματος.',
      shortcuts: ['Alt+N Σημειωματάριο', 'Alt+O Διαφάνεια', 'Alt+P / Alt+K', 'Alt+T Θέμα'],
      targets: ['#notepad-toggle', '#theme-toggle'],
    },
    ...(isDesktop
      ? [
          {
            id: 'header-desktop',
            mode: 'editor',
            title: 'Έλεγχος Παραθύρου Desktop',
            body:
              'Καρφιτσώστε το παράθυρο ώστε να μένει πάντα πάνω από άλλα προγράμματα (πινέζα), ελαχιστοποιήστε, μεγιστοποιήστε ή κλείστε το.',
            shortcuts: ['Alt+Shift+P Καρφίτσωμα', 'Alt+Shift+M / F / Q'],
            targets: ['#desktop-pin-btn', '#desktop-close-btn'],
          },
        ]
      : []),
    {
      id: 'phpbb-toolbar',
      mode: 'notepad',
      title: 'Εργαλειοθήκη BBCode (phpBB)',
      body:
        'Πλήρης μορφοποίηση φόρουμ: επικεφαλίδες H1–H7, Έντονα/Πλάγια/Υπογράμμιση, μέγεθος, χρώμα, λίστες, URL, IMG, Quote, Code, [tex], [ggb] και [hide].',
      shortcuts: ['Ctrl+B/I/U', 'Ctrl+K Σύνδεσμος', 'Alt+X [tex]', 'Alt+Y [hide]'],
      targets: ['#phpbb-toolbar'],
    },
    {
      id: 'notepad-preview-controls',
      mode: 'notepad',
      title: 'Προεπισκόπηση, Κώδικας & Ανάγνωση',
      body:
        'Κάντε κλικ στο κείμενο για άμεση WYSIWYG επεξεργασία (πράσινο φωτάκι). Αλλάξτε διάταξη (Κάτω/Δεξιά), εμφανίστε διπλή προβολή Κώδικα LaTeX ή ανοίξτε πλήρη Λειτουργία Ανάγνωσης.',
      shortcuts: ['Ctrl+W / Alt+W Κώδικας', 'Alt+F Ανάγνωση', 'Alt+Shift+D Διάταξη'],
      targets: ['.notepad-preview-header'],
    },
    {
      id: 'notepad-footer',
      mode: 'notepad',
      title: 'Κλίμακα, Εισαγωγή & Εξαγωγή Κειμένου',
      body:
        'Ρυθμίστε το μέγεθος κειμένου (Aa−/Aa+), τραβήξτε με ένα κλικ την εξίσωση από τον Editor (+ Από Editor), καθαρίστε ή εξάγετε σε PNG, PDF, SVG, HTML, Markdown και BBCode.',
      shortcuts: ['Alt+E + Από Editor', 'Alt+C Αντιγραφή', 'Alt+Z Εξαγωγή'],
      targets: ['.notepad-footer'],
    },
    {
      id: 'finish',
      mode: 'editor',
      title: 'Είστε έτοιμοι!',
      body:
        'Μπορείτε να ανοίξετε ξανά αυτόν τον οδηγό ανά πάσα στιγμή από το κουμπί ? στην πάνω μπάρα (F1) ή μέσα από τις Ρυθμίσεις.',
      shortcuts: ['Alt+N Editor ↔ Σημειωματάριο', 'F1 Οδηγός'],
      targets: ['#tutorial-toggle'],
      optionalTargets: true,
    },
  ];
}

function getCombinedVisibleRect(selectors) {
  if (!selectors || !selectors.length) return null;
  let minL = Infinity;
  let minT = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  let found = 0;

  for (const sel of selectors) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    minL = Math.min(minL, r.left);
    minT = Math.min(minT, r.top);
    maxR = Math.max(maxR, r.right);
    maxB = Math.max(maxB, r.bottom);
    found++;
  }

  if (!found) return null;
  return {
    left: minL,
    top: minT,
    right: maxR,
    bottom: maxB,
    width: maxR - minL,
    height: maxB - minT,
  };
}

function ensureOverlayMounted() {
  if (overlayEl && document.body.contains(overlayEl)) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'mg-tut-overlay';
  overlayEl.id = 'mg-tutorial-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-labelledby', 'mg-tut-title');

  backdropEl = document.createElement('div');
  backdropEl.className = 'mg-tut-backdrop';

  spotlightEl = document.createElement('div');
  spotlightEl.className = 'mg-tut-spotlight';

  cardEl = document.createElement('div');
  cardEl.className = 'mg-tut-card';

  overlayEl.appendChild(backdropEl);
  overlayEl.appendChild(spotlightEl);
  overlayEl.appendChild(cardEl);
  document.body.appendChild(overlayEl);

  backdropEl.addEventListener('click', () => {
    closeTutorial(true);
  });
}

function positionCardAndSpotlight(step) {
  if (!tutorialOpen || !overlayEl || !spotlightEl || !cardEl || !backdropEl) return;
  const vw = window.innerWidth || document.documentElement.clientWidth || 640;
  const vh = window.innerHeight || document.documentElement.clientHeight || 520;
  const rect = getCombinedVisibleRect(step.targets);

  if (rect) {
    const pad = 5;
    const sLeft = clamp(rect.left - pad, 4, vw - 12);
    const sTop = clamp(rect.top - pad, 4, vh - 12);
    const sRight = clamp(rect.right + pad, sLeft + 8, vw - 4);
    const sBottom = clamp(rect.bottom + pad, sTop + 8, vh - 4);
    const sWidth = sRight - sLeft;
    const sHeight = sBottom - sTop;

    spotlightEl.style.display = 'block';
    spotlightEl.style.left = `${Math.round(sLeft)}px`;
    spotlightEl.style.top = `${Math.round(sTop)}px`;
    spotlightEl.style.width = `${Math.round(sWidth)}px`;
    spotlightEl.style.height = `${Math.round(sHeight)}px`;
    backdropEl.classList.remove('mg-tut-backdrop--full');

    cardEl.style.visibility = 'hidden';
    cardEl.style.display = 'flex';
    const cardRect = cardEl.getBoundingClientRect();
    const cw = cardRect.width || Math.min(340, vw - 24);
    const ch = cardRect.height || 190;
    const gap = 12;

    const spaceBelow = vh - sBottom - 12;
    const spaceAbove = sTop - 12;

    let top;
    if (spaceBelow >= ch + gap) {
      top = sBottom + gap;
    } else if (spaceAbove >= ch + gap) {
      top = sTop - ch - gap;
    } else if (sHeight > vh * 0.55) {
      top = clamp((vh - ch) / 2, 12, Math.max(12, vh - ch - 12));
    } else {
      top = spaceBelow >= spaceAbove
        ? clamp(sBottom + gap, 12, Math.max(12, vh - ch - 12))
        : clamp(sTop - ch - gap, 12, Math.max(12, vh - ch - 12));
    }

    const centerTargetX = sLeft + sWidth / 2;
    const left = clamp(centerTargetX - cw / 2, 12, Math.max(12, vw - cw - 12));

    cardEl.style.left = `${Math.round(left)}px`;
    cardEl.style.top = `${Math.round(top)}px`;
    cardEl.style.visibility = 'visible';
  } else {
    spotlightEl.style.display = 'none';
    backdropEl.classList.add('mg-tut-backdrop--full');
    cardEl.style.visibility = 'hidden';
    cardEl.style.display = 'flex';
    const cardRect = cardEl.getBoundingClientRect();
    const cw = cardRect.width || Math.min(350, vw - 24);
    const ch = cardRect.height || 200;
    cardEl.style.left = `${Math.round(Math.max(12, (vw - cw) / 2))}px`;
    cardEl.style.top = `${Math.round(Math.max(12, (vh - ch) / 2))}px`;
    cardEl.style.visibility = 'visible';
  }
}

function renderStepContent(step, idx, total) {
  if (!cardEl) return;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  const chipsHtml = (step.shortcuts || [])
    .map(sc => `<span class="mg-tut-kbd">${sc}</span>`)
    .join('');

  cardEl.innerHTML = `
    <div class="mg-tut-head">
      <span class="mg-tut-badge">Οδηγός ${idx + 1} / ${total}</span>
      <button type="button" class="mg-tut-skip-x" id="mg-tut-close-x" title="Παράλειψη οδηγού (Esc)" aria-label="Κλείσιμο οδηγού">&times;</button>
    </div>
    <h3 class="mg-tut-title" id="mg-tut-title">${step.title}</h3>
    <p class="mg-tut-body">${step.body}</p>
    ${chipsHtml ? `<div class="mg-tut-kbds">${chipsHtml}</div>` : ''}
    <div class="mg-tut-progress" aria-hidden="true">
      <div class="mg-tut-progress-bar" style="width:${Math.round(((idx + 1) / total) * 100)}%"></div>
    </div>
    <div class="mg-tut-actions">
      <button type="button" class="mg-tut-btn mg-tut-btn-ghost" id="mg-tut-skip">Παράλειψη</button>
      <div class="mg-tut-nav-btns">
        <button type="button" class="mg-tut-btn mg-tut-btn-ghost" id="mg-tut-prev" ${isFirst ? 'disabled' : ''}>Προηγ.</button>
        <button type="button" class="mg-tut-btn mg-tut-btn-primary" id="mg-tut-next">${isLast ? 'Τέλος' : 'Επόμενο'}</button>
      </div>
    </div>
  `;

  $('#mg-tut-close-x')?.addEventListener('click', () => closeTutorial(true));
  $('#mg-tut-skip')?.addEventListener('click', () => closeTutorial(true));
  $('#mg-tut-prev')?.addEventListener('click', () => goToStep(currentStepIdx - 1, -1));
  $('#mg-tut-next')?.addEventListener('click', () => {
    if (isLast) closeTutorial(true);
    else goToStep(currentStepIdx + 1, 1);
  });
}

function applyStepMode(mode) {
  toolbar.closeAllPopups?.();
  if (mode === 'notepad') {
    if (!document.body.classList.contains('notepad-open')) {
      window.__setNotepadOpen?.(true);
    }
    if (window.__getNotepadViewMode?.() === 'reader') {
      window.__setNotepadViewMode?.('wysiwyg', { silentFocus: true });
    }
  } else {
    if (document.body.classList.contains('notepad-open')) {
      window.__setNotepadOpen?.(false);
    }
  }
}

function goToStep(idx, dir = 1) {
  if (!tutorialOpen) return;
  const total = activeSteps.length;
  if (!total) {
    closeTutorial(true);
    return;
  }
  const bounded = clamp(idx, 0, total - 1);
  currentStepIdx = bounded;
  const step = activeSteps[bounded];
  const token = ++stepPrepToken;

  applyStepMode(step.mode);
  renderStepContent(step, bounded, total);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!tutorialOpen || token !== stepPrepToken) return;
      if (step.targets && !step.optionalTargets && !getCombinedVisibleRect(step.targets)) {
        const nextIdx = bounded + dir;
        if (nextIdx >= 0 && nextIdx < total) {
          goToStep(nextIdx, dir);
          return;
        }
      }
      positionCardAndSpotlight(step);
    });
  });
}

export function isTutorialOpen() {
  return tutorialOpen;
}

export function openTutorial(force = true) {
  if (!force) {
    try {
      if (localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true') return;
    } catch { }
  }
  if (tutorialOpen || oobeOpen) return;

  initialNotepadOpen = document.body.classList.contains('notepad-open');
  initialNotepadViewMode = window.__getNotepadViewMode?.() || 'wysiwyg';
  activeSteps = getAllStepDefinitions();
  currentStepIdx = 0;
  tutorialOpen = true;

  ensureOverlayMounted();
  overlayEl.classList.add('active');
  document.body.classList.add('tutorial-open');
  $('#tutorial-toggle')?.classList.add('active');

  goToStep(0, 1);
}

export function closeTutorial(markSeen = true) {
  if (!tutorialOpen) return;
  tutorialOpen = false;
  stepPrepToken++;

  if (markSeen) {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
    } catch { }
  }

  overlayEl?.classList.remove('active');
  document.body.classList.remove('tutorial-open');
  $('#tutorial-toggle')?.classList.remove('active');

  const wantNotepad = Boolean(initialNotepadOpen);
  if (document.body.classList.contains('notepad-open') !== wantNotepad) {
    window.__setNotepadOpen?.(wantNotepad);
  }
  if (wantNotepad && initialNotepadViewMode && initialNotepadViewMode !== window.__getNotepadViewMode?.()) {
    window.__setNotepadViewMode?.(initialNotepadViewMode, { silentFocus: true });
  }
  requestAnimationFrame(() => {
    window.__focusActiveEditor?.();
  });
}

export function handleTutorialKey(e) {
  if (!tutorialOpen) return false;
  if (e.key === 'Escape') {
    e.preventDefault?.();
    closeTutorial(true);
    return true;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault?.();
    if (currentStepIdx >= activeSteps.length - 1) closeTutorial(true);
    else goToStep(currentStepIdx + 1, 1);
    return true;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault?.();
    if (currentStepIdx > 0) goToStep(currentStepIdx - 1, -1);
    return true;
  }
  return false;
}

export function init(ac) {
  const sig = ac.signal;
  window.__isTutorialOpen = isTutorialOpen;
  window.__openTutorial = openTutorial;
  window.__closeTutorial = closeTutorial;
  window.__handleTutorialKey = handleTutorialKey;
  window.__isDatasetChooserOpen = isDatasetChooserOpen;
  window.__openDatasetChooser = openDatasetChooser;
  window.__closeDatasetChooser = closeDatasetChooser;
  window.__handleDatasetChooserKey = handleDatasetChooserKey;

  on($('#tutorial-toggle'), 'click', () => {
    if (oobeOpen) closeDatasetChooser(false, true);
    if (tutorialOpen) closeTutorial(true);
    else openTutorial(true);
  }, false, sig);

  on($('#tutorial-replay-btn'), 'click', () => {
    toolbar.closeAllPopups?.();
    openTutorial(true);
  }, false, sig);

  let posRaf = 0;
  const reposition = () => {
    if (!tutorialOpen || posRaf) return;
    posRaf = requestAnimationFrame(() => {
      posRaf = 0;
      const step = activeSteps[currentStepIdx];
      if (step) positionCardAndSpotlight(step);
    });
  };
  on(window, 'resize', reposition, false, sig);

  const bootTimer = setTimeout(() => {
    if (sig.aborted) return;
    const openedOobe = openDatasetChooser(false, true);
    if (!openedOobe) {
      openTutorial(false);
    }
  }, 320);

  sig.addEventListener('abort', () => {
    clearTimeout(bootTimer);
    stopOobeAutoTimer();
    if (posRaf) cancelAnimationFrame(posRaf);
    tutorialOpen = false;
    oobeOpen = false;
    document.body.classList.remove('tutorial-open', 'oobe-open');
    overlayEl?.remove();
    overlayEl = null;
    backdropEl = null;
    spotlightEl = null;
    cardEl = null;
    oobeOverlayEl?.remove();
    oobeOverlayEl = null;
  }, { once: true });
}
