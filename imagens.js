/* Chérie — Imagens */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const el = (tag, cls = '', text) => {
    const element = document.createElement(tag);
    element.className = cls;

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  };

  let page = 1;
  let sort = 'recentes';
  let search = '';
  let current = null;
  let user = null;
  let selectedFiles = [];

  const stickers = [
    [':cherie_curledup:', 'cherie%20stickers/curledup.png'],
    [':cherie_naughty:', 'cherie%20stickers/naughty.png'],
    [':cherie_love:', 'cherie%20stickers/love.png'],
    [':cherie_throwingup:', 'cherie%20stickers/throwingup.png']
  ];

  const say = message => {
    $('forum-feedback').textContent = message || '';
  };

  async function api(url, method = 'GET', body) {
    const options = {
      method,
      credentials: 'same-origin',
      cache: 'no-store'
    };

    if (body !== undefined) {
      options.headers = {
        'Content-Type': 'application/json'
      };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Error(data.message || `Erro HTTP ${response.status}`);
    }

    return data;
  }

  function rich(value) {
    const box = el('div', 'post-body');
    const pattern =
      /(:cherie_curledup:|:cherie_naughty:|:cherie_love:|:cherie_throwingup:)/g;

    for (const part of String(value || '').split(pattern)) {
      const found = stickers.find(item => item[0] === part);

      if (found) {
        const image = el('img', 'cat-sticker');
        image.src = found[1];
        image.alt = 'Figurinha Chérie';
        image.loading = 'lazy';
        box.append(image);
      } else {
        box.append(document.createTextNode(part));
      }
    }

    return box;
  }

  function stickerBars() {
    document.querySelectorAll('.sticker-bar').forEach(bar => {
      const target = $(bar.dataset.target);
      if (!target) return;

      const toggle = el('button', 'sticker-toggle', 'Figurinhas');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');

      const menu = el('div', 'sticker-menu');
      menu.hidden = true;
      menu.append(el('div', 'sticker-menu-title', 'Lista de figurinhas'));

      const grid = el('div', 'sticker-grid');

      stickers.forEach(([token, src]) => {
        const button = el('button', 'sticker-choice');
        button.type = 'button';
        button.title = token;

        const image = el('img');
        image.src = src;
        image.alt = token;
        button.append(image);

        button.onclick = () => {
          target.setRangeText(
            token,
            target.selectionStart,
            target.selectionEnd,
            'end'
          );

          target.focus();
          menu.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
        };

        grid.append(button);
      });

      menu.append(grid);

      toggle.onclick = () => {
        menu.hidden = !menu.hidden;
        toggle.setAttribute('aria-expanded', String(!menu.hidden));
      };

      bar.replaceChildren(toggle, menu);
    });
  }

  function author(item) {
    const meta = el('div', 'post-meta');
    const image = el('img');

    image.src = item.avatar || 'initial.jpeg';
    image.alt = 'Avatar';

    image.onerror = () => {
      image.onerror = null;
      image.src = 'initial.jpeg';
    };

    const link = el('a', 'user-link', item.username);
    link.href = 'usuario.html?id=' + encodeURIComponent(item.author_id);

    const time = el('span', '', item.created_at || '');

    meta.append(image, link, time);
    return meta;
  }

  function votes(item, kind) {
    const wrap = el('div', 'content-votes');
    const up = el('button', 'vote-arrow', '▲');
    const down = el('button', 'vote-arrow', '▼');

    const score = el(
      'strong',
      'vote-score',
      String((item.upvotes || 0) - (item.downvotes || 0))
    );

    [up, down].forEach((button, index) => {
      const value = index === 0 ? 1 : -1;

      button.type = 'button';
      button.classList.toggle('active', item.my_vote === value);

      button.onclick = async () => {
        if (!user) {
          say('Entre na sua conta para votar.');
          return;
        }

        try {
          const data = await api('/api/images/vote', 'POST', {
            kind,
            id: item.id,
            vote: item.my_vote === value ? 0 : value
          });

          item.my_vote = data.my_vote;
          item.upvotes = data.upvotes;
          item.downvotes = data.downvotes;

          up.classList.toggle('active', item.my_vote === 1);
          down.classList.toggle('active', item.my_vote === -1);
          score.textContent = String(data.upvotes - data.downvotes);
        } catch (error) {
          say(error.message);
        }
      };
    });

    wrap.append(up, score, down, el('span', 'vote-details', 'Votos'));
    return wrap;
  }

  function remove(item, kind) {
    if (
      !user ||
      (
        Number(item.author_id) !== Number(user.id) &&
        user.username.toLowerCase() !== 'eloyse'
      )
    ) {
      return null;
    }

    const button = el(
      'button',
      'posts-metal-button delete-content-button',
      '✕ Excluir'
    );

    button.type = 'button';

    button.onclick = async () => {
      const message = kind === 'image'
        ? 'Excluir esta publicação, todas as imagens e comentários?'
        : 'Excluir este comentário?';

      if (!confirm(message)) return;

      button.disabled = true;

      try {
        const endpoint = kind === 'image'
          ? '/api/images'
          : '/api/images/comment';

        await api(endpoint + '?id=' + item.id, 'DELETE');

        if (kind === 'image') {
          current = null;
          history.replaceState(null, '', 'imagens.html');
          await feed();
        } else {
          await detail(current);
        }
      } catch (error) {
        say(error.message);
        button.disabled = false;
      }
    };

    return button;
  }

  function card(item, expanded = false) {
    const box = el('article', 'post-card');
    box.append(el('div', 'post-card-head', 'Publicações com imagens'));

    const body = el('div', 'post-content');
    const title = el('h2', 'post-title');

    if (expanded) {
      title.textContent = item.title;
    } else {
      const link = el('a', '', item.title);
      link.href = 'imagens.html?id=' + item.id;
      title.append(link);
    }

    body.append(title, author(item), rich(item.body));

    const grid = el('div', 'image-grid');

    (item.images || []).forEach(file => {
      const figure = el('figure');
      const link = el('a');

      link.href = file.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';

      const image = el('img');
      image.src = file.url;
      image.alt = file.original_name;
      image.loading = 'lazy';

      link.append(image);

      const caption = el('figcaption', '', file.original_name);

      figure.append(link, caption);
      grid.append(figure);
    });

    body.append(grid, votes(item, 'image'));

    const deleteButton = remove(item, 'image');
    if (deleteButton) body.append(deleteButton);

    box.append(body);

    if (!expanded) {
      const footer = el('div', 'post-actions');

      const link = el(
        'a',
        '',
        `Comentários (${item.comment_count || 0}) →`
      );

      link.href = 'imagens.html?id=' + item.id;
      footer.append(link);
      box.append(footer);
    }

    return box;
  }

  function commentCard(item) {
    const box = el('article', 'comment-card');

    box.append(author(item), rich(item.body), votes(item, 'comment'));

    const deleteButton = remove(item, 'comment');
    if (deleteButton) box.append(deleteButton);

    return box;
  }

  function displayDetail(show) {
    $('post-detail').hidden = !show;
    $('images-feed').hidden = show;
    $('pagination').hidden = show;
  }

  async function feed() {
    displayDetail(false);
    $('compose-panel').hidden = true;
    say('Carregando imagens...');

    try {
      const query = new URLSearchParams({
        page: String(page),
        sort,
        search
      });

      const data = await api('/api/images?' + query);
      const container = $('images-feed');
      container.replaceChildren();

      if (!data.posts.length) {
        container.append(el(
          'div',
          'empty-posts',
          search
            ? 'Nenhuma imagem encontrada.'
            : 'Ainda não há imagens publicadas.'
        ));
      }

      data.posts.forEach(post => container.append(card(post)));

      $('page-label').textContent = 'Página ' + page;
      $('prev-page').disabled = page === 1;
      $('next-page').disabled = !data.has_more;
      say('');
    } catch (error) {
      say(error.message);
    }
  }

  async function detail(id) {
    current = id;
    displayDetail(true);
    say('Carregando publicação...');

    try {
      const data = await api('/api/image?id=' + id);

      $('detail-content').replaceChildren(card(data.post, true));
      $('comments-list').replaceChildren(
        ...data.comments.map(commentCard)
      );

      say('');
    } catch (error) {
      say(error.message);
    }
  }

  async function upload(postId, file) {
    const url = '/api/images/upload?post_id=' + encodeURIComponent(postId);

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Image-Name': encodeURIComponent(file.name)
      },
      body: file
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Error(data.message || `Erro HTTP ${response.status}`);
    }

    return data;
  }

  // Mantém os arquivos entre várias aberturas do seletor.
  const fileInput = $('image-files');
  fileInput.required = false;
  fileInput.multiple = true;

  function selected() {
    const list = $('image-selected');
    list.replaceChildren();

    list.append(el(
      'div',
      '',
      `${selectedFiles.length} de 10 imagens selecionadas. Escolha mais arquivos para adicionar.`
    ));

    selectedFiles.forEach((file, index) => {
      const row = el('div');
      const button = el('button', '', 'Remover');

      button.type = 'button';
      button.disabled = $('image-submit').disabled;
      button.setAttribute('aria-label', `Remover ${file.name}`);

      button.onclick = () => {
        selectedFiles.splice(index, 1);
        selected();
      };

      row.append(document.createTextNode(file.name + ' '), button);
      list.append(row);
    });
  }

  fileInput.addEventListener('change', () => {
    if ($('image-submit').disabled) {
      fileInput.value = '';
      return;
    }

    const additions = [];

    for (const file of fileInput.files) {
      const duplicate = [...selectedFiles, ...additions].some(
        old =>
          old.name === file.name &&
          old.size === file.size &&
          old.lastModified === file.lastModified
      );

      if (!duplicate) additions.push(file);
    }

    fileInput.value = '';

    if (selectedFiles.length + additions.length > 10) {
      say('Limite de 10 imagens por publicação. Remova alguma antes de adicionar mais.');
      return;
    }

    const oversized = additions.find(
      file => file.size > 12 * 1024 * 1024
    );

    if (oversized) {
      say(`O arquivo ${oversized.name} excede 12 MB.`);
      return;
    }

    selectedFiles.push(...additions);
    selected();
  });

  $('image-form').addEventListener('reset', () => {
    selectedFiles = [];
    fileInput.value = '';
    selected();
  });

  selected();

  $('open-compose').onclick = () => {
    $('compose-panel').hidden = !$('compose-panel').hidden;
  };

  $('cancel-compose').onclick = () => {
    $('compose-panel').hidden = true;
  };

  $('image-form').onsubmit = async event => {
    event.preventDefault();

    const submit = $('image-submit');
    if (submit.disabled) return;

    const files = [...selectedFiles];

    if (!files.length || files.length > 10) {
      say('Selecione de 1 a 10 imagens.');
      return;
    }

    for (const file of files) {
      if (file.size > 12 * 1024 * 1024) {
        say(`O arquivo ${file.name} excede 12 MB.`);
        return;
      }
    }

    submit.disabled = true;
    fileInput.disabled = true;
    selected();

    let postId = null;

    try {
      const data = await api('/api/images', 'POST', {
        title: $('image-title').value,
        body: $('image-body').value
      });

      postId = data.id;

      for (let index = 0; index < files.length; index++) {
        say(
          `Enviando imagem ${index + 1} de ${files.length}: ${files[index].name}`
        );

        await upload(postId, files[index]);
      }

      $('image-form').reset();
      $('compose-panel').hidden = true;

      page = 1;
      history.replaceState(null, '', 'imagens.html');

      await feed();
      say('Imagens publicadas com sucesso!');
    } catch (error) {
      const notice = postId
        ? 'Os arquivos enviados com sucesso podem permanecer na publicação; verifique a lista antes de tentar novamente.'
        : '';

      say(`Falha no envio: ${error.message}. ${notice}`);
    } finally {
      submit.disabled = false;
      fileInput.disabled = false;
      selected();
    }
  };

  $('comment-form').onsubmit = async event => {
    event.preventDefault();
    if (!current) return;

    try {
      await api('/api/images/comment', 'POST', {
        post_id: current,
        body: $('comment-body').value
      });

      $('comment-body').value = '';
      await detail(current);
    } catch (error) {
      say(error.message);
    }
  };

  $('back-to-posts').onclick = () => {
    current = null;
    history.replaceState(null, '', 'imagens.html');
    feed();
  };

  $('prev-page').onclick = () => {
    if (page > 1) {
      page--;
      feed();
    }
  };

  $('next-page').onclick = () => {
    page++;
    feed();
  };

  document.querySelectorAll('.filter-button').forEach(button => {
    button.onclick = () => {
      sort = button.dataset.sort;
      page = 1;

      document.querySelectorAll('.filter-button').forEach(other => {
        other.classList.toggle('active', other === button);
      });

      feed();
    };
  });

  $('posts-search-form').onsubmit = event => {
    event.preventDefault();
    search = $('posts-search').value.trim();
    page = 1;
    feed();
  };

  $('posts-search').addEventListener('search', () => {
    search = $('posts-search').value.trim();
    page = 1;
    feed();
  });

  stickerBars();

  (async () => {
    try {
      user = await api('/api/me');
      $('forum-username').textContent = user.username;
      $('forum-avatar').src = user.avatar || 'initial.jpeg';
    } catch (error) {
      $('forum-username').textContent = 'Visitante';
      say('Faça login para publicar imagens.');
    }

    const id = new URLSearchParams(location.search).get('id');

    if (id && /^\d+$/.test(id)) {
      await detail(Number(id));
    } else {
      await feed();
    }
  })();
})();
