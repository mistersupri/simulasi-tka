/**
 * Pewarnaan kode untuk soal pemrograman. Dimuat malas (lihat TeksKaya) agar halaman siswa
 * tidak mengunduh highlight.js bila soal tidak berisi kode.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import pascal from 'highlight.js/lib/languages/delphi';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('pascal', pascal);
hljs.registerLanguage('php', php);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('xml', xml);

const ALIAS: Record<string, string> = { html: 'xml', py: 'python', js: 'javascript', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', sh: 'bash', shell: 'bash', delphi: 'pascal' };

/** HTML berwarna (sudah di-escape oleh highlight.js), atau null bila bahasa tidak dikenal. */
export function sorotKode(kode: string, bahasa: string): string | null {
  const nama = ALIAS[bahasa] ?? bahasa;
  if (!hljs.getLanguage(nama)) return null;
  return hljs.highlight(kode, { language: nama, ignoreIllegals: true }).value;
}
