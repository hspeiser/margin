import { lookupUnit } from './units';

export type TokType = 'num' | 'word' | 'sym' | 'op' | 'lp' | 'rp' | 'comma' | 'time' | 'date' | 'text';

export type Role =
  | 'number'
  | 'unit'
  | 'currency'
  | 'keyword'
  | 'op'
  | 'function'
  | 'variable'
  | 'constant'
  | 'date'
  | 'text'
  | 'scale'
  | 'paren';

export interface Token {
  t: TokType;
  /** Source text (ops are normalized: × → *, − → -). */
  s: string;
  /** Lowercased s. */
  lo: string;
  start: number;
  end: number;
  /** Preceded by whitespace. */
  sp: boolean;
  v?: number;
  isInt?: boolean;
  ordinal?: boolean;
  /** A word we didn't recognize followed this number ("5 blargs"). */
  unknownAfter?: string;
  /** A word we didn't recognize followed this conversion keyword ("in blargs"). */
  unknownTarget?: string;
  time?: { h: number; m: number; s: number };
  date?: { y: number; mo: number; d: number; h?: number; mi?: number; sec?: number };
  role?: Role;
}

export interface LexOptions {
  /** Lowercase multi-word phrases to merge into a single word token. */
  phrases: { has(key: string): boolean };
  maxPhraseWords: number;
}

const OP_MAP: Record<string, string> = {
  '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '⋅': '*', '∙': '*',
  '/': '/', '÷': '/', '∕': '/', '^': '^', '!': '!', '%': '%', '&': '&', '|': '|', '=': '=', '@': '@',
};

const VULGAR: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8, '⅐': 1 / 7,
  '⅑': 1 / 9, '⅒': 1 / 10,
};

const SUPERS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+', '·': '.',
};

const RE_ISO = /(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?!\d)/y;
/** US-style dates need a 4-digit year so they never collide with fractions: 12/25/2026 */
const RE_SLASH_DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/y;
/** 555-1234, (555) 123-4567: phone numbers are text, not subtraction */
const RE_PHONE = /(?:\(\d{3}\)\s?|\d{3}[-.\s])?\d{3}-\d{4}(?!\d)/y;
/** 1 000 000 (at least two space-separated groups of three) */
const RE_SPACED_THOUSANDS = /\d{1,3}(?: \d{3}){2,}(?![\d])/y;
/** Glued units after a number: 6ft2in, 1h30m, 2h15m30s */
const RE_GLUED = /^([\p{L}°µ]+?)(\d+(?:\.\d+)?[\p{L}°µ].*)$/u;
const RE_TIME_COLON = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([aApP])\.?[mM]\.?(?![\p{L}\d]))?(?![\d:])/uy;
const RE_TIME_AMPM = /(\d{1,2})\s*([aApP])\.?[mM]\.?(?![\p{L}\d])/uy;
const RE_HEX = /0[xX][0-9a-fA-F][0-9a-fA-F_]*/y;
const RE_BIN = /0[bB][01][01_]*/y;
const RE_OCT = /0[oO][0-7][0-7_]*/y;
const RE_DEC = /(?:\d{1,3}(?:,\d{3}(?!\d))+|\d[\d_]*)(?:\.\d+)?(?:[eE][+-]?\d+(?![\p{L}]))?|\.\d+(?:[eE][+-]?\d+)?/uy;
const RE_ORDINAL = /(?:st|nd|rd|th)(?![\p{L}\d])/iuy;
const RE_L100 = /[lL]\s?\/\s?100\s?km(?![\p{L}])/uy;
const RE_IANA = /[A-Z][a-z]+(?:_[A-Z][a-z]+)*\/[A-Z][A-Za-z_]+(?:\/[A-Z][A-Za-z_]+)?/y;

const WORD_START = /[\p{L}_°º℃℉℔ℓ‰ΩÅ]/u;
const WORD_CHAR = /[\p{L}\p{Nd}_°º]/u;
const CURRENCY_SYM = /\p{Sc}/u;
const DOT_WORDS = new Set(['sq', 'cu', 'fl', 'oz']);

let tzCache: Set<string> | null = null;
function isIana(name: string): boolean {
  if (!tzCache) {
    try {
      tzCache = new Set((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone'));
    } catch {
      tzCache = new Set();
    }
  }
  if (tzCache.has(name)) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

function match(re: RegExp, src: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(src);
}

export function lex(src: string, opts: LexOptions): Token[] {
  const out: Token[] = [];
  let i = 0;
  let sp = false;
  const n = src.length;

  const push = (tok: Omit<Token, 'lo' | 'sp'> & { lo?: string }) => {
    out.push({ ...tok, lo: tok.lo ?? tok.s.toLowerCase(), sp });
    sp = false;
  };
  const prevTok = () => out[out.length - 1];
  const prevIsDigit = (k: number) => k > 0 && /[\d.]/.test(src[k - 1]);

  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === ' ' || c === '\r' || c === '\n') {
      sp = true;
      i++;
      continue;
    }

    if ((/\d/.test(c) || c === '(') && !prevIsDigit(i)) {
      const ph = match(RE_PHONE, src, i);
      if (ph && !/[\p{L}\d]/u.test(src[i + ph[0].length] ?? '')) {
        push({ t: 'text', s: ph[0], start: i, end: i + ph[0].length });
        i += ph[0].length;
        continue;
      }
    }
    if (/\d/.test(c) && !prevIsDigit(i)) {
      const sd = match(RE_SLASH_DATE, src, i);
      if (sd && +sd[1] >= 1 && +sd[1] <= 12 && +sd[2] >= 1 && +sd[2] <= 31) {
        push({ t: 'date', s: sd[0], start: i, end: i + sd[0].length, date: { y: +sd[3], mo: +sd[1], d: +sd[2] } });
        i += sd[0].length;
        continue;
      }
      const st = match(RE_SPACED_THOUSANDS, src, i);
      if (st) {
        const v = +st[0].replace(/ /g, '');
        push({ t: 'num', s: st[0], start: i, end: i + st[0].length, v, isInt: true });
        i += st[0].length;
        continue;
      }
    }

    // ISO date
    if (/\d/.test(c) && !prevIsDigit(i)) {
      const m = match(RE_ISO, src, i);
      if (m) {
        const mo = +m[2];
        const d = +m[3];
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
          push({ t: 'date', s: m[0], start: i, end: i + m[0].length, date: { y: +m[1], mo, d, h: m[4] ? +m[4] : undefined, mi: m[5] ? +m[5] : undefined, sec: m[6] ? +m[6] : undefined } });
          i += m[0].length;
          continue;
        }
      }
      // Times: 15:30, 3:30pm, 3pm, 3 a.m.
      const tc = match(RE_TIME_COLON, src, i);
      if (tc) {
        let h = +tc[1];
        const mi = +tc[2];
        const sec = tc[3] ? +tc[3] : 0;
        const ap = tc[4]?.toLowerCase();
        if (mi < 60 && sec < 60 && ((ap && h >= 1 && h <= 12) || (!ap && h <= 24))) {
          if (ap === 'p' && h < 12) h += 12;
          if (ap === 'a' && h === 12) h = 0;
          push({ t: 'time', s: tc[0], start: i, end: i + tc[0].length, time: { h: h % 24, m: mi, s: sec } });
          i += tc[0].length;
          continue;
        }
      }
      const ta = match(RE_TIME_AMPM, src, i);
      if (ta) {
        let h = +ta[1];
        if (h >= 1 && h <= 12) {
          const ap = ta[2].toLowerCase();
          if (ap === 'p' && h < 12) h += 12;
          if (ap === 'a' && h === 12) h = 0;
          push({ t: 'time', s: ta[0], start: i, end: i + ta[0].length, time: { h, m: 0, s: 0 } });
          i += ta[0].length;
          continue;
        }
      }
    }

    // Numbers
    if (/[\d.]/.test(c) && (/\d/.test(c) || /\d/.test(src[i + 1] ?? ''))) {
      let m = match(RE_HEX, src, i) ?? match(RE_BIN, src, i) ?? match(RE_OCT, src, i);
      let v: number;
      let isInt = false;
      if (m) {
        const body = m[0].slice(2).replace(/_/g, '');
        const radix = /[xX]/.test(m[0][1]) ? 16 : /[bB]/.test(m[0][1]) ? 2 : 8;
        v = body.length > 13 ? Number(BigInt((radix === 16 ? '0x' : radix === 2 ? '0b' : '0o') + body)) : parseInt(body, radix);
        isInt = true;
      } else {
        m = match(RE_DEC, src, i)!;
        const raw = m[0].replace(/[,_]/g, '');
        v = parseFloat(raw);
        isInt = /^\d+$/.test(raw);
      }
      let end = i + m[0].length;
      // 1½
      if (VULGAR[src[end]] !== undefined) {
        v += VULGAR[src[end]];
        isInt = false;
        end++;
      }
      const tok: Omit<Token, 'lo' | 'sp'> = { t: 'num', s: src.slice(i, end), start: i, end, v, isInt };
      // 1st, 2nd, 3rd
      const om = isInt ? match(RE_ORDINAL, src, end) : null;
      if (om) {
        tok.ordinal = true;
        end += om[0].length;
        tok.end = end;
        tok.s = src.slice(i, end);
      }
      push(tok);
      i = end;
      // 2x3 → 2 * 3
      if ((src[i] === 'x' || src[i] === 'X') && /[\d.(]/.test(src[i + 1] ?? '')) {
        push({ t: 'op', s: '*', start: i, end: i + 1 });
        i++;
      }
      continue;
    }

    if (VULGAR[c] !== undefined) {
      push({ t: 'num', s: c, start: i, end: i + 1, v: VULGAR[c], isInt: false });
      i++;
      continue;
    }

    // Superscript powers: m² → m ^ 2
    if (SUPERS[c] !== undefined && c !== '·') {
      let j = i;
      let txt = '';
      while (j < n && SUPERS[src[j]] !== undefined && (src[j] !== '·' || /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(src[j + 1] ?? ''))) {
        txt += SUPERS[src[j]];
        j++;
      }
      push({ t: 'op', s: '^', start: i, end: i });
      let k = 0;
      if (txt[0] === '-' || txt[0] === '+') {
        push({ t: 'op', s: txt[0], start: i, end: i + 1 });
        k = 1;
      }
      const num = parseFloat(txt.slice(k));
      if (!Number.isNaN(num)) push({ t: 'num', s: src.slice(i + k, j), start: i + k, end: j, v: num, isInt: Number.isInteger(num) });
      i = j;
      continue;
    }

    // L/100km
    if (c === 'l' || c === 'L') {
      const m = match(RE_L100, src, i);
      if (m) {
        push({ t: 'word', s: 'L/100km', start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    // IANA zones: America/New_York
    if (/[A-Z]/.test(c)) {
      const m = match(RE_IANA, src, i);
      if (m && isIana(m[0])) {
        push({ t: 'word', s: m[0], start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }

    // Words
    if (WORD_START.test(c)) {
      let j = i + 1;
      // "°C" is a word, but in 30°15' the digits belong to the next number
      const degree = c === '°' || c === 'º';
      while (j < n) {
        if (degree ? /\p{L}/u.test(src[j]) : WORD_CHAR.test(src[j])) j++;
        else if ((src[j] === "'" || src[j] === '’') && /\p{L}/u.test(src[j + 1] ?? '') && /\p{L}/u.test(src[j - 1])) j += 2;
        else break;
      }
      let word = src.slice(i, j);
      // "20° C" / "20 ° C"
      if (degree && j === i + 1) {
        const m = /^\s*([CFKcfk])(?![\p{L}\d])/u.exec(src.slice(j));
        if (m) {
          const end = j + m[0].length;
          push({ t: 'word', s: '°' + m[1].toUpperCase(), start: i, end, lo: '°' + m[1].toLowerCase() });
          i = end;
          continue;
        }
      }
      // "6ft2in", "1h30m": split a unit glued to the next number
      const prev = prevTok();
      if (prev?.t === 'num' && !sp && /\d/.test(word)) {
        const g = RE_GLUED.exec(word);
        if (g && lookupUnit(g[1])) {
          push({ t: 'word', s: g[1], start: i, end: i + g[1].length });
          i += g[1].length;
          continue;
        }
      }
      // US$, A$, R$, CN¥
      if (j < n && CURRENCY_SYM.test(src[j])) {
        const t = lookupUnit(word + src[j]);
        if (t?.u.currency) {
          push({ t: 'sym', s: word + src[j], start: i, end: j + 1 });
          i = j + 1;
          continue;
        }
      }
      let end = j;
      if (src[j] === '.' && DOT_WORDS.has(word.toLowerCase()) && !/\d/.test(src[j + 1] ?? '')) end = j + 1;
      push({ t: 'word', s: word, start: i, end, lo: word.toLowerCase() });
      i = end;
      continue;
    }

    if (CURRENCY_SYM.test(c)) {
      push({ t: 'sym', s: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    // feet / inches / arcmin / arcsec, or quoted text
    if (c === "'" || c === '’' || c === '′') {
      const p = prevTok();
      const double = src[i + 1] === "'" || src[i + 1] === '’';
      if (p && (p.t === 'num' || p.t === 'rp')) {
        push({ t: 'op', s: double ? '"' : "'", start: i, end: i + (double ? 2 : 1) });
        i += double ? 2 : 1;
        continue;
      }
      // the arcminute symbol on its own: "in ′"
      push({ t: c === '′' ? 'word' : 'text', s: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '"' || c === '”' || c === '″' || c === '“') {
      const p = prevTok();
      // ″ is never a quotation mark, so "1 ″" is a unit too
      if (c !== '“' && p && (p.t === 'num' || p.t === 'rp') && (!sp || c === '″')) {
        push({ t: 'op', s: '"', start: i, end: i + 1 });
        i++;
        continue;
      }
      // the arcsecond symbol on its own: "in ″"
      if (c === '″') {
        push({ t: 'word', s: c, start: i, end: i + 1 });
        i++;
        continue;
      }
      // quoted text is ignored
      const close = src.slice(i + 1).search(/["”]/);
      const end = close < 0 ? n : i + 1 + close + 1;
      push({ t: 'text', s: src.slice(i, end), start: i, end });
      i = end;
      continue;
    }

    if (c === '√' || c === '∛') {
      push({ t: 'word', s: c === '√' ? 'sqrt' : 'cbrt', start: i, end: i + 1 });
      i++;
      continue;
    }
    if ((c === '-' || c === '=') && src[i + 1] === '>') {
      push({ t: 'word', s: 'to', start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === '→' || c === '⇒') {
      push({ t: 'word', s: 'to', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '~') {
      push({ t: 'op', s: '~', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') {
      push({ t: 'op', s: '^', start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ((c === '<' && src[i + 1] === '<') || (c === '>' && src[i + 1] === '>')) {
      push({ t: 'op', s: c + c, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (OP_MAP[c]) {
      push({ t: 'op', s: OP_MAP[c], start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      push({ t: 'lp', s: '(', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      push({ t: 'rp', s: ')', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (c === ',') {
      push({ t: 'comma', s: ',', start: i, end: i + 1 });
      i++;
      continue;
    }
    push({ t: 'text', s: c, start: i, end: i + 1 });
    i++;
  }
  return mergePhrases(out, src, opts);
}

/** Glue multi-word phrases ("light years", "New York", "square root of") into single word tokens. */
function mergePhrases(toks: Token[], src: string, opts: LexOptions): Token[] {
  if (opts.maxPhraseWords < 2) return toks;
  const out: Token[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'word') {
      out.push(t);
      continue;
    }
    let merged = false;
    // collect candidate word chain
    const chain: { tok: Token; sep: string; idx: number }[] = [{ tok: t, sep: '', idx: i }];
    let k = i + 1;
    while (chain.length < opts.maxPhraseWords && k < toks.length) {
      const a = toks[k];
      if (a.t === 'word' && a.sp) {
        chain.push({ tok: a, sep: ' ', idx: k });
        k++;
      } else if (a.t === 'op' && a.s === '-' && !a.sp && toks[k + 1]?.t === 'word' && !toks[k + 1].sp) {
        chain.push({ tok: toks[k + 1], sep: '-', idx: k + 1 });
        k += 2;
      } else break;
    }
    for (let len = chain.length; len >= 2; len--) {
      let key = '';
      for (let c = 0; c < len; c++) key += chain[c].sep + chain[c].tok.lo.replace(/\.$/, '');
      if (opts.phrases.has(key)) {
        const last = chain[len - 1].tok;
        out.push({ ...t, t: 'word', s: src.slice(t.start, last.end), lo: key, end: last.end });
        i = chain[len - 1].idx;
        merged = true;
        break;
      }
    }
    if (!merged) out.push(t);
  }
  return out;
}
