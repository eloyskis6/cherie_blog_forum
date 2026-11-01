

/*
  CHÉRIE - POSTS
  Publicações, comentários, votos, perfis
  e menu exclusivo de figurinhas.
*/

(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  /* FIGURINHAS OFICIAIS */

  const STICKERS = [
    {
      label: "Chérie enroladinha",
      value: ":cherie_curledup:",
      src: "cherie%20stickers/curledup.png"
    },
    {
      label: "Chérie travessa",
      value: ":cherie_naughty:",
      src: "cherie%20stickers/naughty.png"
    },
    {
      label: "Chérie apaixonada",
      value: ":cherie_love:",
      src: "cherie%20stickers/love.png"
    },
    {
      label: "Chérie passando mal",
      value: ":cherie_throwingup:",
      src: "cherie%20stickers/throwingup.png"
    }
  ];

  const IMAGES = Object.fromEntries(
    STICKERS.map(sticker => [
      sticker.value,
      sticker.src
    ])
  );

  // Compatibilidade com publicações antigas.
  Object.assign(IMAGES, {
    ":cherie:": "cherie.login.png",
    ":gatinha:": "cadastro.cherie.jpeg",
    ":miau:": "cherie.concluido.png"
  });

  let page = 1;
  let currentPost = null;
  let loggedIn = false;
  let currentUserId = null;
  let currentUsername = "";
  let currentSort = "recentes";
  let currentSearch = "";
  /* API */

  async function api(url, method = "GET", data) {
    const options = {
      method,
      credentials: "same-origin",
      cache: "no-store"
    };

    if (data !== undefined) {
      options.headers = {
        "Content-Type": "application/json"
      };

      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    const result = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.message || `Erro HTTP ${response.status}`
      );
    }

    return result;
  }

  /* ELEMENTOS */

  function el(tag, className = "", text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function say(message) {
    $("forum-feedback").textContent = message || "";
  }

  /* PERFIS */

  function profileLink(user) {
    const link = el(
      "a",
      "user-link",
      user.username
    );

    link.href =
      "usuario.html?id=" +
      encodeURIComponent(user.author_id);

    return link;
  }

  function avatar(user) {
    const image = el("img");

    image.src = user.avatar || "initial.jpeg";
    image.alt = "Foto de " + user.username;

    image.onerror = () => {
      image.onerror = null;
      image.src = "initial.jpeg";
    };

    return image;
  }

  function dateLabel(value) {
    const date = new Date(
      value.replace(" ", "T") + "Z"
    );

    return Number.isNaN(date.valueOf())
      ? value
      : date.toLocaleString("pt-BR");
  }

  function authorLine(user) {
    const row = el("div", "post-meta");

    row.append(
      avatar(user),
      profileLink(user),
      el("span", "", dateLabel(user.created_at))
    );

    return row;
  }

  /* EXIBIÇÃO DE TEXTO E FIGURINHAS */

  function richText(value) {
    const container = el("div", "post-body");

    const pattern =
      /(:cherie_curledup:|:cherie_naughty:|:cherie_love:|:cherie_throwingup:|:cherie:|:gatinha:|:miau:)/g;

    const pieces = String(value).split(pattern);

    for (const piece of pieces) {
      if (
        Object.prototype.hasOwnProperty.call(
          IMAGES,
          piece
        )
      ) {
        const image = el("img", "cat-sticker");

        image.src = IMAGES[piece];
        image.alt = "Figurinha da Chérie";
        image.loading = "lazy";

        container.append(image);
      } else {
        container.append(
          document.createTextNode(piece)
        );
      }
    }

    return container;
  }

  /* UPVOTES E DOWNVOTES */

  function voteControls(item, kind) {
    const bar = el("div", "content-votes");

    const up = el(
      "button",
      "vote-arrow" +
        (item.my_vote === 1 ? " active" : ""),
      "▲"
    );

    const down = el(
      "button",
      "vote-arrow" +
        (item.my_vote === -1 ? " active" : ""),
      "▼"
    );

    up.type = "button";
    down.type = "button";

    up.title = "Upvote";
    down.title = "Downvote";

    up.setAttribute(
      "aria-label",
      "Votar positivamente"
    );

    down.setAttribute(
      "aria-label",
      "Votar negativamente"
    );

    up.setAttribute(
      "aria-pressed",
      String(item.my_vote === 1)
    );

    down.setAttribute(
      "aria-pressed",
      String(item.my_vote === -1)
    );

    const score = el(
      "span",
      "vote-score",
      String(
        (item.upvotes || 0) -
        (item.downvotes || 0)
      )
    );

    const details = el(
      "span",
      "vote-details",
      `${item.upvotes || 0} ↑  ${item.downvotes || 0} ↓`
    );

    async function vote(value) {
      if (!loggedIn) {
        say("Faça o login para votar.");
        return;
      }

      up.disabled = true;
      down.disabled = true;

      try {
        const result = await api(
          "/api/voto-conteudo",
          "POST",
          {
            kind,
            id: item.id,
            vote:
              item.my_vote === value ? 0 : value
          }
        );

        item.my_vote = result.my_vote;
        item.upvotes = result.upvotes;
        item.downvotes = result.downvotes;

        score.textContent = String(
          result.upvotes - result.downvotes
        );

        details.textContent =
          `${result.upvotes} ↑  ${result.downvotes} ↓`;

        up.classList.toggle(
          "active",
          result.my_vote === 1
        );

        down.classList.toggle(
          "active",
          result.my_vote === -1
        );

        up.setAttribute(
          "aria-pressed",
          String(result.my_vote === 1)
        );

        down.setAttribute(
          "aria-pressed",
          String(result.my_vote === -1)
        );

        say("");

      } catch (error) {
        say(error.message);
      } finally {
        up.disabled = false;
        down.disabled = false;
      }
    }

    up.onclick = () => vote(1);
    down.onclick = () => vote(-1);

    bar.append(
      up,
      score,
      down,
      details
    );

    return bar;
  }

  /* PUBLICAÇÕES */


function deleteButton(item, kind) {
  if (!loggedIn) return null;

  const isOwner =
    Number(item.author_id) === currentUserId;

  const isAdmin =
    currentUsername.toLowerCase() === "eloyse";

  if (!isOwner && !isAdmin) {
    return null;
  }

  const button = el(
    "button",
    "posts-metal-button delete-content-button",
    "✕ Excluir"
  );

  button.type = "button";

  button.addEventListener("click", async () => {
    const isPost = kind === "post";

    const message = isPost
      ? "Deseja excluir esta publicação e todos os comentários?"
      : "Deseja excluir este comentário?";

    if (!window.confirm(message)) return;

    button.disabled = true;
    button.textContent = "Excluindo...";

    try {
      const endpoint = isPost
        ? "/api/posts"
        : "/api/comentarios";

      await api(
        endpoint + "?id=" + encodeURIComponent(item.id),
        "DELETE"
      );

      if (isPost) {
        currentPost = null;

        history.replaceState(
          null,
          "",
          "posts.html"
        );

        page = 1;
        await loadFeed();
      } else {
        await loadDetail(currentPost);
      }

    } catch (error) {
      say(error.message);

      button.disabled = false;
      button.textContent = "✕ Excluir";
    }
  });

  return button;
}


  function postCard(post, detail = false) {
    const article = el("article", "post-card");

    article.append(
      el(
        "div",
        "post-card-head",
        "Publicações"
      )
    );

    const content = el("div", "post-content");

    const title = el(
      "h2",
      "post-title",
      post.title
    );

    if (!detail) {
      const link = el("a", "", post.title);

      link.href =
        "posts.html?id=" +
        encodeURIComponent(post.id);

      title.replaceChildren(link);
    }

    
content.append(
  title,
  authorLine(post),
  richText(post.body),
  voteControls(post, "post")
);

const removePost = deleteButton(post, "post");

if (removePost) {
  const actions = el("div", "delete-actions");
  actions.append(removePost);
  content.append(actions);
}


    article.append(content);

    if (!detail) {
      const actions = el(
        "div",
        "post-actions"
      );

      const link = el(
        "a",
        "",
        `Comentários (${post.comment_count})`
      );

      link.href =
        "posts.html?id=" +
        encodeURIComponent(post.id);

      actions.append(
        link,
        el("span", "", "#" + post.id)
      );

      article.append(actions);
    }

    return article;
  }

  /* COMENTÁRIOS */

  function commentCard(comment) {
    const article = el(
      "article",
      "comment-card"
    );

    article.append(
      authorLine(comment)
    );

    const body = richText(comment.body);
    body.className = "comment-body";

   
article.append(
  body,
  voteControls(comment, "comment")
);

const removeComment = deleteButton(
  comment,
  "comment"
);

if (removeComment) {
  const actions = el("div", "delete-actions");
  actions.append(removeComment);
  article.append(actions);
}


    return article;
  }

  /* ALTERNAR ENTRE LISTA E POST ABERTO */

  function showDetail(isDetail) {
    $("post-detail").hidden = !isDetail;
    $("posts-feed").hidden = isDetail;
    $("pagination").hidden = isDetail;
    $("open-compose").hidden = isDetail;

    if (isDetail) {
      $("compose-panel").hidden = true;
    }
  }

  /* CARREGAR POSTS */

  
async function loadFeed() {
  showDetail(false);

  say("Carregando publicações...");

  try {
    const params = new URLSearchParams({
      page: String(page),
      sort: currentSort,
      search: currentSearch
    });

    const data = await api(
      "/api/posts?" + params.toString()
    );

    const feed = $("posts-feed");
    feed.replaceChildren();

    if (!data.posts.length) {
      feed.append(
        el(
          "div",
          "empty-posts",
          currentSearch
            ? "Nenhuma publicação encontrada."
            : "Ainda não há publicações por aqui."
        )
      );
    }

    for (const post of data.posts) {
      feed.append(postCard(post));
    }

    $("page-label").textContent = "Página " + page;
    $("prev-page").disabled = page <= 1;
    $("next-page").disabled = !data.has_more;

    say("");

  } catch (error) {
    say(error.message);
  }
}
 

  /* CARREGAR POST E COMENTÁRIOS */

  async function loadDetail(id) {
    showDetail(true);

    say("Carregando publicação...");

    try {
      const data = await api(
        "/api/post?id=" +
        encodeURIComponent(id)
      );

      currentPost = data.post.id;

      $("detail-content").replaceChildren(
        postCard(data.post, true)
      );

      const comments = $("comments-list");
      comments.replaceChildren();

      if (!data.comments.length) {
        comments.append(
          el(
            "div",
            "empty-posts",
            "Nenhum comentário ainda."
          )
        );
      }

      for (const comment of data.comments) {
        comments.append(
          commentCard(comment)
        );
      }

      if (data.comments_truncated) {
        comments.append(
          el(
            "p",
            "",
            "Exibindo os primeiros 500 comentários."
          )
        );
      }

      $("comment-form").hidden = !loggedIn;

      say("");

    } catch (error) {
      say(error.message);
    }
  }

  /* =====================================
     MENU EXCLUSIVO DE FIGURINHAS
     ===================================== */

  function insertAtCursor(input, text) {
    const start = input.selectionStart;
    const end = input.selectionEnd;

    const newLength =
      input.value.length -
      (end - start) +
      text.length;

    if (
      input.maxLength > 0 &&
      newLength > input.maxLength
    ) {
      say("Limite de caracteres atingido.");
      return false;
    }

    input.setRangeText(
      text,
      start,
      end,
      "end"
    );

    input.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    input.focus();
    return true;
  }

  function stickerBars() {
    const bars = document.querySelectorAll(
      ".sticker-bar"
    );

    bars.forEach((bar, index) => {
      const target = $(bar.dataset.target);

      if (!target) return;

      /* Botão principal */

      const toggle = el(
        "button",
        "sticker-toggle",
        "Figurinhas"
      );

      toggle.type = "button";

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );

      /* Janela das figurinhas */

      const menu = el(
        "div",
        "sticker-menu"
      );

      menu.id = "cherie-stickers-" + index;
      menu.hidden = true;

      toggle.setAttribute(
        "aria-controls",
        menu.id
      );

      const title = el(
        "div",
        "sticker-menu-title",
        "Lista de figurinhas"
      );

      const grid = el(
        "div",
        "sticker-grid"
      );

      /* Botões com as imagens */

      for (const sticker of STICKERS) {
        const button = el(
          "button",
          "sticker-choice"
        );

        button.type = "button";
        button.title = sticker.label;

        button.setAttribute(
          "aria-label",
          "Inserir " + sticker.label
        );

        const image = el("img");

        image.src = sticker.src;
        image.alt = sticker.label;
        image.loading = "lazy";

        button.append(image);

        button.addEventListener(
          "click",
          () => {
            const inserted = insertAtCursor(
              target,
              sticker.value
            );

            if (inserted) {
              menu.hidden = true;

              toggle.setAttribute(
                "aria-expanded",
                "false"
              );

              say("");
            }
          }
        );

        grid.append(button);
      }

      menu.append(title, grid);

      /* Abrir ou fechar */

      toggle.addEventListener(
        "click",
        () => {
          const open = menu.hidden;

          menu.hidden = !open;

          toggle.setAttribute(
            "aria-expanded",
            String(open)
          );
        }
      );

      bar.replaceChildren(
        toggle,
        menu
      );
    });
  }

  /* CARREGAR CONTA */

  async function loadAccount() {
    try {
      const user = await api("/api/me");
currentUserId = Number(user.id);
currentUsername = user.username;

      loggedIn = true;

      $("forum-username").textContent =
        user.username;

      $("forum-avatar").src =
        user.avatar || "initial.jpeg";

    } catch {
      loggedIn = false;

      $("forum-username").textContent =
        "Visitante";

      if ($("forum-logout")) {
  $("forum-logout").hidden = true;
}
      $("open-compose").hidden = true;
      $("comment-form").hidden = true;
    }
  }

  /* ABRIR FORMULÁRIO DE POST */

  $("open-compose").onclick = () => {
    $("compose-panel").hidden =
      !$("compose-panel").hidden;
  };

  $("cancel-compose").onclick = () => {
    $("compose-panel").hidden = true;
  };

  /* PUBLICAR POST */

  $("post-form").onsubmit = async event => {
    event.preventDefault();

    const button = $("post-form")
      .querySelector('[type="submit"]');

    button.disabled = true;

    try {
      const result = await api(
        "/api/posts",
        "POST",
        {
          title: $("post-title").value,
          body: $("post-body").value
        }
      );

      location.href =
        "posts.html?id=" +
        encodeURIComponent(result.id);

    } catch (error) {
      say(error.message);
    } finally {
      button.disabled = false;
    }
  };

  /* PUBLICAR COMENTÁRIO */

  $("comment-form").onsubmit = async event => {
    event.preventDefault();

    const button = $("comment-form")
      .querySelector('[type="submit"]');

    button.disabled = true;

    try {
      await api(
        "/api/comentarios",
        "POST",
        {
          post_id: currentPost,
          body: $("comment-body").value
        }
      );

      $("comment-body").value = "";

      await loadDetail(currentPost);

    } catch (error) {
      say(error.message);
    } finally {
      button.disabled = false;
    }
  };

  /* VOLTAR AOS POSTS */

  $("back-to-posts").onclick = () => {
    history.pushState(
      null,
      "",
      "posts.html"
    );

    loadFeed();
  };

  /* PAGINAÇÃO */

  $("prev-page").onclick = () => {
    if (page > 1) {
      page--;
      loadFeed();
    }
  };

  $("next-page").onclick = () => {
    page++;
    loadFeed();
  };

  
  /* SAIR DA CONTA - OPCIONAL */

  const logoutButton = $("forum-logout");

  if (logoutButton) {
    logoutButton.onclick = async () => {
      try {
        await api("/api/sair", "POST", {});
        location.href = "index.html";
      } catch (error) {
        say(error.message);
      }
    };
  }


/* ORDENAÇÃO DE PUBLICAÇÕES */

document.querySelectorAll(".filter-button")
  .forEach(button => {
    button.addEventListener("click", () => {
      currentSort = button.dataset.sort;
      page = 1;

      document.querySelectorAll(".filter-button")
        .forEach(item => {
          item.classList.toggle(
            "active",
            item === button
          );
        });

      loadFeed();
    });
  });

/* PESQUISA DE PUBLICAÇÕES */

const searchForm = $("posts-search-form");

if (searchForm) {
  searchForm.addEventListener("submit", event => {
    event.preventDefault();

    currentSearch = $("posts-search").value.trim();
    page = 1;

    loadFeed();
  });

  $("posts-search").addEventListener("search", () => {
    currentSearch = $("posts-search").value.trim();
    page = 1;

    loadFeed();
  });
}



  /* INICIALIZAÇÃO */

  stickerBars();

  (async () => {
    await loadAccount();

    const id = new URLSearchParams(
      location.search
    ).get("id");

    if (id && /^\d+$/.test(id)) {
      await loadDetail(Number(id));
    } else {
      await loadFeed();
    }
  })();

})();

