// Wrapping της τρέχουσας εξίσωσης με \textstyle / \displaystyle / $ για export.
import { $ } from '../../core/dom.js';
import { state } from '../settings.js';

export function wrappedCode() {
  let code = state.ta.value;
  const d = $('#displaystyle-toggle')?.checked;
  const t = $('#inline-toggle')?.checked;
  const $w = $('#tex-toggle')?.checked;
  if (t && d) code = `\\textstyle { \\displaystyle { ${code} } }`;
  else if (d) code = `\\displaystyle { ${code} }`;
  else if (t) code = `\\textstyle { ${code} }`;
  if ($w) code = `$${code}$`;
  return code;
}