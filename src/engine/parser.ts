import { type Dim, dimEq, makeDim } from './dims';
import type { Role, Token } from './lexer';
import { CalcError } from './quantity';
import { type Term, type UnitDef, getUnit, isLengthTerm, lookupUnit, suggestUnit, termsDim } from './units';
import * as V from './vocab';

/** Internal: the line isn't an expression we understand (shown as nothing). */
export class ParseError extends Error {}

export interface ClockTime {
  h: number;
  m: number;
  s: number;
}

export type DateSpec =
  | { k: 'now'; timeOnly?: boolean }
  | { k: 'today'; days: number; time?: ClockTime }
  | { k: 'time'; time: ClockTime }
  | { k: 'date'; y?: number; mo: number; d: number; time?: ClockTime }
  | { k: 'weekday'; wd: number; rel: 'next' | 'last' | 'this' | 'upcoming'; time?: ClockTime }
  | { k: 'rel'; unit: 'week' | 'month' | 'year' | 'day'; n: number }
  | { k: 'holiday'; name: string; time?: ClockTime };

export type Node =
  | { k: 'num'; v: number; unknown?: string }
  | { k: 'unit'; terms: Term[] }
  /** `marks`: the unit was written as a ' or " mark (6'2", 1″). */
  | { k: 'attach'; e: Node; terms: Term[]; marks?: boolean }
  | { k: 'var'; name: string }
  | { k: 'const'; name: string }
  | { k: 'bin'; op: string; a: Node; b: Node; mixed?: boolean }
  | { k: 'neg'; e: Node }
  | { k: 'call'; fn: string; args: Node[] }
  | { k: 'conv'; e: Node; to: Target }
  | { k: 'asPct'; mode: 'of' | 'on' | 'off'; a: Node; b: Node }
  | { k: 'solvePct'; mode: 'of' | 'on' | 'off'; p: Node; r: Node }
  | { k: 'pctChange'; a: Node; b: Node }
  | { k: 'agg'; fn: 'sum' | 'avg' | 'prev' | 'count' }
  | { k: 'dt'; spec: DateSpec }
  | { k: 'tzq'; e: Node; tz: string }
  | { k: 'until'; a: Node | null; b: Node; since: boolean }
  | { k: 'ago'; e: Node; dir: 1 | -1 }
  | { k: 'density'; e: Node; density: number; liquid: boolean }
  | { k: 'span'; a: Node; b: Node; unit: Node | null };

export type Target =
  | { k: 'units'; terms: Term[] }
  | { k: 'multi'; parts: Term[] }
  | { k: 'fmt'; f: V.FormatName; base?: number }
  | { k: 'round'; dp?: number; sf?: number; nearest?: Node }
  | { k: 'tz'; tz: string | null }
  | { k: 'date'; iso: boolean };

export interface ParseEnv {
  /** Canonical variable name if the token refers to a defined variable. */
  resolveVar(t: Token): string | null;
}

const ANGLE = makeDim({ angle: 1 });
const ARITH_OPS: Record<string, [string, number, number]> = {
  '+': ['+', 40, 41],
  '-': ['-', 40, 41],
  '*': ['*', 50, 51],
  '@': ['at', 50, 51],
  '/': ['/', 50, 51],
  '^': ['^', 70, 69],
  '&': ['&', 20, 21],
  '|': ['|', 10, 11],
  '<<': ['<<', 30, 31],
  '>>': ['>>', 30, 31],
};
const WORD_BP: Record<string, [number, number]> = {
  '+': [40, 41],
  '-': [40, 41],
  '*': [50, 51],
  '/': [50, 51],
  mod: [50, 51],
  of: [50, 51],
  on: [50, 51],
  off: [50, 51],
  '^': [70, 69],
  xor: [10, 11],
  ncr: [50, 51],
  at: [50, 51],
  'more than': [50, 51],
  'less than': [50, 51],
  '<<': [30, 31],
  '>>': [30, 31],
};
const PREFIX_BP = 60;
const POSTFIX_BP = 80;
const NOT_UNITS = new Set([...V.CONV_WORDS, ...Object.keys(V.OP_WORDS), 'a', 'an', 'is', 'what', 'ago', 'later', 'from', 'until', 'since', 'till']);
const PCT_WORDS = new Set(['percent', 'percentage', 'pct', 'per cent']);
const LIST_FNS = new Set(['sum', 'avg', 'count', 'min', 'max', 'gcd', 'lcm', 'hypot', 'median', 'mode', 'stdev', 'variance', 'product']);

function termDim(t: Term): Dim {
  return termsDim([t]);
}

function scaledTerm(t: Term, scale: number): Term {
  const u: UnitDef = {
    ...t.u,
    id: `${scale}·${t.p?.sym ?? ''}${t.u.id}`,
    symbol: `${scale}${t.p?.sym ?? ''}${t.u.symbol}`,
    factor: t.u.factor * (t.p?.factor ?? 1) * scale,
    prefixes: [],
    compose: undefined,
    singular: undefined,
    plural: undefined,
  };
  return { u, p: null, pow: t.pow };
}

const MARK_ANGLE: Record<string, string> = { ft: 'arcmin', in: 'arcsec' };

/** "1″ in rad", "30' in °": converted to an angle, feet and inch marks mean arcminutes and arcseconds. */
function marksAsAngle(n: Node): Node | null {
  if (n.k === 'attach' && n.marks) {
    const id = MARK_ANGLE[n.terms[0].u.id];
    return id ? { ...n, terms: [{ u: getUnit(id), p: null, pow: 1 }] } : null;
  }
  if (n.k === 'bin' && n.mixed) {
    const a = marksAsAngle(n.a);
    const b = a && marksAsAngle(n.b);
    return a && b ? { ...n, a, b } : null;
  }
  if (n.k === 'neg') {
    const e = marksAsAngle(n.e);
    return e && { ...n, e };
  }
  return null;
}

function convNode(e: Node, to: Target): Node {
  const dim = to.k === 'units' ? termsDim(to.terms) : to.k === 'multi' ? termDim(to.parts[0]) : null;
  if (dim && dimEq(dim, ANGLE)) e = marksAsAngle(e) ?? e;
  return { k: 'conv', e, to };
}

export function parse(tokens: Token[], env: ParseEnv): Node {
  return new Parser(tokens, env).parseLine();
}

class Parser {
  i = 0;
  /** >0 while parsing an exponent, where units don't attach to numbers. */
  noUnits = 0;
  constructor(
    private toks: Token[],
    private env: ParseEnv,
  ) {}

  // ----- helpers
  peek(o = 0): Token | undefined {
    return this.toks[this.i + o];
  }
  next(role?: Role): Token {
    const t = this.toks[this.i++];
    if (!t) throw new ParseError('Unexpected end');
    if (role) t.role = role;
    return t;
  }
  atEnd() {
    return this.i >= this.toks.length;
  }
  isW(t: Token | undefined, ...words: string[]): boolean {
    return !!t && t.t === 'word' && words.includes(t.lo) && !this.env.resolveVar(t);
  }
  isOp(t: Token | undefined, ...ops: string[]): boolean {
    return !!t && t.t === 'op' && ops.includes(t.s);
  }
  varName(t: Token | undefined): string | null {
    return t && t.t === 'word' ? this.env.resolveVar(t) : null;
  }
  unitLookup(t: Token | undefined): Term | null {
    if (!t || t.t !== 'word' || this.varName(t)) return null;
    // case-sensitive so "A" (amps) isn't mistaken for the article "a"
    if (NOT_UNITS.has(t.s)) return null;
    return lookupUnit(/[\s-]/.test(t.lo) ? t.lo : t.s);
  }
  remainingHasValues(from = this.i): boolean {
    for (let k = from; k < this.toks.length; k++) {
      const t = this.toks[k];
      if (t.t === 'num' || t.t === 'sym' || t.t === 'time' || t.t === 'date') return true;
    }
    return false;
  }

  // ----- statement level
  parseLine(): Node {
    if (this.atEnd()) throw new ParseError('empty');
    let node = this.tryHowMany() ?? this.tryWhatPercent() ?? this.parseConversion();
    if (this.isW(this.peek(), 'is')) node = this.tryIsClause(node) ?? node;
    while (this.isOp(this.peek(), '=')) this.next('op');
    if (!this.atEnd()) {
      // "$40 for 2 shirts": what follows "for"/"each" is commentary
      const stop = this.isW(this.peek(), 'for', 'each');
      if (!stop && this.remainingHasValues()) throw new ParseError('Unexpected ' + this.peek()!.s);
      for (let k = this.i; k < this.toks.length; k++) this.toks[k].role ??= 'text';
    }
    // a unit on its own ("days") isn't an answer
    if (node.k === 'unit') throw new ParseError('bare unit');
    return node;
  }

  /** "how many feet in a mile", "how many seconds are in a day" */
  tryHowMany(): Node | null {
    if (!this.isW(this.peek(), 'how many', 'how much')) return null;
    const save = this.i;
    this.next('keyword');
    const target = this.parseTargetUnits(false);
    if (target && this.isW(this.peek(), 'in', 'per', 'to', 'make')) {
      this.next('keyword');
      if (this.isW(this.peek(), 'make')) this.next('keyword');
      const e = this.parseExpr(0);
      return convNode(e, target);
    }
    this.i = save;
    return null;
  }

  /** "what % of 200 is 50" */
  tryWhatPercent(): Node | null {
    if (!this.isW(this.peek(), 'what') || !this.isPctToken(this.peek(1)) || !this.isW(this.peek(2), 'of', 'on', 'off')) return null;
    const save = this.i;
    this.next('keyword');
    this.next('keyword');
    const mode = this.next('keyword').lo as 'of' | 'on' | 'off';
    try {
      const b = this.parseExpr(0);
      if (this.isW(this.peek(), 'is')) {
        this.next('keyword');
        const a = this.parseExpr(0);
        return { k: 'asPct', mode, a, b };
      }
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
    }
    this.i = save;
    return null;
  }

  parseConversion(): Node {
    let left = this.parseExpr(0);
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'word' || !V.CONV_WORDS.has(t.lo) || this.varName(t)) break;
      const save = this.i;
      this.next('keyword');
      const ap = this.tryAsPercent(left);
      if (ap) {
        left = ap;
        continue;
      }
      if (t.lo === 'to') {
        const pc = this.tryPctChange(left);
        if (pc) {
          left = pc;
          continue;
        }
      }
      // "Jan 1 to Mar 1", "9am to 5pm"
      if (t.lo === 'to' && (left.k === 'dt' || left.k === 'tzq')) {
        const end = this.tryDateEnd();
        if (end) {
          left = { k: 'span', a: left, b: end, unit: null };
          continue;
        }
      }
      const target = this.tryTarget();
      if (target && this.targetEnds()) {
        left = convNode(left, target);
        continue;
      }
      this.i = save;
      // "in farenheit": a near-miss of a real unit deserves a hint, not a silent skip
      if (t.unknownTarget) {
        const hint = suggestUnit(t.unknownTarget);
        if (hint) throw new CalcError(`Unknown unit “${t.unknownTarget}”. Did you mean ${hint}?`);
      }
      // otherwise the word is prose: "3 apples in the store at $2 each"
      if (t.lo === 'in' && this.peek(1)) {
        this.next('text');
        left = this.parseInfix(left, 0);
        continue;
      }
      t.role = undefined;
      break;
    }
    return left;
  }

  tryDateEnd(): Node | null {
    const save = this.i;
    try {
      const e = this.parseExpr(0);
      if (e.k === 'dt' || e.k === 'tzq') return e;
    } catch (err) {
      if (!(err instanceof ParseError)) throw err;
    }
    this.i = save;
    return null;
  }

  targetEnds(): boolean {
    const t = this.peek();
    if (!t || t.t === 'rp') return true;
    if (t.t === 'word' && V.CONV_WORDS.has(t.lo)) return true;
    if (this.isW(t, 'is')) return true;
    return !this.remainingHasValues();
  }

  isPctToken(t: Token | undefined): boolean {
    return this.isOp(t, '%') || (!!t && t.t === 'word' && PCT_WORDS.has(t.lo) && !this.varName(t));
  }

  /** "as a % of", "as a percentage of", "in % off" */
  tryAsPercent(left: Node): Node | null {
    const save = this.i;
    if (this.isW(this.peek(), 'a', 'an')) this.next('keyword');
    if (this.isPctToken(this.peek())) {
      this.next('keyword');
      const m = this.peek();
      if (this.isW(m, 'of', 'on', 'off')) {
        this.next('keyword');
        const b = this.parseExpr(0);
        return { k: 'asPct', mode: m!.lo as 'of' | 'on' | 'off', a: left, b };
      }
    }
    this.i = save;
    return null;
  }

  /** "$50 to $75 is what %" */
  tryPctChange(left: Node): Node | null {
    const save = this.i;
    try {
      const b = this.parseExpr(0);
      if (this.isW(this.peek(), 'is') && this.isW(this.peek(1), 'what') && this.isPctToken(this.peek(2))) {
        this.next('keyword');
        this.next('keyword');
        this.next('keyword');
        return { k: 'pctChange', a: left, b };
      }
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
    }
    this.i = save;
    return null;
  }

  /** "30 is what % of 120", "6 is 5% of what" */
  tryIsClause(node: Node): Node | null {
    const save = this.i;
    this.next('keyword');
    try {
      if (this.isW(this.peek(), 'how many', 'how much')) {
        this.next('keyword');
        const target = this.tryTarget();
        if (target) return convNode(node, target);
      } else if (this.isW(this.peek(), 'what')) {
        this.next('keyword');
        if (this.isW(this.peek(), 'a')) this.next('keyword');
        if (this.isPctToken(this.peek())) {
          this.next('keyword');
          const m = this.peek();
          if (this.isW(m, 'of', 'on', 'off', 'more than', 'less than')) {
            this.next('keyword');
            const mode = m!.lo === 'more than' ? 'on' : m!.lo === 'less than' ? 'off' : (m!.lo as 'of');
            return { k: 'asPct', mode, a: node, b: this.parseExpr(0) };
          }
        }
      } else {
        const p = this.parseExpr(51);
        const m = this.peek();
        if (this.isW(m, 'of', 'on', 'off') && this.isW(this.peek(1), 'what')) {
          this.next('keyword');
          this.next('keyword');
          return { k: 'solvePct', mode: m!.lo as 'of', p, r: node };
        }
      }
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
    }
    this.i = save;
    return null;
  }

  // ----- Pratt core
  parseExpr(minBp: number): Node {
    return this.parseInfix(this.parsePrefix(), minBp);
  }

  parseInfix(left: Node, minBp: number): Node {
    for (;;) {
      const t = this.peek();
      if (!t) break;

      // postfix operators
      if (this.isOp(t, '!') && POSTFIX_BP >= minBp) {
        this.next('op');
        left = { k: 'call', fn: 'fact', args: [left] };
        continue;
      }
      if (this.isOp(t, '%') && !this.isModulo()) {
        if (POSTFIX_BP < minBp) break;
        this.next('op');
        left = { k: 'attach', e: left, terms: [{ u: getUnit('percent'), p: null, pow: 1 }] };
        continue;
      }
      if (t.t === 'word' && !this.varName(t) && V.POSTFIX_WORDS[t.lo] && POSTFIX_BP >= minBp) {
        this.next('keyword');
        left = { k: 'bin', op: '^', a: left, b: { k: 'num', v: V.POSTFIX_WORDS[t.lo] } };
        continue;
      }
      if (this.isW(t, 'factorial') && POSTFIX_BP >= minBp) {
        this.next('function');
        left = { k: 'call', fn: 'fact', args: [left] };
        continue;
      }
      if (this.isW(t, 'unix', 'timestamp') && POSTFIX_BP >= minBp && !this.canStartExpr(this.peek(1))) {
        this.next('function');
        left = { k: 'call', fn: 'fromunix', args: [left] };
        continue;
      }
      if (this.isW(t, 'rounded') && POSTFIX_BP >= minBp) {
        this.next('function');
        left = { k: 'call', fn: 'round', args: [left] };
        continue;
      }
      if (this.isW(t, 'ago') && POSTFIX_BP >= minBp) {
        this.next('keyword');
        left = { k: 'ago', e: left, dir: -1 };
        continue;
      }
      if (this.isW(t, 'from now', 'later', 'hence') && POSTFIX_BP >= minBp) {
        this.next('keyword');
        left = { k: 'ago', e: left, dir: 1 };
        continue;
      }

      const op = this.infixOp(t, left);
      if (op === 'skip') {
        this.next('text');
        continue;
      }
      if (!op || op.lbp < minBp) break;
      const pctWhat = (op.op === 'of' || op.op === 'on' || op.op === 'off') && this.isW(this.peek(op.n), 'what');
      if (!pctWhat && !this.canStartExpr(this.peek(op.n))) {
        // a dangling word like "of" or "and" is just prose: "12 oz of coffee in mL"
        if (op.n === 1 && t.t === 'word') {
          this.next('text');
          continue;
        }
        break;
      }
      for (let k = 0; k < op.n; k++) this.next(this.peek()!.t === 'op' ? 'op' : 'keyword');

      if ((op.op === 'of' || op.op === 'on' || op.op === 'off') && this.isW(this.peek(), 'what') && this.isW(this.peek(1), 'is')) {
        this.next('keyword');
        this.next('keyword');
        const r = this.parseExpr(0);
        left = { k: 'solvePct', mode: op.op, p: left, r };
        continue;
      }
      // "days from Jan 1 to Mar 1", "days between Jan 1 and Dec 31"
      if ((op.op === 'from' || op.op === 'between') && left.k === 'unit') {
        const a = this.parseExpr(41);
        if (this.isW(this.peek(), 'to', 'until', 'till', 'and')) {
          this.next('keyword');
          left = { k: 'span', a, b: this.parseExpr(41), unit: left };
          continue;
        }
        left = op.op === 'from' ? { k: 'bin', op: '+', a, b: left } : left;
        continue;
      }
      let right: Node;
      if (op.op === '^') {
        // 10^8 m/s: the exponent is a bare number and the unit belongs to the power
        this.noUnits++;
        try {
          right = this.parseExpr(op.rbp);
        } finally {
          this.noUnits--;
        }
        left = this.parseUnitSuffix({ k: 'bin', op: '^', a: left, b: right }, false);
        continue;
      }
      right = this.parseExpr(op.rbp);
      if (op.op === 'until' || op.op === 'since') left = { k: 'until', a: left, b: right, since: op.op === 'since' };
      else if (op.op === 'from') left = { k: 'bin', op: '+', a: right, b: left };
      else if (op.op === 'before') left = { k: 'bin', op: '-', a: right, b: left };
      else left = { k: 'bin', op: op.op, a: left, b: right };
    }
    return left;
  }

  isModulo(): boolean {
    const nx = this.peek(1);
    if (!nx) return false;
    if (nx.t === 'num' || nx.t === 'lp' || nx.t === 'sym') return true;
    if (nx.t === 'word') {
      if (this.varName(nx)) return true;
      if (V.CONSTANTS[nx.lo] || V.FUNCTIONS[nx.lo]) return true;
    }
    return false;
  }

  infixOp(t: Token, left: Node): { op: string; lbp: number; rbp: number; n: number } | 'skip' | null {
    if (t.t === 'op') {
      if (t.s === '%') return { op: 'mod', lbp: 50, rbp: 51, n: 1 };
      const a = ARITH_OPS[t.s];
      return a ? { op: a[0], lbp: a[1], rbp: a[2], n: 1 } : null;
    }
    if (t.t === 'lp') return { op: '*', lbp: 50, rbp: 51, n: 0 };
    // (3 + 4)2
    if (t.t === 'num' && this.toks[this.i - 1]?.t === 'rp') return { op: '*', lbp: 50, rbp: 51, n: 0 };
    if (t.t !== 'word') return null;
    if (this.varName(t)) return { op: '*', lbp: 50, rbp: 51, n: 0 };
    const lo = t.lo;
    if (V.CONV_WORDS.has(lo)) return null;
    if (lo === 'until' || lo === 'till' || lo === 'til' || lo === 'since') return { op: lo === 'since' ? 'since' : 'until', lbp: 5, rbp: 6, n: 1 };
    if (lo === 'from' || lo === 'after') return { op: 'from', lbp: 45, rbp: 46, n: 1 };
    if (lo === 'before') return { op: 'before', lbp: 45, rbp: 46, n: 1 };
    if (lo === 'between' && left.k === 'unit') return { op: 'between', lbp: 5, rbp: 6, n: 1 };
    const w = V.OP_WORDS[lo];
    if (w) {
      if ((w === 'on' || w === 'off') && !isPercentNode(left)) return 'skip';
      // "20% more than 50" vs "5 more than 3"
      if (w === 'more than') return { op: isPercentNode(left) ? 'on' : '+', lbp: 50, rbp: 51, n: 1 };
      if (w === 'less than') return { op: isPercentNode(left) ? 'off' : 'rsub', lbp: 50, rbp: 51, n: 1 };
      const bp = WORD_BP[w];
      return { op: w, lbp: bp[0], rbp: bp[1], n: 1 };
    }
    if (lo === 'a' || lo === 'an') return 'skip';
    // substances only mean something right after a quantity ("2 cups flour")
    if (V.DENSITIES[lo] !== undefined) return 'skip';
    // a place name mid-sentence is context, not math: "2 nights Tokyo"
    if (V.resolveZone(t.s, lo) && !this.unitLookup(t)) return 'skip';
    if (this.wordStartsPrimary(t)) return { op: '*', lbp: 50, rbp: 51, n: 0 };
    return null;
  }

  /** Words that can begin an operand for implicit multiplication. */
  wordStartsPrimary(t: Token): boolean {
    const lo = t.lo;
    if (V.CONSTANTS[lo] || V.FUNCTIONS[lo] || V.FRACTION_WORDS[lo] !== undefined) return true;
    if (lo === 'sq' || lo === 'square' || lo === 'cubic') return true;
    return !!this.unitLookup(t) && !t.role;
  }

  canStartExpr(t: Token | undefined): boolean {
    if (!t) return false;
    if (t.t === 'num' || t.t === 'sym' || t.t === 'lp' || t.t === 'time' || t.t === 'date') return true;
    if (t.t === 'op') return t.s === '-' || t.s === '+';
    if (t.t !== 'word') return false;
    if (this.varName(t)) return true;
    const lo = t.lo;
    return (
      !!V.CONSTANTS[lo] ||
      !!V.FUNCTIONS[lo] ||
      !!V.AGGREGATES[lo] ||
      V.FRACTION_WORDS[lo] !== undefined ||
      V.NUMBER_WORDS[lo] !== undefined ||
      (V.SCALES[lo] !== undefined && lo.length > 2) ||
      V.MONTHS[lo] !== undefined ||
      V.WEEKDAYS[lo] !== undefined ||
      !!V.HOLIDAYS[lo] ||
      ['a', 'an', 'now', 'today', 'tomorrow', 'yesterday', 'tonight', 'noon', 'midnight', 'time', 'date', 'next', 'last', 'this', 'negative', 'sq', 'square', 'cubic', 'until', 'since', 'till'].includes(lo) ||
      !!this.unitLookup(t) ||
      !!V.resolveZone(t.s, lo)
    );
  }

  // ----- prefix
  parsePrefix(): Node {
    const t = this.peek();
    if (!t) throw new ParseError('Unexpected end');
    switch (t.t) {
      case 'num':
        this.next('number');
        return this.parseNumberish(t);
      case 'sym':
        return this.parseCurrencyPrefix();
      case 'lp': {
        this.next('paren');
        const e = this.parseConversion();
        if (this.peek()?.t === 'rp') this.next('paren');
        else if (!this.atEnd()) throw new ParseError('Expected )');
        return this.parseUnitSuffix(e, false);
      }
      case 'op':
        if (t.s === '-') {
          this.next('op');
          return { k: 'neg', e: this.parseExpr(PREFIX_BP) };
        }
        if (t.s === '+') {
          this.next('op');
          return this.parseExpr(PREFIX_BP);
        }
        if (t.s === '~') {
          this.next('op');
          return { k: 'call', fn: 'bitnot', args: [this.parseExpr(PREFIX_BP)] };
        }
        throw new ParseError('Unexpected ' + t.s);
      case 'time':
        this.next('date');
        return this.afterTime({ k: 'dt', spec: { k: 'time', time: t.time! } });
      case 'date': {
        this.next('date');
        const d = t.date!;
        const time = d.h !== undefined ? { h: d.h, m: d.mi ?? 0, s: d.sec ?? 0 } : this.optionalTime();
        return this.afterTime({ k: 'dt', spec: { k: 'date', y: d.y, mo: d.mo, d: d.d, time } });
      }
      case 'word':
        return this.parseWord(t);
    }
    throw new ParseError('Unexpected ' + t.s);
  }

  /** Optional "at 3pm" / "3pm" following a date. */
  optionalTime(): ClockTime | undefined {
    const t = this.peek();
    if (t?.t === 'time') {
      this.next('date');
      return t.time;
    }
    if ((this.isW(t, 'at') || this.isOp(t, '@')) && this.peek(1)?.t === 'time') {
      this.next('keyword');
      return this.next('date').time;
    }
    if (this.isW(t, 'noon', 'midnight') || ((this.isW(t, 'at') || this.isOp(t, '@')) && this.isW(this.peek(1), 'noon', 'midnight'))) {
      if (!this.isW(t, 'noon', 'midnight')) this.next('keyword');
      const w = this.next('date');
      return { h: w.lo === 'noon' ? 12 : 0, m: 0, s: 0 };
    }
    return undefined;
  }

  /** After a time literal: "3pm EST", "3pm tomorrow", "15:00 Tokyo time". */
  afterTime(node: Node): Node {
    if (node.k === 'dt' && node.spec.k === 'time') {
      const t = this.peek();
      const time = node.spec.time;
      if (this.isW(t, 'today', 'tonight', 'tomorrow', 'yesterday')) {
        this.next('date');
        node = { k: 'dt', spec: { k: 'today', days: t!.lo === 'tomorrow' ? 1 : t!.lo === 'yesterday' ? -1 : 0, time } };
      } else if (t && t.t === 'word' && V.MONTHS[t.lo] !== undefined && this.peek(1)?.t === 'num') {
        const d = this.parseWord(t);
        if (d.k === 'dt' && d.spec.k === 'date') d.spec.time = time;
        node = d;
      }
    }
    const z = this.peek();
    if (z && z.t === 'word' && !this.varName(z)) {
      const tz = V.resolveZone(z.s, z.lo);
      if (tz) {
        this.next('keyword');
        if (this.isW(this.peek(), 'time')) this.next('keyword');
        node = { k: 'tzq', e: node, tz: this.zoneOffset(tz) };
      }
    }
    return node;
  }

  /** UTC+5, GMT-3, UTC+5:30 → a fixed offset. */
  zoneOffset(tz: string): string {
    if (tz !== 'UTC' && tz !== 'Etc/GMT') return tz;
    const s = this.peek();
    const n = this.peek(1);
    if (!this.isOp(s, '+', '-') || s!.sp || !n || n.sp) return tz;
    let h: number;
    let m = 0;
    if (n.t === 'num' && Number.isInteger(n.v)) h = n.v!;
    else if (n.t === 'time') ({ h, m } = n.time!);
    else return tz;
    if (h > 14) return tz;
    this.next('keyword');
    this.next('keyword');
    if (h === 0 && m === 0) return 'UTC';
    return `UTC${s!.s}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
  }

  parseNumberish(t: Token): Node {
    // day-first dates: "25 Dec 2026", "1st of January"
    if (t.isInt && t.v! >= 1 && t.v! <= 31) {
      const j = this.isW(this.peek(), 'of') ? 1 : 0;
      const m = this.peek(j);
      if (m && m.t === 'word' && V.MONTHS[m.lo] !== undefined && !this.varName(m) && (t.ordinal || j === 0)) {
        for (let k = 0; k <= j; k++) this.next('date');
        const y = this.optionalYear();
        return this.afterTime({ k: 'dt', spec: { k: 'date', y, mo: V.MONTHS[m.lo], d: t.v!, time: this.optionalTime() } });
      }
    }
    let v = t.v!;
    const a = this.peek();
    const b = this.peek(1);
    const c = this.peek(2);
    if (t.isInt && this.isOp(a, '/') && !a!.sp && b?.t === 'num' && b.isInt && !b.sp && b.v !== 0 && (this.isUnitStart(c) || this.isScale(c, false))) {
      // 3/4 cup
      this.next('number');
      this.next('number');
      v = v / b.v!;
    } else if (t.isInt && a?.t === 'num' && a.isInt && a.sp && this.isOp(b, '/') && !b!.sp && c?.t === 'num' && c.isInt && !c.sp && c.v !== 0 && !this.isOp(this.peek(3), '^')) {
      // 1 1/2
      this.next('number');
      this.next('number');
      this.next('number');
      v = v + a.v! / c.v!;
    }
    if (this.noUnits) return { k: 'num', v };
    v = this.applyScales(v, false);
    return this.parseUnitSuffix({ k: 'num', v, unknown: t.unknownAfter }, true);
  }

  optionalYear(): number | undefined {
    let k = 0;
    if (this.peek()?.t === 'comma') k = 1;
    const y = this.peek(k);
    if (y?.t === 'num' && y.isInt && y.v! >= 1000 && y.v! <= 9999) {
      for (let j = 0; j <= k; j++) this.next('date');
      return y.v;
    }
    return undefined;
  }

  isScale(t: Token | undefined, currency: boolean): boolean {
    return this.scaleOf(t, currency) !== undefined;
  }

  scaleOf(t: Token | undefined, currency: boolean): number | undefined {
    if (!t || t.t !== 'word' || this.varName(t)) return undefined;
    if (currency && V.CURRENCY_SCALES[t.s] !== undefined) return V.CURRENCY_SCALES[t.s];
    if (V.CASE_SENSITIVE_SCALES.has(t.s)) return V.SCALES[t.s];
    if (t.lo.length > 2 && V.SCALES[t.lo] !== undefined) return V.SCALES[t.lo];
    return undefined;
  }

  applyScales(v: number, currency: boolean): number {
    for (;;) {
      const f = this.scaleOf(this.peek(), currency);
      if (f === undefined) return v;
      this.next('scale');
      v *= f;
    }
  }

  /** A ' or " after a value: feet/inches, or arcminutes/arcseconds. */
  isMark(t: Token | undefined): boolean {
    return t?.t === 'op' && (t.s === "'" || t.s === '"');
  }

  isUnitStart(t: Token | undefined): boolean {
    if (!t) return false;
    if (t.t === 'sym' || this.isMark(t)) return true;
    if (t.t !== 'word') return false;
    if (t.lo === 'sq' || t.lo === 'square' || t.lo === 'cubic' || t.lo === 'cu') return true;
    return !!this.unitLookup(t);
  }

  parseCurrencyPrefix(): Node {
    const st = this.next('currency');
    const term = lookupUnit(st.s);
    if (!term?.u.currency) throw new ParseError('Unknown currency ' + st.s);
    const n = this.peek();
    let amount: Node;
    if (n?.t === 'num' && !n.ordinal) {
      this.next('number');
      amount = { k: 'num', v: this.applyScales(n.v!, true) };
    } else if (n?.t === 'lp') {
      amount = this.parsePrefix();
    } else if (this.isOp(n, '-') && this.peek(1)?.t === 'num') {
      this.next('op');
      const m = this.next('number');
      amount = { k: 'num', v: -this.applyScales(m.v!, true) };
    } else {
      return this.parseUnitSuffix({ k: 'num', v: 1 }, false, [{ ...term }], true);
    }
    // "$5 USD"
    const dup = this.unitLookup(this.peek());
    if (dup && dup.u === term.u) this.next('currency');
    return this.parseUnitSuffix(amount, false, [{ ...term }]);
  }

  /**
   * Attach units following a value: "5 km", "60 km/h", "9.8 m/s²", "$20/hr", "5 ft 3 in",
   * "6'2\"", "3 sq ft". `fromNumber` means `node` is a bare numeric literal.
   */
  parseUnitSuffix(node: Node, fromNumber: boolean, preTerms?: Term[], bare = false): Node {
    const terms: Term[] = preTerms ? [...preTerms] : [];
    let marks = false;
    if (!preTerms) {
      const t = this.peek();
      if (this.isW(t, 'in')) {
        // "5 blargs in kg": the "in" after an unrecognized word is a conversion, never inches
        const mode = node.k === 'num' && node.unknown ? 'convert' : this.inchMode(fromNumber && node.k === 'num');
        if (mode === 'inch') {
          this.next('unit');
          terms.push(this.unitPower({ u: getUnit('in'), p: null, pow: 1 }));
        } else if (mode === 'inch-convert') {
          const save = this.i;
          this.next('unit');
          const target = this.tryTarget();
          if (target && this.targetEnds()) {
            const q: Node = { k: 'attach', e: node, terms: [{ u: getUnit('in'), p: null, pow: 1 }] };
            return { k: 'conv', e: q, to: target };
          }
          this.i = save;
        }
      } else {
        marks = this.isMark(t);
        const first = this.tryUnitTerm(null, false);
        if (first) terms.push(first);
      }
    }
    if (!terms.length) return node;

    // tail: /h, per month, an hour, *m
    for (;;) {
      const t = this.peek();
      if (this.isOp(t, '/') || this.isW(t, 'per', 'a', 'an')) {
        const save = this.i;
        this.next(t!.t === 'op' ? 'op' : 'keyword');
        // "$100 / $50" divides two amounts; it isn't a "$/$" unit
        if (this.peek()?.t === 'sym' && this.peek(1)?.t === 'num') {
          this.i = save;
          break;
        }
        // "4 L per 100 km"
        const n = this.peek();
        if (t!.lo === 'per' && n?.t === 'num' && n.v! >= 10 && Number.isInteger(Math.log10(n.v!))) {
          this.next('number');
          const u = this.tryUnitTerm(null, false);
          if (u) {
            const st = scaledTerm(u, n.v!);
            terms.push({ ...st, pow: -st.pow });
            continue;
          }
          this.i = save;
          break;
        }
        const u = this.tryUnitTerm(null, false);
        if (u) {
          terms.push({ ...u, pow: -u.pow });
          continue;
        }
        this.i = save;
        t!.role = undefined;
        break;
      }
      if (this.isOp(t, '*') && this.peek(1)?.t === 'word') {
        const save = this.i;
        this.next('op');
        const u = this.tryUnitTerm(null, false);
        if (u) {
          terms.push(u);
          continue;
        }
        this.i = save;
      }
      break;
    }

    let res: Node = bare ? { k: 'unit', terms } : { k: 'attach', e: node, terms, marks: marks && terms.length === 1 };
    // "2 cups flour", "1 m³ of concrete"
    const sub = this.substance();
    if (sub) return { k: 'density', e: res, ...sub };

    // mixed units: 5 ft 3 in, 1 h 30 min, 6'2", 2 lb 3 oz
    if (fromNumber && terms.length === 1 && terms[0].pow === 1 && !terms[0].u.currency && !terms[0].u.ratio) {
      const d0 = termDim(terms[0]);
      for (;;) {
        const nt = this.peek();
        if (nt?.t !== 'num' || nt.ordinal) break;
        const save = this.i;
        this.next('number');
        let v2 = nt.v!;
        const a = this.peek();
        const b = this.peek(1);
        if (nt.isInt && this.isOp(a, '/') && !a!.sp && b?.t === 'num' && b.isInt && !b.sp && b.v) {
          this.next('number');
          this.next('number');
          v2 /= b.v!;
        }
        let u2: Term | null;
        const marks2 = this.isMark(this.peek());
        if (this.isW(this.peek(), 'in') && this.inchMode(false) === 'inch') {
          this.next('unit');
          u2 = { u: getUnit('in'), p: null, pow: 1 };
        } else u2 = this.timeAware(this.tryUnitTerm(d0, false), d0);
        // "5 foot 3", "6'2": a bare number after feet means inches
        if (!u2 && terms[0].u.id === 'ft' && nt.isInt && v2 < 12 && this.endsTerm(this.peek())) {
          u2 = { u: getUnit('in'), p: null, pow: 1 };
        }
        if (!u2 || u2.pow !== 1 || !dimEq(termDim(u2), d0)) {
          this.i = save;
          break;
        }
        res = { k: 'bin', op: '+', a: res, b: { k: 'attach', e: { k: 'num', v: v2 }, terms: [u2], marks: marks2 }, mixed: true };
      }
    }
    return res;
  }

  substance(): { density: number; liquid: boolean } | null {
    const j = this.isW(this.peek(), 'of') ? 1 : 0;
    const t = this.peek(j);
    if (!t || t.t !== 'word' || this.varName(t)) return null;
    const d = V.DENSITIES[t.lo];
    if (d === undefined) return null;
    for (let k = 0; k <= j; k++) this.next(k === j ? 'unit' : 'keyword');
    return { density: d * 1000, liquid: V.LIQUIDS.has(t.lo) };
  }

  /** "1h 30m": after hours, a bare "m" means minutes rather than metres. */
  timeAware(u: Term | null, ctx: Dim): Term | null {
    if (u && u.u.id === 'm' && !u.p && u.pow === 1 && dimEq(ctx, makeDim({ time: 1 }))) return { u: getUnit('min'), p: null, pow: 1 };
    return u;
  }

  /** Nothing more belongs to this value (end, conversion, closing paren, operator). */
  endsTerm(t: Token | undefined): boolean {
    if (!t) return true;
    if (t.t === 'rp' || t.t === 'comma' || t.t === 'op') return true;
    return t.t === 'word' && (V.CONV_WORDS.has(t.lo) || !!V.OP_WORDS[t.lo]);
  }

  /** Optional power after a unit: ^2, ², squared. */
  unitPower(term: Term): Term {
    const a = this.peek();
    if (this.isOp(a, '^')) {
      const b = this.peek(1);
      const c = this.peek(2);
      if (b?.t === 'num') {
        this.next('op');
        this.next('number');
        term.pow *= b.v!;
      } else if (this.isOp(b, '-') && c?.t === 'num') {
        this.next('op');
        this.next('op');
        this.next('number');
        term.pow *= -c.v!;
      }
    } else if (this.isW(a, 'squared', 'cubed')) {
      this.next('keyword');
      term.pow *= a!.lo === 'squared' ? 2 : 3;
    }
    return term;
  }

  /** Decide whether "in" after a value means inches or starts a conversion. */
  inchMode(numberLiteral: boolean): 'inch' | 'inch-convert' | 'convert' {
    const nx = this.peek(1);
    if (!nx) return 'inch';
    if (this.isOp(nx, '%')) return 'convert';
    if (nx.t === 'op' || nx.t === 'rp' || nx.t === 'comma' || nx.t === 'num') return 'inch';
    if (nx.t === 'word') {
      if (V.CONV_WORDS.has(nx.lo) || V.OP_WORDS[nx.lo] || nx.lo === 'is') return 'inch';
      const u = this.unitLookup(nx);
      if (numberLiteral && u && isLengthTerm(u) && !this.unitLookup(this.peek(2))) return 'inch-convert';
    }
    return 'convert';
  }

  /** Parse one unit factor: "km", "sq ft", "m^2", "s²", "'", "$". */
  tryUnitTerm(ctx: Dim | null, allowIn: boolean): Term | null {
    const t = this.peek();
    if (!t) return null;
    if (this.isMark(t)) {
      this.next('unit');
      const angle = !!ctx && dimEq(ctx, ANGLE);
      const id = t.s === "'" ? (angle ? 'arcmin' : 'ft') : angle ? 'arcsec' : 'in';
      return { u: getUnit(id), p: null, pow: 1 };
    }
    if (t.t === 'sym') {
      const u = lookupUnit(t.s);
      if (!u || u.u.category !== 'currency') return null;
      this.next('currency');
      return { ...u };
    }
    if (t.t !== 'word' || this.varName(t)) return null;
    let pow = 1;
    let j = 0;
    if (t.lo === 'sq' || t.lo === 'square') (pow = 2), (j = 1);
    else if (t.lo === 'cubic' || t.lo === 'cu') (pow = 3), (j = 1);
    const ut = this.peek(j);
    if (!ut || ut.t !== 'word') return null;
    if (ut.lo === 'in' && !allowIn && !j) return null;
    const look = ut.lo === 'in' ? { u: getUnit('in'), p: null, pow: 1 } : this.unitLookup(ut);
    if (!look) return null;
    if (j && !isLengthTerm(look)) return null;
    if (j) this.next('unit');
    this.next(look.u.currency ? 'currency' : 'unit');
    return this.unitPower({ ...look, pow: look.pow * pow });
  }

  parseWord(t: Token): Node {
    const name = this.varName(t);
    if (name) {
      this.next('variable');
      // "x percent"
      if (this.peek()?.t === 'word' && PCT_WORDS.has(this.peek()!.lo) && !this.varName(this.peek())) {
        this.next('unit');
        return { k: 'attach', e: { k: 'var', name }, terms: [{ u: getUnit('percent'), p: null, pow: 1 }] };
      }
      return { k: 'var', name };
    }
    const lo = t.lo;
    const nx = this.peek(1);

    // "log base 2 of 8"
    if (lo === 'log base') {
      this.next('function');
      const base = this.parseExpr(PREFIX_BP);
      if (this.isW(this.peek(), 'of')) this.next('keyword');
      return { k: 'call', fn: 'log', args: [this.parseExpr(PREFIX_BP), base] };
    }
    // "between 9am and 5pm", "difference between 10 and 4"
    if (lo === 'between' || lo === 'difference between' || lo === 'the difference between' || lo === 'time between') {
      this.next('keyword');
      const a = this.parseExpr(41);
      if (!this.isW(this.peek(), 'and', 'to')) throw new ParseError('between');
      this.next('keyword');
      return { k: 'span', a, b: this.parseExpr(41), unit: null };
    }
    // "percent change from 50 to 75"
    if (/^percent(age)? (change|increase|decrease)$/.test(lo)) {
      this.next('keyword');
      if (this.isW(this.peek(), 'from')) this.next('keyword');
      const a = this.parseExpr(0);
      if (!this.isW(this.peek(), 'to')) throw new ParseError('percent change');
      this.next('keyword');
      const node: Node = { k: 'pctChange', a, b: this.parseExpr(0) };
      return lo.endsWith('decrease') ? { k: 'neg', e: node } : node;
    }

    // functions (min/sec need parens since they're also units)
    const fs = V.FUNCTIONS[lo];
    if (fs && (nx?.t === 'lp' || this.isW(nx, 'of') || (!lookupUnit(t.s) && V.MONTHS[lo] === undefined))) {
      this.next('function');
      return this.parseCall(fs.name);
    }
    if (V.CONSTANTS[lo]) {
      this.next('constant');
      return { k: 'const', name: lo };
    }
    const agg = V.AGGREGATES[lo];
    if (agg) {
      const listOf = this.isW(nx, 'of') && !this.isW(this.peek(2), 'above');
      if ((nx?.t === 'lp' || listOf) && (agg === 'sum' || agg === 'avg' || agg === 'count')) {
        this.next('function');
        return this.parseCall(agg);
      }
      this.next('keyword');
      if (this.isW(this.peek(), 'above')) this.next('keyword');
      else if (this.isW(this.peek(), 'of') && this.isW(this.peek(1), 'above')) {
        this.next('keyword');
        this.next('keyword');
      }
      return { k: 'agg', fn: agg };
    }
    if (V.FRACTION_WORDS[lo] !== undefined) {
      this.next('number');
      return this.fractionTail(V.FRACTION_WORDS[lo]);
    }
    if (V.NUMBER_WORDS[lo] !== undefined) {
      const v = this.parseSpelled();
      // "two thirds"
      const fr = this.peek();
      if (fr?.t === 'word' && V.FRACTION_WORDS[fr.lo] !== undefined && fr.lo.endsWith('s')) {
        this.next('number');
        return this.fractionTail(v * V.FRACTION_WORDS[fr.lo]);
      }
      return this.parseUnitSuffix({ k: 'num', v: this.applyScales(v, false) }, true);
    }
    const sc = this.scaleOf(t, false);
    if (sc !== undefined && lo.length > 2) {
      this.next('scale');
      return this.parseUnitSuffix({ k: 'num', v: this.applyScales(sc, false) }, true);
    }
    if (lo === 'a' || lo === 'an') {
      if (nx?.t === 'word' && !this.varName(nx)) {
        const f = V.FRACTION_WORDS[nx.lo];
        const s = this.scaleOf(nx, false);
        if (f !== undefined) {
          this.next('keyword');
          this.next('number');
          return this.fractionTail(f);
        }
        if (s !== undefined) {
          this.next('keyword');
          this.next('scale');
          return this.parseUnitSuffix({ k: 'num', v: this.applyScales(s, false) }, true);
        }
        if (this.isUnitStart(nx)) {
          this.next('keyword');
          return this.parseUnitSuffix({ k: 'num', v: 1 }, false, undefined, false);
        }
      }
      throw new ParseError('a');
    }
    if (lo === 'negative' || lo === 'minus') {
      this.next('op');
      return { k: 'neg', e: this.parseExpr(PREFIX_BP) };
    }

    // dates and times
    const dateNode = this.tryDateWord(t);
    if (dateNode) return dateNode;

    // "in 3 days"
    if (lo === 'in' && this.canStartExpr(nx)) {
      this.next('keyword');
      return { k: 'ago', e: this.parseExpr(0), dir: 1 };
    }
    // "day of year", "week number"
    if (lo === 'day of year' || lo === 'day of the year' || lo === 'week of year' || lo === 'week of the year' || lo === 'week number') {
      this.next('date');
      return { k: 'call', fn: lo.startsWith('day') ? 'dayofyear' : 'weekofyear', args: [] };
    }
    if (lo === 'until' || lo === 'till' || lo === 'til' || lo === 'since') {
      this.next('keyword');
      return { k: 'until', a: null, b: this.parseExpr(6), since: lo === 'since' };
    }

    // "Tokyo time", "PST time"
    const tz = V.resolveZone(t.s, lo);
    if (tz && this.isW(nx, 'time')) {
      this.next('keyword');
      this.next('keyword');
      return { k: 'conv', e: { k: 'dt', spec: { k: 'now', timeOnly: true } }, to: { k: 'tz', tz } };
    }

    // units: "USD 50", "km/h", "sq ft", "mile"
    if (this.isUnitStart(t)) {
      const save = this.i;
      const u = this.tryUnitTerm(null, false);
      if (u) {
        const n = this.peek();
        // prefix units: "USD 50", "Mach 2"
        if ((u.u.currency || u.u.id === 'mach') && u.pow === 1 && n?.t === 'num' && !n.ordinal) {
          this.next('number');
          return this.parseUnitSuffix({ k: 'num', v: this.applyScales(n.v!, true) }, false, [u]);
        }
        this.i = save;
        return this.parseUnitSuffix({ k: 'num', v: 1 }, false, [this.tryUnitTerm(null, false)!], true);
      }
    }
    throw new ParseError('Unknown word ' + t.s);
  }

  /** "half", "a quarter of", "half a mile" */
  fractionTail(v: number): Node {
    if (this.isW(this.peek(), 'a', 'an') && this.isUnitStart(this.peek(1))) {
      this.next('keyword');
      const u = this.tryUnitTerm(null, false)!;
      return this.parseUnitSuffix({ k: 'num', v }, false, [u]);
    }
    return this.parseUnitSuffix({ k: 'num', v }, true);
  }

  /** "two thousand twenty six", "one point five million", "a hundred and five" */
  parseSpelled(): number {
    let total = 0;
    let cur = 0;
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'word' || this.varName(t)) break;
      const lo = t.lo;
      const n = V.NUMBER_WORDS[lo];
      if (n !== undefined) {
        this.next('number');
        cur += n;
        continue;
      }
      if (lo === 'hundred' || lo === 'hundreds') {
        this.next('number');
        cur = (cur || 1) * 100;
        continue;
      }
      const big = lo.length > 2 && lo !== 'dozen' && lo !== 'dozens' ? V.SCALES[lo] : undefined;
      if (big !== undefined && big >= 1000) {
        this.next('number');
        total += (cur || 1) * big;
        cur = 0;
        continue;
      }
      const nx = this.peek(1);
      if (lo === 'and' && nx?.t === 'word' && V.NUMBER_WORDS[nx.lo] !== undefined && cur + total > 0) {
        this.next('number');
        continue;
      }
      if (lo === 'point' && nx?.t === 'word' && (V.NUMBER_WORDS[nx.lo] ?? 10) < 10) {
        this.next('number');
        let frac = '';
        while (this.peek()?.t === 'word' && (V.NUMBER_WORDS[this.peek()!.lo] ?? 10) < 10) frac += V.NUMBER_WORDS[this.next('number').lo];
        cur += +('0.' + frac);
        continue;
      }
      break;
    }
    return total + cur;
  }

  parseCall(fn: string): Node {
    const args: Node[] = [];
    if (this.peek()?.t === 'lp') {
      this.next('paren');
      if (this.peek()?.t !== 'rp') {
        args.push(this.parseConversion());
        while (this.peek()?.t === 'comma') {
          this.next('op');
          args.push(this.parseConversion());
        }
      }
      if (this.peek()?.t === 'rp') this.next('paren');
      else if (!this.atEnd()) throw new ParseError('Expected )');
    } else {
      const of = this.isW(this.peek(), 'of');
      if (of) this.next('keyword');
      if (of && LIST_FNS.has(fn)) {
        // "average of 2, 4 and 6"
        args.push(this.parseExpr(41));
        while (this.peek()?.t === 'comma' || this.isW(this.peek(), 'and')) {
          this.next('op');
          args.push(this.parseExpr(41));
        }
      } else if (this.canStartExpr(this.peek())) {
        const arg = this.parseExpr(PREFIX_BP);
        // "round 3.14159 to 2 dp": let the conversion do the rounding
        if (fn === 'round' && this.isW(this.peek(), 'to')) return arg;
        args.push(arg);
      }
    }
    if (!args.length && fn !== 'random' && fn !== 'sum' && fn !== 'avg' && fn !== 'count') throw new ParseError('missing argument');
    return { k: 'call', fn, args };
  }

  tryDateWord(t: Token): Node | null {
    const lo = t.lo;
    const nx = this.peek(1);
    const dt = (spec: DateSpec): Node => ({ k: 'dt', spec });
    switch (lo) {
      case 'now':
        this.next('date');
        return dt({ k: 'now' });
      case 'time':
      case 'what time is it':
        this.next('date');
        return dt({ k: 'now', timeOnly: true });
      case 'today':
      case 'date':
      case 'tonight':
      case 'tomorrow':
      case 'yesterday': {
        this.next('date');
        const days = lo === 'tomorrow' ? 1 : lo === 'yesterday' ? -1 : 0;
        return this.afterTime(dt({ k: 'today', days, time: this.optionalTime() }));
      }
      case 'noon':
      case 'midnight':
        this.next('date');
        return this.afterTime(dt({ k: 'time', time: { h: lo === 'noon' ? 12 : 0, m: 0, s: 0 } }));
      case 'next':
      case 'last':
      case 'this': {
        if (!nx || nx.t !== 'word') return null;
        const wd = V.WEEKDAYS[nx.lo];
        if (wd !== undefined) {
          this.next('date');
          this.next('date');
          return this.afterTime(dt({ k: 'weekday', wd, rel: lo as 'next', time: this.optionalTime() }));
        }
        if (['week', 'month', 'year', 'day'].includes(nx.lo)) {
          this.next('date');
          this.next('date');
          return dt({ k: 'rel', unit: nx.lo as 'week', n: lo === 'next' ? 1 : lo === 'last' ? -1 : 0 });
        }
        return null;
      }
    }
    const mo = V.MONTHS[lo];
    if (mo !== undefined) {
      // "Dec 25", "December 25th, 2026", "Dec 2026"
      if (nx?.t === 'num' && nx.isInt) {
        if (nx.v! >= 1 && nx.v! <= 31) {
          this.next('date');
          this.next('date');
          const y = this.optionalYear();
          return this.afterTime(dt({ k: 'date', y, mo, d: nx.v!, time: this.optionalTime() }));
        }
        if (nx.v! >= 1000 && nx.v! <= 9999 && !nx.ordinal) {
          this.next('date');
          this.next('date');
          return dt({ k: 'date', y: nx.v!, mo, d: 1 });
        }
      }
      return null;
    }
    const wd = V.WEEKDAYS[lo];
    if (wd !== undefined && lo.length > 3 && lo.endsWith('day')) {
      this.next('date');
      return this.afterTime(dt({ k: 'weekday', wd, rel: 'upcoming', time: this.optionalTime() }));
    }
    if (V.HOLIDAYS[lo]) {
      this.next('date');
      return this.afterTime(dt({ k: 'holiday', name: lo, time: this.optionalTime() }));
    }
    return null;
  }

  // ----- conversion targets
  tryTarget(): Target | null {
    const save = this.i;
    // "as a fraction" (but "in A" means amps)
    const art = this.peek();
    if (art?.t === 'word' && (art.s === 'a' || art.s === 'an') && this.peek(1)) this.next('keyword');
    const t = this.peek();
    if (!t) {
      this.i = save;
      return null;
    }
    if (this.isOp(t, '%')) {
      this.next('unit');
      return { k: 'fmt', f: 'pct' };
    }
    if (t.t === 'word' && !this.varName(t)) {
      const f = V.FORMAT_WORDS[t.lo];
      if (f) {
        if (f === 'base') {
          const n = this.peek(1);
          if (n?.t === 'num' && n.isInt && n.v! >= 2 && n.v! <= 36) {
            this.next('keyword');
            this.next('number');
            return { k: 'fmt', f, base: n.v };
          }
        } else {
          this.next('keyword');
          if (this.isW(this.peek(), 'notation', 'numerals')) this.next('keyword');
          return { k: 'fmt', f };
        }
      }
      if (V.DATE_TARGETS.has(t.lo)) {
        this.next('keyword');
        if (this.peek()?.t === 'num' && this.peek()!.v === 8601) this.next('keyword');
        return { k: 'date', iso: t.lo !== 'date' };
      }
      if (t.lo === 'hms') {
        this.next('keyword');
        return { k: 'multi', parts: ['h', 'min', 's'].map((id) => ({ u: getUnit(id), p: null, pow: 1 })) };
      }
      if (t.lo === 'local' || t.lo === 'local time') {
        this.next('keyword');
        if (this.isW(this.peek(), 'time')) this.next('keyword');
        return { k: 'tz', tz: null };
      }
      if (t.lo === 'nearest' || t.lo === 'the nearest') {
        this.next('keyword');
        if (this.isW(this.peek(), 'integer', 'whole number')) {
          this.next('keyword');
          return { k: 'round', nearest: { k: 'num', v: 1 } };
        }
        try {
          return { k: 'round', nearest: this.parseExpr(51) };
        } catch (e) {
          if (!(e instanceof ParseError)) throw e;
          this.i = save;
          return null;
        }
      }
      const tz = V.resolveZone(t.s, t.lo);
      if (tz && !this.unitLookup(t)) {
        this.next('keyword');
        const z = this.zoneOffset(tz);
        if (this.isW(this.peek(), 'time')) this.next('keyword');
        return { k: 'tz', tz: z };
      }
    }
    if (t.t === 'num') {
      const r = this.peek(1);
      if (r?.t === 'word' && V.ROUND_WORDS[r.lo]) {
        this.next('number');
        this.next('keyword');
        return V.ROUND_WORDS[r.lo] === 'dp' ? { k: 'round', dp: Math.max(0, Math.round(t.v!)) } : { k: 'round', sf: Math.max(1, Math.round(t.v!)) };
      }
    }
    const units = this.parseTargetUnits();
    if (units) return units;
    // a bare zone that is also a unit symbol (e.g. "MT")
    if (t.t === 'word') {
      const tz = V.resolveZone(t.s, t.lo);
      if (tz) {
        this.next('keyword');
        return { k: 'tz', tz };
      }
    }
    this.i = save;
    return null;
  }

  /** "km/h", "ft in", "hours and minutes", "L/100km", "$ per hour". */
  parseTargetUnits(allowIn = true): Target | null {
    // "in per minute", "in /day", "in 1/mol"
    let inverse = false;
    const one = this.peek()?.t === 'num' && this.peek()!.v === 1 ? 1 : 0;
    if ((this.isW(this.peek(one), 'per') || this.isOp(this.peek(one), '/')) && this.peek(one + 1)?.t === 'word') {
      if (one) this.next('number');
      this.next('keyword');
      inverse = true;
    }
    const first0 = this.tryUnitTerm(null, allowIn);
    if (!first0) return null;
    const first = inverse ? { ...first0, pow: -first0.pow } : first0;
    const groups: Term[][] = [];
    let cur: Term[] = [first];
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (this.isOp(t, '/') || this.isW(t, 'per')) {
        const save = this.i;
        this.next(t.t === 'op' ? 'op' : 'keyword');
        let scale = 1;
        const n = this.peek();
        if (n?.t === 'num') {
          this.next('number');
          scale = n.v!;
        }
        const u = this.tryUnitTerm(null, true);
        if (!u) {
          this.i = save;
          break;
        }
        const st = scale !== 1 ? scaledTerm(u, scale) : u;
        cur.push({ ...st, pow: -st.pow });
        continue;
      }
      if (this.isOp(t, '*')) {
        const save = this.i;
        this.next('op');
        const u = this.tryUnitTerm(null, true);
        if (!u) {
          this.i = save;
          break;
        }
        cur.push(u);
        continue;
      }
      if (this.isW(t, 'and') || t.t === 'comma') {
        const save = this.i;
        this.next('keyword');
        const u = this.tryUnitTerm(null, true);
        if (!u || u.u.category === 'currency') {
          this.i = save;
          break;
        }
        groups.push(cur);
        cur = [u];
        continue;
      }
      // juxtaposition: "ft in" (mixed) or "N m" (product). "in" followed by a unit is a new conversion.
      if (this.isW(t, 'in') && (!allowIn || this.isUnitStart(this.peek(1)))) break;
      const save = this.i;
      const u = this.timeAware(this.tryUnitTerm(null, allowIn), termDim(cur[cur.length - 1]));
      if (!u) break;
      if (cur.length === 1 && cur[0].pow === 1 && u.pow === 1 && dimEq(termDim(cur[0]), termDim(u))) {
        groups.push(cur);
        cur = [u];
      } else if (groups.length) {
        this.i = save;
        break;
      } else cur.push(u);
    }
    groups.push(cur);
    if (groups.length > 1) {
      if (groups.some((g) => g.length !== 1)) return null;
      return { k: 'multi', parts: groups.map((g) => g[0]) };
    }
    return { k: 'units', terms: cur };
  }
}

export function isPercentNode(n: Node): boolean {
  return n.k === 'attach' && n.terms.length === 1 && n.terms[0].u.id === 'percent';
}
