/* Chérie — visitantes ativos */
(() => {
  'use strict';

  if (window.cheriePresenceStarted) return;
  window.cheriePresenceStarted = true;

  let sending = false;

  function showCount(value, failed = false) {
    document.querySelectorAll('[data-online-count]').forEach(counter => {
      counter.textContent = failed
        ? '—'
        : String(value).padStart(2, '0');

      counter.title = failed
        ? 'Não foi possível atualizar o contador.'
        : 'Navegadores ativos nos últimos 90 segundos.';
    });
  }

  async function heartbeat() {
    // Somente páginas visíveis renovam a presença.
    if (document.visibilityState !== 'visible' || sending) return;

    sending = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/presenca', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!Number.isInteger(data.online) || data.online < 0) {
        throw new Error('Contagem inválida.');
      }

      showCount(data.online);
    } catch (error) {
      showCount(null, true);
      console.warn('Contador de visitantes:', error.message);
    } finally {
      clearTimeout(timeout);
      sending = false;
    }
  }

  document.addEventListener('visibilitychange', heartbeat);
  window.addEventListener('pageshow', heartbeat);
  window.addEventListener('online', heartbeat);

  setInterval(heartbeat, 30000);
  heartbeat();
})();
