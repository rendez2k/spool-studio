(() => {
  const button = document.getElementById('compact-cards');
  if (!button) return;
  const storageKey = 'filament-compact-cards';
  const apply = enabled => {
    document.body.classList.toggle('compact-cards', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  };
  let saved = false;
  try { saved = localStorage.getItem(storageKey) === 'true'; } catch {}
  apply(saved);
  button.addEventListener('click', () => {
    const enabled = !document.body.classList.contains('compact-cards');
    apply(enabled);
    try { localStorage.setItem(storageKey, String(enabled)); } catch {}
  });
})();
