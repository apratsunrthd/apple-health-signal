import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

const SCRIPT_PATTERN = /<script\b(?<attributes>[^>]*)>(?<body>.*?)<\/script\s*>/is;

export function extractInlineScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const match = SCRIPT_PATTERN.exec(html);
  if (!match || !match.groups || !match.groups.body) {
    throw new Error('Could not find inline script in ' + HTML_PATH);
  }
  return match.groups.body;
}

function matchesSelector(elem, sel) {
  if (!elem || !elem.tagName) return false;
  sel = sel.trim();
  if (sel.startsWith('.')) {
    return elem.classList.contains(sel.slice(1));
  }
  if (sel.startsWith('#')) {
    return elem.getAttribute('id') === sel.slice(1);
  }
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const m = sel.slice(1, -1).match(/^([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?$/);
    if (m) {
      const val = elem.getAttribute(m[1]);
      if (m[2] === undefined) return val !== null;
      return val === m[2];
    }
  }
  const tagClassMatch = sel.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
  if (tagClassMatch) {
    return (
      elem.tagName.toLowerCase() === tagClassMatch[1].toLowerCase() &&
      elem.classList.contains(tagClassMatch[2])
    );
  }
  return elem.tagName.toLowerCase() === sel.toLowerCase();
}

function findDescendants(root, sel, firstOnly = false) {
  const parts = sel.trim().split(/\s+/);
  if (parts.length > 1) {
    let current = [root];
    for (const part of parts) {
      let next = [];
      for (const parent of current) {
        next.push(...findDescendants(parent, part, false));
      }
      current = next;
    }
    return firstOnly ? (current[0] || null) : current;
  }

  const matches = [];
  function walk(node) {
    for (const child of node.children) {
      if (child && child.tagName) {
        if (matchesSelector(child, sel)) {
          matches.push(child);
          if (firstOnly) return;
        }
        walk(child);
        if (firstOnly && matches.length) return;
      }
    }
  }
  walk(root);
  return firstOnly ? (matches[0] || null) : matches;
}

function parseHTMLToElements(htmlStr) {
  if (!htmlStr) return [];
  const elements = [];
  const tagRegex = /<([a-zA-Z0-9_-]+)\b([^>]*)(?:\/?>|>([\s\S]*?)<\/\1>)/g;
  let m;
  while ((m = tagRegex.exec(htmlStr)) !== null) {
    const tagName = m[1];
    const rawAttrs = m[2] || '';
    const inner = m[3] || '';
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let am;
    while ((am = attrRegex.exec(rawAttrs)) !== null) {
      attrs[am[1]] = am[2] !== undefined ? am[2] : '';
    }
    const elem = createMockElement(tagName, attrs);
    if (inner) {
      elem.innerHTML = inner;
    }
    elements.push(elem);
  }
  return elements;
}

export function createMockElement(tagName = 'div', attributes = {}) {
  const listeners = {};
  const attrs = { ...attributes };
  const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
  const children = [];
  let innerHtmlStr = '';
  let textContentStr = '';

  const elem = {
    tagName: tagName.toUpperCase(),
    attributes: attrs,
    style: {},
    children,
    hidden: false,
    disabled: false,
    clientWidth: 900,
    clientHeight: 260,
    value: attrs.value || '',
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 900, height: 260 };
    },
    get innerHTML() {
      return innerHtmlStr;
    },
    set innerHTML(val) {
      innerHtmlStr = String(val);
      children.length = 0;
      if (!val) {
        textContentStr = '';
        return;
      }
      const parsed = parseHTMLToElements(innerHtmlStr);
      if (parsed.length) {
        parsed.forEach(child => children.push(child));
      } else {
        textContentStr = innerHtmlStr;
      }
    },
    get textContent() {
      return textContentStr;
    },
    set textContent(val) {
      textContentStr = String(val);
      innerHtmlStr = String(val);
      children.length = 0;
    },
    classList: {
      add: (...cls) => cls.forEach(c => classes.add(c)),
      remove: (...cls) => cls.forEach(c => classes.delete(c)),
      contains: (c) => classes.has(c),
      toggle: (c) => {
        if (classes.has(c)) { classes.delete(c); return false; }
        classes.add(c); return true;
      }
    },
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k === 'class') {
        classes.clear();
        String(v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },
    getAttribute(k) {
      return attrs[k] !== undefined ? attrs[k] : null;
    },
    removeAttribute(k) {
      delete attrs[k];
      if (k === 'class') classes.clear();
    },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const fns = listeners[event] || [];
      fns.forEach(fn => fn.call(elem, { target: elem, preventDefault: () => {} }));
    },
    appendChild(child) {
      children.push(child);
      if (child.nodeType === 3) {
        textContentStr += child.textContent;
      }
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      return child;
    },
    remove() {
      // no-op if parent not tracked directly
    },
    querySelector(sel) {
      return findDescendants(elem, sel, true);
    },
    querySelectorAll(sel) {
      return findDescendants(elem, sel, false);
    },
    focus() {}
  };

  return elem;
}

export function createMockLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    _raw: store
  };
}

export function createMockIndexedDB(initialData = {}) {
  const databases = new Map();

  return {
    open(name, version = 1) {
      const req = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null
      };

      queueMicrotask(() => {
        let isNew = false;
        if (!databases.has(name)) {
          databases.set(name, new Map());
          isNew = true;
        }
        const dbStores = databases.get(name);
        const db = {
          name,
          version,
          objectStoreNames: {
            contains: (sName) => dbStores.has(sName)
          },
          createObjectStore(sName, opts) {
            if (!dbStores.has(sName)) {
              dbStores.set(sName, new Map());
              if (initialData[sName]) {
                const map = dbStores.get(sName);
                Object.entries(initialData[sName]).forEach(([k, v]) => map.set(k, v));
              }
            }
            return {};
          },
          transaction(storeName, mode = 'readonly') {
            const storeMap = dbStores.get(storeName) || new Map();
            dbStores.set(storeName, storeMap);

            let pending = 0;

            const tx = {
              error: null,
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore() {
                return {
                  get(key) {
                    pending++;
                    const getReq = { result: undefined, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      getReq.result = storeMap.get(key);
                      if (getReq.onsuccess) getReq.onsuccess({ target: getReq });
                      pending--;
                      if (pending === 0 && tx.oncomplete) tx.oncomplete();
                    }, 1);
                    return getReq;
                  },
                  put(item) {
                    pending++;
                    const putReq = { result: undefined, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const id = item.id;
                      storeMap.set(id, item);
                      if (putReq.onsuccess) putReq.onsuccess({ target: putReq });
                      pending--;
                      if (pending === 0 && tx.oncomplete) tx.oncomplete();
                    }, 1);
                    return putReq;
                  },
                  delete(key) {
                    pending++;
                    const delReq = { result: undefined, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      storeMap.delete(key);
                      if (delReq.onsuccess) delReq.onsuccess({ target: delReq });
                      pending--;
                      if (pending === 0 && tx.oncomplete) tx.oncomplete();
                    }, 1);
                    return delReq;
                  }
                };
              }
            };

            setTimeout(() => {
              if (pending === 0 && tx.oncomplete) tx.oncomplete();
            }, 2);

            return tx;
          }
        };

        req.result = db;
        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }
        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      });

      return req;
    },
    _databases: databases
  };
}

export async function createAppInstance(options = {}) {
  const elementsById = new Map();
  const getOrCreate = (id, tag = 'div') => {
    if (!elementsById.has(id)) {
      elementsById.set(id, createMockElement(tag, { id }));
    }
    return elementsById.get(id);
  };

  const requiredIds = [
    'clearBtn', 'sources', 'storageStatus', 'settingsToggle', 'settingsBody',
    'eatStart', 'eatEnd', 'heightIn', 'caffeineRows', 'addCaffeineRow',
    'settingsSummary', 'eventLabel', 'eventDate', 'eventTime', 'addEventBtn',
    'eventValidation', 'eventLogSummary', 'demoBanner',
    'tab-btn-overview', 'tab-btn-findings', 'tab-btn-labs', 'tab-btn-body', 'tab-btn-meals', 'tab-btn-activity',
    'tab-btn-patterns', 'tab-btn-sensor',
    'tabs', 'tab-overview', 'tab-findings', 'tab-labs', 'tab-body', 'tab-meals', 'tab-activity',
    'tab-patterns', 'tab-sensor', 'dayPrev', 'dayNext', 'mainChart'
  ];
  requiredIds.forEach(id => getOrCreate(id));

  const rootElement = createMockElement('body');
  requiredIds.forEach(id => rootElement.appendChild(getOrCreate(id)));

  const localStorage = createMockLocalStorage(options.initialLocalStorage || {});
  const indexedDB = createMockIndexedDB(options.initialIndexedDB || {});

  const windowMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    confirm: () => true,
    TextDecoder,
    indexedDB: options.disableIndexedDB ? null : indexedDB,
    localStorage: options.disableLocalStorage ? null : localStorage,
    claude: null
  };

  const documentMock = {
    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        return getOrCreate(sel.slice(1));
      }
      return findDescendants(rootElement, sel, true) || createMockElement('div');
    },
    querySelectorAll: (sel) => {
      if (sel === '.tab-btn') {
        return [
          getOrCreate('tab-btn-overview', 'button'),
          getOrCreate('tab-btn-findings', 'button'),
          getOrCreate('tab-btn-labs', 'button'),
          getOrCreate('tab-btn-body', 'button'),
          getOrCreate('tab-btn-meals', 'button'),
          getOrCreate('tab-btn-activity', 'button'),
          getOrCreate('tab-btn-patterns', 'button'),
          getOrCreate('tab-btn-sensor', 'button')
        ];
      }
      return findDescendants(rootElement, sel, false);
    },
    getElementById: (id) => getOrCreate(id),
    createElement: (tag, attrs) => createMockElement(tag, attrs),
    createTextNode: (text) => ({ textContent: String(text), nodeType: 3 })
  };

  windowMock.document = documentMock;

  const sandbox = {
    window: windowMock,
    document: documentMock,
    localStorage: windowMock.localStorage,
    indexedDB: windowMock.indexedDB,
    TextDecoder,
    Date,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    JSON,
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask
  };

  const context = vm.createContext(sandbox);
  const scriptCode = extractInlineScript();
  const script = new vm.Script(scriptCode, { filename: 'index.html' });
  script.runInContext(context);

  await new Promise(r => setTimeout(r, 40));

  return {
    app: windowMock.__healthSignal || windowMock.__glucoseSignal,
    window: windowMock,
    document: documentMock,
    localStorage,
    indexedDB,
    getOrCreate
  };
}
