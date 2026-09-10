import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextVersion, renderReleaseHTML, validateReleases } from '../scripts/releases.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const releases = JSON.parse(read('releases.json'));

test('release numbers increase explicitly without changing on every rebuild', () => {
  assert.equal(nextVersion('1.0.9'), '1.0.10');
  assert.equal(nextVersion('1.2.9', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.9', 'major'), '2.0.0');
  assert.throws(() => nextVersion('1.0.0', 'other'));
  assert.deepEqual(validateReleases(releases), releases);
  assert.throws(() => validateReleases([releases[0], releases[0]]));
  assert.throws(() => validateReleases([releases[0], {...releases[0],version:'99.0.0'}]));
  assert.throws(() => validateReleases([{...releases[0],changes:[]} ]));
});

test('builds embed the human release and escape notes, without account data or scripts', () => {
  const source = '<head></head><!-- APP_RELEASE_LINK --><!-- RELEASE_NOTES -->';
  const html = renderReleaseHTML(source, [{...releases[0],title:'<script>bad</script>',changes:['<img onerror="bad()">']}]);
  assert.match(html, /&lt;script&gt;/);
  assert(!html.includes('<img onerror'));
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.match(html, /What’s new \(opens in a new tab\)/);
  assert.equal(renderReleaseHTML('<head></head>unrelated', releases), '<head></head>unrelated');
  const info = JSON.parse(read('dist/netlify-public/app-release.json'));
  assert.equal(info.displayVersion, releases[0].version);
  assert.match(info.version, /^[a-f0-9]{12}$/);
  for (const name of ['index', 'nfc', 'import', 'app', 'reels']) {
    const page = read('dist/netlify-pages/' + name + '.html');
    assert(page.includes('name="app-display-version" content="' + info.displayVersion + '"'));
    assert(page.includes('>v' + info.displayVersion + '</span>'));
    assert(!page.includes('<!-- APP_RELEASE_LINK -->'));
  }
  const notes = read('dist/netlify-public/whats-new.html');
  assert(notes.includes('id="v' + info.displayVersion + '"'));
  assert(!notes.includes('<!-- RELEASE_NOTES -->'));
});
