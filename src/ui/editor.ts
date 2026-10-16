import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type LayerMarker,
  drawSelection,
  highlightActiveLine,
  keymap,
  layer,
  placeholder,
} from '@codemirror/view';
import type { LineResult } from '../engine';

export interface EditorOptions {
  evaluate: (text: string) => LineResult[];
  onChange: (text: string) => void;
  onCopy: (text: string) => void;
}

const refresh = StateEffect.define<null>();

const markCache = new Map<string, Decoration>();
const mark = (cls: string) => {
  let d = markCache.get(cls);
  if (!d) markCache.set(cls, (d = Decoration.mark({ class: 't-' + cls })));
  return d;
};

/** Syntax colors from the engine's token spans. */
function buildMarks(state: EditorState, results: LineResult[]): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const r = results[i - 1];
    if (!r) continue;
    let last = 0;
    for (const s of r.spans) {
      if (s.from < last || s.to <= s.from || s.to > line.length) continue;
      b.add(line.from + s.from, line.from + s.to, mark(s.cls));
      last = s.to;
    }
  }
  return b.finish();
}

/** One answer in the margin, positioned at the top of its (possibly wrapped) line. */
class ResultMarker implements LayerMarker {
  constructor(
    readonly r: LineResult,
    readonly top: number,
    readonly left: number,
    readonly width: number,
    readonly active: boolean,
  ) {}

  eq(o: ResultMarker) {
    return (
      o.r.kind === this.r.kind &&
      o.r.text === this.r.text &&
      o.r.error === this.r.error &&
      o.top === this.top &&
      o.left === this.left &&
      o.width === this.width &&
      o.active === this.active &&
      !!o.r.assigned === !!this.r.assigned
    );
  }

  draw() {
    const el = document.createElement('div');
    this.paint(el);
    return el;
  }

  update(el: HTMLElement, prev: ResultMarker) {
    if (prev.r.kind !== this.r.kind || prev.r.text !== this.r.text || prev.r.error !== this.r.error) return false;
    this.paint(el);
    return true;
  }

  private paint(el: HTMLElement) {
    el.className = 'cm-result' + (this.active ? ' active' : '') + (this.r.assigned ? ' assign' : '');
    el.style.top = this.top + 'px';
    el.style.left = this.left + 'px';
    el.style.width = this.width + 'px';
    if (el.firstChild && (el.firstChild as HTMLElement).dataset.key === this.key()) return;
    el.textContent = '';
    if (this.r.kind === 'value') {
      const b = document.createElement('button');
      b.className = 'val';
      b.tabIndex = -1;
      b.textContent = this.r.text ?? '';
      b.dataset.copy = this.r.copy ?? '';
      b.dataset.key = this.key();
      b.title = 'Click to copy';
      el.append(b);
    } else {
      const s = document.createElement('span');
      s.className = 'err';
      s.textContent = this.r.error ?? '';
      s.title = this.r.error ?? '';
      s.dataset.key = this.key();
      el.append(s);
    }
  }

  private key() {
    return this.r.kind + '\u0000' + (this.r.text ?? this.r.error ?? '');
  }
}

/** Monospace advance of the result font, for sizing the margin column. */
let charWidth = 0;
function measureChar(view: EditorView): number {
  const probe = document.createElement('span');
  probe.className = 'cm-result-probe';
  probe.textContent = '0000000000';
  view.dom.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return w || 9;
}

function cssPx(view: EditorView, name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(view.dom).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
}

export class Editor {
  readonly view: EditorView;
  private results: StateField<LineResult[]>;
  private resWidth = 0;

  constructor(parent: HTMLElement, private opts: EditorOptions) {
    this.results = StateField.define<LineResult[]>({
      create: (s) => opts.evaluate(s.doc.toString()),
      update: (v, tr) => (tr.docChanged || tr.effects.some((e) => e.is(refresh)) ? opts.evaluate(tr.newDoc.toString()) : v),
    });
    this.view = new EditorView({ parent, state: this.makeState('') });
    this.view.dom.addEventListener('mousedown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.val');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      this.copyFrom(b);
    });
    this.sizeColumn();
  }

  private extensions(): Extension[] {
    const field = this.results;
    const self = this;
    return [
      field,
      EditorView.decorations.compute([field], (s) => buildMarks(s, s.field(field))),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorView.lineWrapping,
      placeholder('Try 5 km in miles, 20% of $85, or 3pm PT in London'),
      EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'aria-label': 'Calculations' }),
      keymap.of([
        { key: 'Mod-Enter', run: () => (self.copyLine(), true) },
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          self.opts.onChange(u.state.doc.toString());
          self.sizeColumn();
        }
      }),
      layer({
        above: true,
        class: 'cm-results',
        update: (u) =>
          u.docChanged || u.viewportChanged || u.geometryChanged || u.selectionSet || u.startState.field(field) !== u.state.field(field),
        markers(view) {
          const results = view.state.field(field);
          const scroller = view.scrollDOM;
          const base = scroller.getBoundingClientRect();
          const offset = view.documentTop - base.top + scroller.scrollTop;
          const gutter = cssPx(view, '--gutter', 22);
          const width = self.resWidth;
          const left = scroller.clientWidth - gutter - width;
          const active = view.state.doc.lineAt(view.state.selection.main.head).number;
          const out: LayerMarker[] = [];
          for (const block of view.viewportLineBlocks) {
            const n = view.state.doc.lineAt(block.from).number;
            const r = results[n - 1];
            if (!r || (r.kind !== 'value' && r.kind !== 'error')) continue;
            out.push(new ResultMarker(r, Math.round(offset + block.top), Math.round(left), Math.round(width), n === active && view.hasFocus));
          }
          return out;
        },
      }),
    ];
  }

  private makeState(text: string) {
    return EditorState.create({ doc: text, extensions: this.extensions() });
  }

  /** Fit the margin column to the widest answer (within limits). */
  private sizeColumn() {
    const view = this.view;
    if (!charWidth) charWidth = measureChar(view);
    const results = view.state.field(this.results);
    let chars = 0;
    for (const r of results) {
      if (r.kind === 'value') chars = Math.max(chars, (r.text ?? '').length);
      else if (r.kind === 'error') chars = Math.max(chars, Math.min((r.error ?? '').length * 0.75, 26));
    }
    const avail = view.scrollDOM.clientWidth || 800;
    const w = Math.round(Math.min(Math.max(chars * charWidth + 12, 9 * charWidth), avail * 0.46));
    if (w !== this.resWidth) {
      this.resWidth = w;
      view.dom.style.setProperty('--res-w', w + 'px');
      view.requestMeasure();
    }
  }

  get value() {
    return this.view.state.doc.toString();
  }

  /** Load a sheet (each sheet gets its own undo history). */
  setValue(text: string) {
    this.view.setState(this.makeState(text));
    this.view.dispatch({ selection: { anchor: text.length }, scrollIntoView: false });
    this.view.scrollDOM.scrollTop = 0;
    this.sizeColumn();
  }

  /** Re-run calculations (settings or exchange rates changed). */
  refresh() {
    charWidth = 0;
    this.view.dispatch({ effects: refresh.of(null) });
    this.sizeColumn();
  }

  focus() {
    this.view.focus();
  }

  get lineResults(): LineResult[] {
    return this.view.state.field(this.results);
  }

  private copyFrom(b: HTMLElement) {
    if (!b.dataset.copy) return;
    this.opts.onCopy(b.dataset.copy);
    b.classList.remove('copied');
    void b.offsetWidth;
    b.classList.add('copied');
  }

  private copyLine() {
    const n = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
    const r = this.view.state.field(this.results)[n - 1];
    if (r?.kind !== 'value') return;
    const el = [...this.view.dom.querySelectorAll<HTMLElement>('.cm-result.active .val')][0];
    if (el) this.copyFrom(el);
    else if (r.copy) this.opts.onCopy(r.copy);
  }
}
