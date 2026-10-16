import { type EvalContext, evaluate } from './evaluator';
import { DEFAULT_SETTINGS, type Settings, formatValue } from './format';
import { type Token, lex } from './lexer';
import { type ParseEnv, ParseError, parse } from './parser';
import { CalcError, NoResult, type Value } from './quantity';
import type { Node } from './parser';
import { UNIT_PHRASES, lookupUnit, setCssBase } from './units';
import * as V from './vocab';

export interface Span {
  from: number;
  to: number;
  cls: string;
}

export interface LineResult {
  kind: 'empty' | 'header' | 'comment' | 'value' | 'error' | 'none';
  text?: string;
  copy?: string;
  error?: string;
  value?: Value;
  /** Syntax highlighting for the source line (offsets within the line). */
  spans: Span[];
  /** Variable assigned on this line. */
  assigned?: string;
}

export interface DocOptions {
  settings?: Partial<Settings>;
  now?: number;
}

let phraseCache: { set: Set<string>; max: number } | null = null;
function basePhrases() {
  if (!phraseCache) {
    const set = new Set<string>([...UNIT_PHRASES, ...V.vocabPhrases()]);
    let max = 1;
    for (const p of set) max = Math.max(max, p.split(/[\s-]/).length);
    phraseCache = { set, max };
  }
  return phraseCache;
}

/** Refresh phrase list (after currencies are added from live rates). */
export function invalidatePhrases() {
  phraseCache = null;
}

class Vars implements ParseEnv {
  map = new Map<string, Value>();
  lower = new Map<string, string>();
  phrases = new Set<string>();
  maxWords = 1;

  set(name: string, v: Value) {
    this.map.set(name, v);
    const lo = name.toLowerCase().replace(/\s+/g, ' ');
    this.lower.set(lo, name);
    if (lo.includes(' ')) {
      this.phrases.add(lo);
      this.maxWords = Math.max(this.maxWords, lo.split(' ').length);
    }
  }

  resolveVar(t: Token): string | null {
    if (this.map.has(t.s)) return t.s;
    return this.lower.get(t.lo) ?? null;
  }
}

function isKnownWord(t: Token, env: ParseEnv): boolean {
  if (env.resolveVar(t)) return true;
  const lo = t.lo;
  const s = t.s;
  return (
    V.CONV_WORDS.has(lo) ||
    lo in V.OP_WORDS ||
    lo in V.POSTFIX_WORDS ||
    lo in V.FUNCTIONS ||
    lo in V.AGGREGATES ||
    lo in V.CONSTANTS ||
    (V.SCALES[lo] !== undefined && (lo.length > 2 || V.CASE_SENSITIVE_SCALES.has(s))) ||
    V.CURRENCY_SCALES[s] !== undefined ||
    lo in V.FRACTION_WORDS ||
    lo in V.NUMBER_WORDS ||
    lo in V.FORMAT_WORDS ||
    lo in V.ROUND_WORDS ||
    lo in V.MONTHS ||
    lo in V.WEEKDAYS ||
    V.DATE_WORDS.has(lo) ||
    lo in V.HOLIDAYS ||
    V.DATE_TARGETS.has(lo) ||
    lo in V.DENSITIES ||
    V.KEYWORDS.has(lo) ||
    !!V.resolveZone(s, lo) ||
    !!lookupUnit(/[\s-]/.test(lo) ? lo : s)
  );
}

/** Drop prose: unknown words, quoted text, and ordinals that aren't part of a date. */
function filterTokens(toks: Token[], env: ParseEnv): Token[] {
  const out: Token[] = [];
  const isMonth = (t?: Token) => !!t && t.t === 'word' && V.MONTHS[t.lo] !== undefined;
  const isScaleWord = (t?: Token) => !!t && t.t === 'word' && (V.SCALES[t.lo] !== undefined || V.CASE_SENSITIVE_SCALES.has(t.s));
  toks.forEach((t, i) => {
    if (t.t === 'text') return void (t.role = 'text');
    if (t.t === 'word' && !isKnownWord(t, env)) {
      t.role = 'text';
      // remember it so "5 blargs in kg" can't quietly become 5 kg
      const p = toks[i - 1];
      if (p?.t === 'num' && !p.ordinal) p.unknownAfter ??= t.s;
      else if (isScaleWord(p) && toks[i - 2]?.t === 'num') toks[i - 2].unknownAfter ??= t.s;
      else if (p?.t === 'word' && V.CONV_WORDS.has(p.lo)) p.unknownTarget ??= t.s;
      return;
    }
    if (t.t === 'num' && t.ordinal) {
      const near = isMonth(toks[i - 1]) || isMonth(toks[i + 1]) || (toks[i + 1]?.lo === 'of' && isMonth(toks[i + 2]));
      if (!near) return void (t.role = 'text');
    }
    out.push(t);
  });
  return out;
}

const LABEL = /^(\s*)([^:=]*?\p{L}[^:=]*?):(?=\s|$)/u;
const ASSIGN = /^(\s*)([\p{L}_][\p{L}\p{N}_' ]*?)\s*(?::=|=)(?!=)\s*/u;

function hasAggregate(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false;
  const node = n as Node;
  if (node.k === 'agg') return true;
  return Object.values(node).some((v) => (Array.isArray(v) ? v.some(hasAggregate) : typeof v === 'object' && hasAggregate(v)));
}

interface EvalOutcome {
  value?: Value;
  error?: string;
  aggregate?: boolean;
}

function evalTokens(tokens: Token[], env: ParseEnv, ctx: EvalContext): EvalOutcome {
  let firstError: string | undefined;
  for (let s = 0; s < tokens.length; s++) {
    // only prose (words, commas) may be skipped to find where the math starts
    if (s > 0 && tokens[s - 1].t !== 'word' && tokens[s - 1].t !== 'comma') break;
    const slice = tokens.slice(s);
    for (const t of slice) t.role = undefined;
    try {
      const node = parse(slice, env);
      const value = evaluate(node, ctx);
      if (value.kind === 'q' && Number.isNaN(value.v)) throw new CalcError('Result is not a number');
      for (let k = 0; k < s; k++) tokens[k].role = 'text';
      return { value, aggregate: hasAggregate(node) };
    } catch (e) {
      if (e instanceof CalcError) firstError ??= e.message;
      else if (!(e instanceof ParseError) && !(e instanceof NoResult)) firstError ??= 'Internal error: ' + (e as Error).message;
    }
  }
  for (const t of tokens) if (!t.role) t.role = t.t === 'word' ? 'text' : undefined;
  return { error: firstError };
}

function tokenSpans(tokens: Token[], offset: number): Span[] {
  const spans: Span[] = [];
  for (const t of tokens) {
    let cls: string = t.role ?? (t.t === 'num' ? 'number' : t.t === 'op' ? 'op' : t.t === 'lp' || t.t === 'rp' ? 'paren' : t.t === 'sym' ? 'currency' : t.t === 'time' || t.t === 'date' ? 'date' : 'text');
    if (cls === 'paren') cls = 'op';
    spans.push({ from: t.start + offset, to: t.end + offset, cls });
  }
  return spans;
}

export function evaluateDocument(src: string, opts: DocOptions = {}): LineResult[] {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  setCssBase(settings.ppi, settings.emPx);
  const now = opts.now ?? Date.now();
  const vars = new Vars();
  const ctx: EvalContext = { vars: vars.map, prev: null, block: [], now, settings };
  const base = basePhrases();
  const phrases = { has: (k: string) => base.set.has(k) || vars.phrases.has(k) };

  return src.split('\n').map((line): LineResult => {
    if (!line.trim()) {
      ctx.block = [];
      return { kind: 'empty', spans: [] };
    }
    if (/^\s*#/.test(line)) {
      ctx.block = [];
      return { kind: 'header', spans: [{ from: 0, to: line.length, cls: 'header' }] };
    }
    const spans: Span[] = [];
    let content = line;
    const ci = line.search(/(?<!:)\/\//);
    if (ci >= 0) {
      spans.push({ from: ci, to: line.length, cls: 'comment' });
      content = line.slice(0, ci);
    }
    if (!content.trim()) return { kind: 'comment', spans };

    let offset = 0;
    const lm = LABEL.exec(content);
    if (lm) {
      spans.push({ from: lm[1].length, to: lm[0].length, cls: 'label' });
      offset = lm[0].length;
      content = content.slice(offset);
    }

    let assigned: string | undefined;
    const am = ASSIGN.exec(content);
    if (am && content.slice(am[0].length).trim()) {
      const name = am[2].trim().replace(/\s+/g, ' ');
      assigned = name;
      spans.push({ from: offset + am[1].length, to: offset + am[1].length + am[2].trimEnd().length, cls: 'variable' });
      offset += am[0].length;
      content = content.slice(am[0].length);
    }
    // leading "=" (people type "= 5 + 3")
    const eq = /^\s*=\s*/.exec(content);
    if (eq && !assigned) {
      offset += eq[0].length;
      content = content.slice(eq[0].length);
    }

    const all = lex(content, { phrases, maxPhraseWords: Math.max(base.max, vars.maxWords) });
    const toks = filterTokens(all, vars);
    let res: EvalOutcome = {};
    if (toks.length) res = evalTokens(toks, vars, ctx);
    spans.push(...tokenSpans(all, offset));
    spans.sort((a, b) => a.from - b.from);

    if (res.value) {
      const v = res.value;
      if (assigned) vars.set(assigned, v);
      ctx.prev = v;
      // totals don't count themselves: "sum" then "average" averages the items, not the sum
      if (!res.aggregate) ctx.block.push(v);
      const f = formatValue(v, settings, now);
      return { kind: 'value', text: f.text, copy: f.copy, value: v, spans, assigned };
    }
    if (res.error) return { kind: 'error', error: res.error, spans, assigned };
    // a line of plain prose ("Expenses") starts a new block, like a header
    if (!all.some((t) => t.t === 'num' || t.t === 'sym')) ctx.block = [];
    return { kind: 'none', spans };
  });
}

/** Convenience for single expressions. */
export function calc(expr: string, opts: DocOptions = {}): string {
  const r = evaluateDocument(expr, opts).at(-1)!;
  return r.kind === 'value' ? r.text! : r.kind === 'error' ? 'Error: ' + r.error : '';
}
