import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../out/compact-cards.js', import.meta.url), 'utf8');
function setup(saved, blocked = false) {
  const classes = new Set();
  const attributes = {};
  let click;
  const writes = [];
  const button = {
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (name, handler) => { if (name === 'click') click = handler; }
  };
  vm.runInNewContext(script, {
    document: {
      getElementById: () => button,
      body: {classList: {
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        contains: name => classes.has(name)
      }}
    },
    localStorage: {
      getItem: () => { if (blocked) throw Error('Unavailable'); return saved; },
      setItem: (...values) => { if (blocked) throw Error('Unavailable'); writes.push(values); }
    }
  });
  return {classes, attributes, writes, click: () => click()};
}

test('compact cards default off and toggle without changing inventory', () => {
  const state = setup(null);
  assert.equal(state.attributes['aria-pressed'], 'false');
  state.click();
  assert.equal(state.classes.has('compact-cards'), true);
  assert.equal(state.attributes['aria-pressed'], 'true');
  assert.deepEqual(state.writes[0], ['filament-compact-cards', 'true']);
  state.click();
  assert.equal(state.classes.has('compact-cards'), false);
  assert.equal(state.attributes['aria-pressed'], 'false');
});

test('compact cards restore the saved preference and tolerate blocked storage', () => {
  assert.equal(setup('true').attributes['aria-pressed'], 'true');
  assert.equal(setup('false').attributes['aria-pressed'], 'false');
  const blocked = setup(null, true);
  blocked.click();
  assert.equal(blocked.attributes['aria-pressed'], 'true');
});

test('compact layout is mobile screen only and the toggle is collection only', () => {
  const css = readFileSync(new URL('../out/compact-cards.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../out/index.html', import.meta.url), 'utf8');
  assert.match(css, /@media screen and \(max-width: 800px\)/);
  assert.match(css, /card-foot button \{ min-height: 44px;/);
  assert.match(html, /\$\('compact-cards'\)\.hidden=mode!=='cards'/);
  assert.match(html, /id="compact-cards"[^>]+aria-controls="results"/);
  assert.match(html, /src="\/compact-cards.js"/);
});
