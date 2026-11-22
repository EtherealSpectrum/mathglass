const fs = require('fs');
const path = require('path');

const desktopDir = __dirname;
const rootDir = path.resolve(desktopDir, '..');
const bundleDir = path.join(desktopDir, '.bundle');
const outDir = path.join(bundleDir, 'web');

if (!fs.existsSync(path.join(rootDir, 'popup.html'))) {
  console.error('Σφάλμα: Δεν βρέθηκε το ../popup.html. Εκτελέστε το release build από τον φάκελο desktop/ μέσα στο αποσυμπιεσμένο πακέτο MathGlass.');
  process.exit(1);
}

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyRecursive(src, dest, shouldSkip) {
  if (!fs.existsSync(src)) return 0;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(src)) {
      const childSrc = path.join(src, entry);
      const childDest = path.join(dest, entry);
      if (shouldSkip && shouldSkip(childSrc)) continue;
      count += copyRecursive(childSrc, childDest, shouldSkip);
    }
    return count;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return 1;
}

let copied = 0;
copied += copyRecursive(path.join(rootDir, 'popup.html'), path.join(outDir, 'popup.html'));
copied += copyRecursive(path.join(rootDir, 'THIRD-PARTY-LICENSES.txt'), path.join(outDir, 'THIRD-PARTY-LICENSES.txt'));
copied += copyRecursive(path.join(rootDir, 'css'), path.join(outDir, 'css'));
copied += copyRecursive(path.join(rootDir, 'icons'), path.join(outDir, 'icons'));

const libCount = copyRecursive(path.join(rootDir, 'lib'), path.join(outDir, 'lib'));
copied += libCount;
if (libCount === 0) {
  console.warn('Προειδοποίηση: Ο φάκελος ../lib/ (KaTeX, html2canvas, jspdf) δεν βρέθηκε. Βεβαιωθείτε ότι υπάρχει στο root πριν το τελικό πακέτο Release.');
}

copied += copyRecursive(path.join(rootDir, 'js'), path.join(outDir, 'js'), srcPath => {
  const rel = path.relative(path.join(rootDir, 'js'), srcPath).replace(/\\/g, '/');
  return rel === 'background.js' || rel === 'content' || rel.startsWith('content/');
});

console.log(`MathGlass Desktop: Προετοιμάστηκαν ${copied} αρχεία στο .bundle/web για το release.`);
