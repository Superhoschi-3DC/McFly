document.querySelectorAll('details[data-collapse-key]').forEach((group) => {
  const key = `macbook-dashboard:${group.dataset.collapseKey}`;
  const forceOpen = group.dataset.forceOpen === 'true';
  const saved = localStorage.getItem(key);
  if (forceOpen) group.open = true;
  else if (saved === 'open') group.open = true;
  else if (saved === 'closed') group.open = false;
  group.addEventListener('toggle', () => {
    if (group.dataset.forceOpen === 'true') {
      if (!group.open) group.open = true;
      return;
    }
    localStorage.setItem(key, group.open ? 'open' : 'closed');
  });
});
