import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('collection cards stretch per row and keep actions at the bottom without fixed heights', () => {
  const html = readFileSync(new URL('../out/index.html', import.meta.url), 'utf8');
  assert.match(html, /\.grid\{[^}]*align-items:stretch/);
  assert.match(html, /\.card\{display:flex;flex-direction:column/);
  assert.match(html, /\.card-body\{display:flex;flex-direction:column;flex:1/);
  assert.match(html, /\.card-foot\{[^}]*align-items:stretch;margin-top:auto/);
  assert.match(html, /\.card-top\{flex-shrink:0/);
  assert.match(html, /\.family-colours\{[^}]*flex-shrink:0/);
  assert.doesNotMatch(html.match(/\.card\{([^}]*)\}/)[1], /(?:^|;)height:/);
  const compact = readFileSync(new URL('../out/compact-cards.css', import.meta.url), 'utf8');
  assert.match(compact, /\.card-foot \{ margin-top: auto;/);
  assert.match(compact, /\.packaging \{ margin-bottom: 10px;/);
});
