import './styles.css';
import { DEFAULT_SETTINGS, type Settings, evaluateDocument, invalidatePhrases } from '../engine';
import { Editor } from './editor';
import { type RatesInfo, loadRates } from './rates';
import { WELCOME } from './sample';

interface Sheet {
  id: string;
  text: string;
  updated: number;
}

interface Prefs {
  decimals: number;
  separators: boolean;
  hour12: boolean;
  angle: 'rad' | 'deg';
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  sidebar: boolean;
}

interface State {
  sheets: Sheet[];
  current: string;
  prefs: Prefs;
}

const KEY = 'margin.state.v1';
const DEFAULT_PREFS: Prefs = {
  decimals: DEFAULT_SETTINGS.decimals,
  separators: true,
  hour12: true,
  angle: 'rad',
  theme: 'system',
  fontSize: 16,
  sidebar: false,
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const uid = () => Math.random().toString(36).slice(2, 10);

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as State | null;
    if (s?.sheets?.length) return { ...s, prefs: { ...DEFAULT_PREFS, ...s.prefs } };
  } catch {
    /* fall through to a fresh state */
  }
  const first: Sheet = { id: uid(), text: WELCOME, updated: Date.now() };
  return { sheets: [first], current: first.id, prefs: { ...DEFAULT_PREFS } };
}

const state = load();
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      toast('Couldn’t save — browser storage is unavailable');
    }
  }, 250);
}

const isTauri = '__TAURI_INTERNALS__' in window;
document.body.classList.add(isTauri ? 'tauri' : 'web');

const app = $('app');

const current = () => state.sheets.find((s) => s.id === state.current) ?? state.sheets[0];

function settings(): Partial<Settings> {
  const p = state.prefs;
  return { decimals: p.decimals, separators: p.separators, hour12: p.hour12, angle: p.angle };
}

let titleTimer = 0;
const editor = new Editor($('pad'), {
  evaluate: (text) => evaluateDocument(text, { settings: settings() }),
  onChange: (text) => {
    const s = current();
    s.text = text;
    s.updated = Date.now();
    save();
    clearTimeout(titleTimer);
    titleTimer = window.setTimeout(renderSidebar, 400);
  },
  onCopy: (text) => void copy(text),
});

const recalc = () => editor.refresh();

// ----- sheets

function sheetTitle(s: Sheet): string {
  for (const raw of s.text.split('\n')) {
    const t = raw.replace(/^\s*#+\s*/, '').replace(/^\s*\/\/\s*/, '').trim();
    if (t) return t.length > 60 ? t.slice(0, 60) + '…' : t;
  }
  return 'Empty sheet';
}

function relTime(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderSidebar() {
  const list = $('sheet-list');
  const sorted = [...state.sheets].sort((a, b) => b.updated - a.updated);
  list.innerHTML = '';
  for (const s of sorted) {
    const li = document.createElement('li');
    li.className = 'sheet-item' + (s.id === state.current ? ' active' : '');
    const open = document.createElement('button');
    open.className = 'sheet-open';
    open.innerHTML = '<span class="sheet-name"></span><span class="sheet-meta"></span>';
    open.querySelector('.sheet-name')!.textContent = sheetTitle(s);
    open.querySelector('.sheet-meta')!.textContent = relTime(s.updated);
    open.addEventListener('click', () => openSheet(s.id));
    li.appendChild(open);
    if (state.sheets.length > 1) {
      const del = document.createElement('button');
      del.className = 'sheet-delete';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete ${sheetTitle(s)}`);
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('confirm')) {
          del.classList.add('confirm');
          del.textContent = 'Confirm';
          setTimeout(() => {
            del.classList.remove('confirm');
            del.textContent = 'Delete';
          }, 2500);
          return;
        }
        deleteSheet(s.id);
      });
      li.appendChild(del);
    }
    list.appendChild(li);
  }
  $('sheet-title').textContent = sheetTitle(current());
}

function openSheet(id: string) {
  state.current = id;
  editor.setValue(current().text);
  renderSidebar();
  save();
  editor.focus();
}

function newSheet() {
  const s: Sheet = { id: uid(), text: '', updated: Date.now() };
  state.sheets.push(s);
  openSheet(s.id);
}

function deleteSheet(id: string) {
  const idx = state.sheets.findIndex((s) => s.id === id);
  if (idx < 0 || state.sheets.length < 2) return;
  const [removed] = state.sheets.splice(idx, 1);
  if (state.current === id) state.current = [...state.sheets].sort((a, b) => b.updated - a.updated)[0].id;
  openSheet(state.current);
  toast(`Deleted “${sheetTitle(removed)}”`, 'Undo', () => {
    state.sheets.push(removed);
    openSheet(removed.id);
  });
}

function setSidebar(open: boolean) {
  state.prefs.sidebar = open;
  app.classList.toggle('sidebar-open', open);
  $('toggle-sidebar').setAttribute('aria-expanded', String(open));
  $('toggle-sidebar').title = open ? 'Hide sheets (⌘\\)' : 'Show sheets (⌘\\)';
  save();
  setTimeout(() => editor.view.requestMeasure(), 200);
}

// ----- settings

function applyPrefs() {
  const p = state.prefs;
  const root = document.documentElement;
  if (p.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = p.theme;
  root.style.setProperty('--fs', p.fontSize + 'px');
  $('decimals-out').textContent = String(p.decimals);
  $<HTMLInputElement>('opt-separators').checked = p.separators;
  $<HTMLInputElement>('opt-24h').checked = !p.hour12;
  document.querySelectorAll<HTMLElement>('.segmented').forEach((g) => {
    const key = g.dataset.setting as 'angle' | 'theme' | 'fontSize';
    g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(String(p[key]) === b.dataset.value)));
  });
}

function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  state.prefs[k] = v;
  applyPrefs();
  recalc();
  save();
}

function toggleSettings(open = $('settings').hidden) {
  $('settings').hidden = !open;
  $('toggle-settings').setAttribute('aria-expanded', String(open));
  if (open) ($('settings').querySelector('button, input') as HTMLElement | null)?.focus();
}

$('settings').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.step) setPref('decimals', Math.min(12, Math.max(0, state.prefs.decimals + +b.dataset.step)));
  const group = b.closest<HTMLElement>('.segmented');
  if (group && b.dataset.value) {
    const key = group.dataset.setting!;
    if (key === 'fontSize') setPref('fontSize', +b.dataset.value);
    else if (key === 'angle') setPref('angle', b.dataset.value as Prefs['angle']);
    else if (key === 'theme') setPref('theme', b.dataset.value as Prefs['theme']);
  }
});
$<HTMLInputElement>('opt-separators').addEventListener('change', (e) => setPref('separators', (e.target as HTMLInputElement).checked));
$<HTMLInputElement>('opt-24h').addEventListener('change', (e) => setPref('hour12', !(e.target as HTMLInputElement).checked));

// ----- exchange rates

function showRates(info: RatesInfo) {
  const el = $('rates-status');
  const at = info.at ? new Date(info.at) : null;
  const today = at && at.toDateString() === new Date().toDateString();
  const when = at ? at.toLocaleString(undefined, today ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' }) : '';
  if (info.source === 'live') el.textContent = `Updated ${when}`;
  else if (info.source === 'cached') el.textContent = info.error ? `Saved ${when} (offline)` : `Updated ${when}`;
  else el.textContent = info.error ? 'Built-in estimates (offline)' : 'Built-in estimates';
  invalidatePhrases();
  recalc();
}

$('refresh-rates').addEventListener('click', () => {
  $('rates-status').textContent = 'Refreshing…';
  void loadRates(showRates, true);
});

// ----- toast

let toastTimer = 0;
function toast(msg: string, action?: string, onAction?: () => void) {
  const t = $('toast');
  t.innerHTML = '';
  t.append(Object.assign(document.createElement('span'), { textContent: msg }));
  if (action && onAction) {
    const b = document.createElement('button');
    b.textContent = action;
    b.addEventListener('click', () => {
      t.classList.remove('show');
      onAction();
    });
    t.append(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), action ? 5000 : 1600);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ----- wiring

$('toggle-sidebar').addEventListener('click', () => setSidebar(!state.prefs.sidebar));
$('toggle-settings').addEventListener('click', () => toggleSettings());
$('new-sheet').addEventListener('click', newSheet);

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape' && !$('settings').hidden) {
    toggleSettings(false);
    editor.focus();
  } else if (mod && e.key === '\\') {
    e.preventDefault();
    setSidebar(!state.prefs.sidebar);
  } else if (mod && e.key === ',') {
    e.preventDefault();
    toggleSettings();
  } else if (mod && (e.key === 'n' || e.key === 'N') && !e.shiftKey) {
    e.preventDefault();
    newSheet();
  } else if (mod && /^[1-9]$/.test(e.key)) {
    const sorted = [...state.sheets].sort((a, b) => b.updated - a.updated);
    const s = sorted[+e.key - 1];
    if (s) {
      e.preventDefault();
      openSheet(s.id);
    }
  }
});

document.addEventListener('mousedown', (e) => {
  const s = $('settings');
  if (!s.hidden && !s.contains(e.target as Node) && !$('toggle-settings').contains(e.target as Node)) toggleSettings(false);
});

// time-based lines ("now", "time in Tokyo") stay fresh
setInterval(() => {
  if (editor.lineResults.some((r) => r.value?.kind === 'dt')) recalc();
}, 15_000);

applyPrefs();
setSidebar(state.prefs.sidebar);
editor.setValue(current().text);
renderSidebar();
editor.focus();
void loadRates(showRates);
