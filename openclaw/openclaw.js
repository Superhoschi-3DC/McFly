document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('agent-live');
  if (panel) {
    let previous = sessionStorage.getItem('ops-agent-state');
    let manual = sessionStorage.getItem('ops-agent-manual');
    const applyState = (state, autoOpen) => {
      if (state !== previous) { manual = null; sessionStorage.removeItem('ops-agent-manual'); }
      panel.open = manual === null ? autoOpen : manual === 'open';
      previous = state;
      sessionStorage.setItem('ops-agent-state', state);
    };
    applyState(panel.dataset.agentState, panel.dataset.autoOpen === 'true');
    panel.querySelector('summary').addEventListener('click', () => {
      manual = panel.open ? 'closed' : 'open';
      sessionStorage.setItem('ops-agent-manual', manual);
    });
    }

  document.querySelectorAll('details[data-persist-key]').forEach((details) => {
    const key = 'openclaw-ops-details:' + details.dataset.persistKey;
    const forceOpen = details.dataset.forceOpen === 'true';
    const saved = localStorage.getItem(key);
    if (forceOpen) details.open = true;
    else if (saved === 'open') details.open = true;
    else if (saved === 'closed') details.open = false;
    details.addEventListener('toggle', () => {
      if (details.dataset.forceOpen === 'true') {
        if (!details.open) details.open = true;
        return;
      }
      localStorage.setItem(key, details.open ? 'open' : 'closed');
    });
  });
  const cards = document.querySelectorAll('[data-usage-period]');
  const buttons = document.querySelectorAll('[data-period-button]');
  const activatePeriod = (period) => {
    cards.forEach((card) => { card.hidden = card.dataset.usagePeriod !== period; });
    buttons.forEach((button) => button.classList.toggle('active', button.dataset.periodButton === period));
    localStorage.setItem('openclaw-ops-usage-period', period);
  };
  buttons.forEach((button) => button.addEventListener('click', () => activatePeriod(button.dataset.periodButton)));
  if (buttons.length) activatePeriod(localStorage.getItem('openclaw-ops-usage-period') || 'thisWeek');
});
