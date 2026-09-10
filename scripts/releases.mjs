import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateReleases(releases) {
  if (!Array.isArray(releases) || !releases.length) throw Error('Release notes are required.');
  let previous = null;
  for (const release of releases) {
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || !/^\d{4}-\d{2}-\d{2}$/.test(release.date) || typeof release.title !== 'string' || !release.title.trim() || !Array.isArray(release.changes) || !release.changes.length || release.changes.some(change => typeof change !== 'string' || !change.trim())) throw Error('Invalid release notes.');
    const parts = release.version.split('.').map(Number);
    if (parts.some(part => !Number.isSafeInteger(part))) throw Error('Invalid release version.');
    if (previous) {
      const changed = parts.findIndex((part, index) => part !== previous[index]);
      if (changed < 0 || parts[changed] >= previous[changed]) throw Error('Release versions must be newest first and strictly increasing.');
    }
    previous = parts;
  }
  return releases;
}

export function nextVersion(version, kind = 'patch') {
  const parts = version.split('.').map(Number);
  const index = ['major', 'minor', 'patch'].indexOf(kind);
  if (index < 0 || !/^\d+\.\d+\.\d+$/.test(version)) throw Error('Choose patch, minor or major.');
  parts[index]++;
  return parts.map((part, position) => position > index ? 0 : part).join('.');
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function renderReleaseHTML(content, releases) {
  validateReleases(releases);
  if (!content.includes('<!-- APP_RELEASE_LINK -->') && !content.includes('<!-- RELEASE_NOTES -->')) return content;
  const version = releases[0].version;
  const link = '<a class="release-link" href="/whats-new.html#v' + version + '" target="_blank" rel="noopener" aria-label="Version ' + version + '. What’s new (opens in a new tab)" title="What’s new — opens in a new tab"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 14-5v14L3 14zM7 15l1 5h3l-1-4M21 9v6"/></svg><span>v' + version + '</span></a>';
  return content.replace('</head>', '<meta name="app-display-version" content="' + version + '"><link rel="stylesheet" href="/release.css"></head>')
    .replaceAll('<!-- APP_RELEASE_LINK -->', link)
    .replace('<!-- RELEASE_NOTES -->', releases.map(release => '<section class="release-entry" id="v' + release.version + '"><h2>v' + release.version + ' · ' + escape(release.title) + '</h2><p class="release-date"><time datetime="' + release.date + '">' + escape(new Date(release.date + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})) + '</time></p><ul>' + release.changes.map(change => '<li>' + escape(change) + '</li>').join('') + '</ul></section>').join(''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, title, ...changes] = process.argv.slice(2);
  if (!title?.trim() || !changes.length) throw Error('Usage: npm run release -- patch "Release title" "Change one" "Change two"');
  const filename = new URL('../releases.json', import.meta.url);
  const releases = validateReleases(JSON.parse(await readFile(filename, 'utf8')));
  releases.unshift({ version: nextVersion(releases[0].version, kind), date: new Date().toISOString().slice(0, 10), title, changes });
  validateReleases(releases);
  await writeFile(filename, JSON.stringify(releases, null, 2) + '\n');
  console.log('Prepared v' + releases[0].version + '. Review the notes, test, commit and deploy.');
}
