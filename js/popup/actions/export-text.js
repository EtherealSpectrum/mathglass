// Text-based exports — BBCode→Markdown, notepad→Markdown, notepad→LaTeX.
import { tokenizeHybridLatex } from '../notepad.js';

export function convertBbcodeChunkToMarkdown(chunk) {
  let out = chunk;
  for (let pass = 0; pass < 4; pass++) {
    out = out
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '~~$1~~')
      .replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi, '$1')
      .replace(/\[color=[^\]]+\]([\s\S]*?)\[\/color\]/gi, '$1')
      .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (_, inner) => `\n<div align="center">\n\n${inner.trim()}\n\n</div>\n`);
  }
  out = out
    .replace(/\[img(?:=[^\]]*)?\]([\s\S]*?)\[\/img\]/gi, (_, src) => `![Εικόνα](${src.trim()})`)
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => `[${label}](${href.trim()})`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `<${href.trim()}>`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `> 📐 **GeoGebra:** \`${id.trim()}\``)
    .replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
      const rows = [];
      const trRe = /\[tr\]([\s\S]*?)\[\/tr\]/gi;
      let trM;
      while ((trM = trRe.exec(inner)) !== null) {
        const cells = [];
        const cellRe = /\[(th|td)\]([\s\S]*?)\[\/\1\]/gi;
        let cM;
        while ((cM = cellRe.exec(trM[1])) !== null) {
          cells.push(cM[2].trim().replace(/\|/g, '\\|').replace(/\r?\n+/g, ' '));
        }
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return inner;
      const cols = Math.max(...rows.map(r => r.length));
      const pad = r => Array.from({ length: cols }, (_, i) => r[i] ?? '');
      const header = `| ${pad(rows[0]).join(' | ')} |`;
      const sep = `| ${Array(cols).fill('---').join(' | ')} |`;
      const body = rows.slice(1).map(r => `| ${pad(r).join(' | ')} |`);
      return `\n${[header, sep, ...body].join('\n')}\n`;
    })
    .replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, listType, inner) => {
      const items = inner.split(/\[\*\]/i).slice(1).map(x => x.trim()).filter(Boolean);
      if (!items.length) return inner.trim();
      return '\n' + items.map((item, idx) => (listType ? `${idx + 1}. ${item}` : `- ${item}`)).join('\n') + '\n';
    })
    .replace(/\[quote(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
      const author = (q1 || q2 || '').trim();
      const head = author ? `> **${author} έγραψε:**\n>\n` : '';
      return '\n' + head + inner.trim().split(/\r?\n/).map(l => `> ${l}`).join('\n') + '\n';
    })
    .replace(/\[hide(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
      const title = (q1 || q2 || 'Κρυφό περιεχόμενο').trim();
      return `\n<details>\n<summary>${title}</summary>\n\n${inner.trim()}\n\n</details>\n`;
    });
  return out;
}

export function convertNotepadToMarkdown(raw) {
  const tokens = tokenizeHybridLatex(raw);
  const placeholders = [];
  let assembled = '';
  for (const tok of tokens) {
    if (tok.type === 'code') {
      const idx = placeholders.length;
      placeholders.push(`\n\`\`\`\n${tok.content.trim()}\n\`\`\`\n`);
      assembled += `@@MG_MD_SLOT_${idx}@@`;
    } else if (tok.type === 'math') {
      const idx = placeholders.length;
      const body = tok.content.trim();
      placeholders.push(tok.display ? `\n$$\n${body}\n$$\n` : `$${body}$`);
      assembled += `@@MG_MD_SLOT_${idx}@@`;
    } else {
      assembled += tok.content;
    }
  }
  const md = convertBbcodeChunkToMarkdown(assembled);
  return md.replace(/@@MG_MD_SLOT_(\d+)@@/g, (_, idx) => placeholders[Number(idx)] ?? '');
}

export function escapeLatexText(str) {
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

export function convertNotepadToLatex(raw) {
  const tokens = tokenizeHybridLatex(raw);
  const slots = [];
  const urlSlots = [];
  let assembled = '';
  for (const tok of tokens) {
    if (tok.type === 'code') {
      const idx = slots.length;
      slots.push(`\n\\begin{verbatim}\n${tok.content.trim()}\n\\end{verbatim}\n`);
      assembled += `@@MGTEXSLOT${idx}@@`;
    } else if (tok.type === 'math') {
      const idx = slots.length;
      const body = tok.content.trim();
      slots.push(tok.display ? `\n\\[\n${body}\n\\]\n` : `$${body}$`);
      assembled += `@@MGTEXSLOT${idx}@@`;
    } else {
      assembled += tok.content.replace(/\\\$/g, '$');
    }
  }

  const pushUrlSlot = val => {
    const idx = urlSlots.length;
    urlSlots.push(String(val || '').trim().replace(/[\r\n]+/g, ' '));
    return `@@MGURLSLOT${idx}@@`;
  };
  assembled = assembled
    .replace(/\[url=([^\]]+)\]/gi, (_, href) => `[url=${pushUrlSlot(href)}]`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `[url]${pushUrlSlot(href)}[/url]`)
    .replace(/\[img(?:=([^\]]*))?\]([\s\S]*?)\[\/img\]/gi, (_, sizeAttr, src) => `[img${sizeAttr ? `=${sizeAttr}` : ''}]${pushUrlSlot(src)}[/img]`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `[ggb]${pushUrlSlot(id)}[/ggb]`);

  let texBody = escapeLatexText(assembled);
  for (let pass = 0; pass < 4; pass++) {
    texBody = texBody
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '\\textbf{$1}')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '\\textit{$1}')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '\\underline{$1}')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '$1')
      .replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi, '$1')
      .replace(/\[color=[^\]]+\]([\s\S]*?)\[\/color\]/gi, '$1')
      .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (_, inner) => `\n\\begin{center}\n${inner.trim()}\n\\end{center}\n`);
  }
  texBody = texBody
    .replace(/\[img(?:=[^\]]*)?\]([\s\S]*?)\[\/img\]/gi, (_, src) => `% Εικόνα: ${src.trim()}`)
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => `\\href{${href.trim()}}{${label}}`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `\\url{${href.trim()}}`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `% GeoGebra: ${id.trim()}`)
    .replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, listType, inner) => {
      const env = listType ? 'enumerate' : 'itemize';
      const items = inner.split(/\[\*\]/i).slice(1).map(x => x.trim()).filter(Boolean);
      if (!items.length) return inner;
      return `\n\\begin{${env}}\n${items.map(it => `  \\item ${it}`).join('\n')}\n\\end{${env}}\n`;
    })
    .replace(/\[quote(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
      const author = (q1 || q2 || '').trim();
      const head = author ? `\\textbf{${author}:} ` : '';
      return `\n\\begin{quote}\n${head}${inner.trim()}\n\\end{quote}\n`;
    })
    .replace(/\[hide(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
      const title = (q1 || q2 || 'Λύση').trim();
      return `\n\\paragraph{${title}}\n${inner.trim()}\n`;
    })
    .replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
      const rows = [];
      const trRe = /\[tr\]([\s\S]*?)\[\/tr\]/gi;
      let trM;
      while ((trM = trRe.exec(inner)) !== null) {
        const cells = [];
        const cellRe = /\[(th|td)\]([\s\S]*?)\[\/\1\]/gi;
        let cM;
        while ((cM = cellRe.exec(trM[1])) !== null) cells.push(cM[2].trim());
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return inner;
      const cols = Math.max(...rows.map(r => r.length));
      const spec = Array(cols).fill('l').join(' | ');
      const lines = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' & ') + ' \\\\ \\hline');
      return `\n\\begin{tabular}{| ${spec} |}\n\\hline\n${lines.join('\n')}\n\\end{tabular}\n`;
    });

  texBody = texBody
    .replace(/@@MGURLSLOT(\d+)@@/g, (_, idx) => urlSlots[Number(idx)] ?? '')
    .replace(/@@MGTEXSLOT(\d+)@@/g, (_, idx) => slots[Number(idx)] ?? '');

  return `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[greek,english]{babel}
\\usepackage{amsmath,amssymb,hyperref}

\\begin{document}
${texBody.trim()}
\\end{document}
`;
}