/* Chérie — Feed unificado do Início */
(() => {
  'use strict';

  const feed = document.getElementById('home-feed');
  const feedback = document.getElementById('home-feedback');
  const count = document.getElementById('home-count');
  const moreButton = document.getElementById('home-more');
  const refreshButton = document.getElementById('home-refresh');

  if (!feed || !feedback || !count || !moreButton || !refreshButton) {
    return;
  }

  const sources = [
    {
      type: 'post',
      label: 'Post',
      api: '/api/posts',
      pageUrl: 'posts.html'
    },
    {
      type: 'video',
      label: 'Vídeo',
      api: '/api/videos',
      pageUrl: 'videos.html'
    },
    {
      type: 'image',
      label: 'Imagem',
      api: '/api/images',
      pageUrl: 'imagens.html'
    }
  ].map(source => ({
    ...source,
    page: 1,
    hasMore: true,
    items: []
  }));

  const stickers = {
    ':cherie_curledup:': 'cherie%20stickers/curledup.png',
    ':cherie_naughty:': 'cherie%20stickers/naughty.png',
    ':cherie_love:': 'cherie%20stickers/love.png',
    ':cherie_throwingup:': 'cherie%20stickers/throwingup.png'
  };

  let busy = false;
  let displayed = 0;
  const seen = new Set();

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    node.className = className;

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function timestamp(value) {
    let date = String(value || '').trim();

    // Datas do SQLite são armazenadas em UTC.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date)) {
      date = date.replace(' ', 'T') + 'Z';
    }

    const result = Date.parse(date);
    return Number.isFinite(result) ? result : 0;
  }

  function richText(value) {
    const box = element('div', 'home-post-body');
    const pattern =
      /(:cherie_curledup:|:cherie_naughty:|:cherie_love:|:cherie_throwingup:)/g;

    for (const part of String(value || '').split(pattern)) {
      if (stickers[part]) {
        const image = element('img', 'home-sticker');
        image.src = stickers[part];
        image.alt = 'Figurinha Chérie';
        image.loading = 'lazy';
        box.append(image);
      } else {
        box.append(document.createTextNode(part));
      }
    }

    return box;
  }

  async function fill(source) {
    while (!source.items.length && source.hasMore) {
      const response = await fetch(
        `${source.api}?sort=recentes&page=${source.page}`,
        {
          credentials: 'same-origin',
          cache: 'no-store'
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || !Array.isArray(data.posts)) {
        throw new Error(
          data?.message || `Não foi possível carregar: ${source.label}.`
        );
      }

      source.page++;
      source.hasMore = Boolean(data.has_more);

      source.items = data.posts
        .filter(item => !seen.has(`${source.type}:${item.id}`))
        .map(item => ({
          ...item,
          source,
          time: timestamp(item.created_at)
        }));
    }
  }

  function render(item) {
    const source = item.source;
    const url = `${source.pageUrl}?id=${encodeURIComponent(item.id)}`;
    const article = element('article', 'home-post');

    const header = element('div', 'home-post-header');
    const badge = element('span', 'home-post-type', source.label);
    const date = element('time', 'home-post-date');

    if (item.time) {
      date.dateTime = new Date(item.time).toISOString();
      date.textContent = new Date(item.time).toLocaleString('pt-BR');
    }

    header.append(badge, date);

    const title = element('h2', 'home-post-title');
    const titleLink = element('a', '', item.title || 'Sem título');
    titleLink.href = url;
    title.append(titleLink);

    const author = element('a', 'home-post-author');
    author.href = 'usuario.html?id=' + encodeURIComponent(item.author_id);

    const avatar = element('img', 'home-post-avatar');
    avatar.src = item.avatar || 'initial.jpeg';
    avatar.alt = '';
    avatar.loading = 'lazy';
    avatar.onerror = () => {
      avatar.onerror = null;
      avatar.src = 'initial.jpeg';
    };

    author.append(
      avatar,
      document.createTextNode(item.username || 'Usuário')
    );

    article.append(header, title, author, richText(item.body));

    if (source.type === 'image') {
      const gallery = element('div', 'home-media-grid');

      for (const file of item.images || []) {
        const link = element('a');
        link.href = file.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const image = element('img');
        image.src = file.url;
        image.alt = file.original_name || 'Imagem da publicação';
        image.loading = 'lazy';

        link.append(image);
        gallery.append(link);
      }

      article.append(gallery);
    }

    if (source.type === 'video') {
      const gallery = element('div', 'home-media-grid');

      for (const file of item.videos || []) {
        const video = element('video');
        video.src = file.url;
        video.controls = true;
        video.preload = 'none';
        video.playsInline = true;
        video.setAttribute(
          'aria-label',
          file.original_name || 'Vídeo da publicação'
        );

        gallery.append(video);
      }

      article.append(gallery);
    }

    const footer = element('div', 'home-post-footer');
    const votes = element(
      'span',
      '',
      `▲ ${item.upvotes || 0} · ▼ ${item.downvotes || 0}`
    );

    const comments = element(
      'a',
      '',
      `Abrir publicação · Comentários (${item.comment_count || 0})`
    );

    comments.href = url;
    footer.append(votes, comments);
    article.append(footer);

    return article;
  }

  async function load(reset = false) {
    if (busy) return;

    busy = true;
    moreButton.disabled = true;
    refreshButton.disabled = true;
    feedback.textContent = 'Carregando publicações...';

    if (reset) {
      seen.clear();
      displayed = 0;
      feed.replaceChildren();
      count.textContent = '0';

      for (const source of sources) {
        source.page = 1;
        source.hasMore = true;
        source.items = [];
      }
    }

    let failed = false;

    try {
      let added = 0;

      while (added < 20) {
        // Confere o próximo item das três áreas antes de escolher
        // a publicação mais recente.
        const results = await Promise.allSettled(
          sources.map(source => fill(source))
        );

        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;

        const candidates = sources
          .filter(source => source.items.length)
          .map(source => source.items[0]);

        if (!candidates.length) break;

        candidates.sort((a, b) =>
          b.time - a.time ||
          Number(b.id) - Number(a.id) ||
          a.source.type.localeCompare(b.source.type)
        );

        const item = candidates[0];
        item.source.items.shift();

        const key = `${item.source.type}:${item.id}`;
        if (seen.has(key)) continue;

        const card = render(item);
        seen.add(key);
        feed.append(card);

        displayed++;
        added++;
        count.textContent = String(displayed);
      }

      feedback.textContent = displayed
        ? ''
        : 'Ainda não há publicações.';
    } catch (error) {
      failed = true;
      feedback.textContent =
        `${error.message} Clique em “Tentar novamente” para continuar.`;
    } finally {
      const pending = sources.some(
        source => source.items.length || source.hasMore
      );

      moreButton.hidden = !failed && !pending;
      moreButton.textContent = failed ? 'Tentar novamente' : 'Carregar mais';
      moreButton.disabled = false;
      refreshButton.disabled = false;
      busy = false;
    }
  }

  // Ativa os links das áreas já disponíveis.
  document.querySelectorAll('.navigation a').forEach(link => {
    if (['posts.html', 'videos.html', 'imagens.html'].includes(
      link.getAttribute('href')
    )) {
      link.removeAttribute('aria-disabled');
    }
  });

  moreButton.addEventListener('click', () => load());
  refreshButton.addEventListener('click', () => load(true));

  load();
})();
