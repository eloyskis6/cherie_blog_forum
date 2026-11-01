
"use strict";

let blogUser = null;
let blogArticles = [];
let selectedBlogImages = [];
let selectedBlogVideos = [];

const $ = (id) => document.getElementById(id);

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  return el;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function api(url, method = "GET", body = null) {
  const options = {
    method,
    credentials: "same-origin"
  };

  if (body !== null) {
    options.headers = {
      "Content-Type": "application/json"
    };
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Erro na solicitação.");
  }

  return data;
}

function isAdmin() {
  return blogUser?.username?.toLowerCase() === "eloyse";
}


async function loadUser() {
  try {
    const data = await api("/api/me");
    blogUser = data.user || data;

    if (!blogUser || !blogUser.username) {
      blogUser = null;
    }
  } catch (error) {
    console.error("Não foi possível carregar a sessão:", error);
    blogUser = null;
  }

  $("blog-admin").hidden = !isAdmin();
}


function createArticle(article) {
  const card = element("article", "blog-article");

  const top = element("div", "blog-article-top");
  top.append(
    element("span", "", "Publicação: "), 
    element("span", "", formatDate(article.criado_em))
  );
  card.append(top);

  card.append(element("h2", "", article.titulo));

  if (article.subtitulo) {
    card.append(element("p", "blog-subtitle", article.subtitulo));
  }

  card.append(element("div", "blog-content", article.conteudo));
  if (Array.isArray(article.midias) && article.midias.length) {
    const gallery = element("div", "blog-media-gallery");
    for (const media of article.midias) {
      if (!/^\/api\/blog\?midia=\d+$/.test(media.url)) continue;
      const figure = document.createElement("figure");
      const node = document.createElement(media.tipo === "video" ? "video" : "img");
      node.src = media.url;
      if (media.tipo === "video") {
        node.controls = true;
        node.preload = "metadata";
      } else {
        node.loading = "lazy";
        node.alt = "Imagem da publicação";
      }
      figure.append(node);
      gallery.append(figure);
    }
    card.append(gallery);
  }

  const actions = element("div", "blog-article-actions");

  const commentsButton = element(
    "button",
    "blog-button",
    `Comentários (${article.comentarios})`
  );
  commentsButton.type = "button";

  actions.append(commentsButton);

  if (isAdmin()) {
    const deleteButton = element(
      "button",
      "blog-delete",
      "Excluir publicação"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", async () => {
      if (!confirm("Excluir esta publicação e todos os comentários?")) {
        return;
      }

      deleteButton.disabled = true;

      try {
        await api("/api/blog/excluir", "POST", {
          id: article.id
        });
        await loadArticles();
      } catch (error) {
        alert(error.message);
        deleteButton.disabled = false;
      }
    });

    actions.append(deleteButton);
  }

  card.append(actions);

  const commentsPanel = element("section", "blog-comments");
  commentsPanel.hidden = true;

  commentsButton.addEventListener("click", async () => {
    commentsPanel.hidden = !commentsPanel.hidden;

    if (!commentsPanel.hidden) {
      await loadComments(article.id, commentsPanel);
    }
  });

  card.append(commentsPanel);

  return card;
}

async function loadArticles() {
  const feed = $("blog-feed");
  feed.replaceChildren(
    element("p", "blog-empty", "Carregando publicações...")
  );

  try {
    const data = await api("/api/blog");
    blogArticles = data.artigos || [];

    $("blog-total").textContent =
      `${blogArticles.length} REGISTRO(S)`;

    feed.replaceChildren();

    if (!blogArticles.length) {
      feed.append(
        element(
          "p",
          "blog-empty",
          "Nossa está tão vazio por aqui" +
          " :("
        )
      );
      return;
    }

    blogArticles.forEach((article) => {
      feed.append(createArticle(article));
    });

  } catch (error) {
    feed.replaceChildren(
      element("p", "blog-empty", error.message)
    );
  }
}

async function loadComments(articleId, panel) {
  panel.replaceChildren(
    element("p", "blog-empty", "Carregando comentários...")
  );

  try {
    const data = await api(
      `/api/blog/comentarios?id=${encodeURIComponent(articleId)}`
    );

    panel.replaceChildren();

    const heading = element(
      "div",
      "blog-section-head",
      "Comentários"
    );
    panel.append(heading);

    if (!data.comentarios.length) {
      panel.append(
        element(
          "p",
          "blog-empty",
          "Ainda não há comentários. Seja o primeiro a conversar!"
        )
      );
    }

    for (const comment of data.comentarios) {
      const item = element("div", "blog-comment");
      const author = element("div", "blog-comment-author");

      const avatar = document.createElement("img");

      // Aceita apenas caminhos locais de avatar.
      const avatarPath = String(comment.avatar || "");
      avatar.src = (
        avatarPath === "initial.jpeg" ||
        /^\/uploads\/[A-Za-z0-9_.-]+$/.test(avatarPath)
      ) ? avatarPath : "initial.jpeg";

      avatar.alt = "";

      author.append(
        avatar,
        element("span", "", comment.autor)
      );

      item.append(
        author,
        element("p", "", comment.conteudo),
        element(
          "small",
          "blog-comment-meta",
          formatDate(comment.criado_em)
        )
      );

      if (
        blogUser &&
        (isAdmin() || blogUser.id === comment.autor_id)
      ) {
        const remove = element(
          "button",
          "blog-delete",
          "Excluir comentário"
        );

        remove.type = "button";
        remove.style.marginTop = "8px";

        remove.addEventListener("click", async () => {
          if (!confirm("Excluir este comentário?")) return;

          try {
            await api(
              "/api/blog/comentario/excluir",
              "POST",
              { id: comment.id }
            );

            await loadComments(articleId, panel);
            await refreshCommentCount(articleId);

          } catch (error) {
            alert(error.message);
          }
        });

        item.append(remove);
      }

      panel.append(item);
    }

    if (blogUser) {
      const form = element("form", "blog-comment-form");
      const textarea = document.createElement("textarea");

      textarea.placeholder = "Escreva seu comentário...";
      textarea.maxLength = 2000;
      textarea.required = true;

      const button = element(
        "button",
        "blog-button",
        "Publicar comentário"
      );
      button.type = "submit";

      const status = element("p", "blog-status");

      form.append(textarea, button, status);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const conteudo = textarea.value.trim();
        if (!conteudo) return;

        button.disabled = true;
        status.textContent = "Enviando...";

        try {
          await api("/api/blog/comentar", "POST", {
            artigo_id: articleId,
            conteudo
          });

          await loadComments(articleId, panel);
          await refreshCommentCount(articleId);

        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
        }
      });

      panel.append(form);

    } else {
      const notice = element(
        "p",
        "blog-empty",
        "Entre na sua conta para comentar."
      );

      const link = document.createElement("a");
      link.href = "login.html";
      link.textContent = "Fazer login";

      notice.append(document.createTextNode(" "), link);
      panel.append(notice);
    }

  } catch (error) {
    panel.replaceChildren(
      element("p", "blog-empty", error.message)
    );
  }
}

async function refreshCommentCount(articleId) {
  try {
    const data = await api("/api/blog");
    const updated = data.artigos.find(
      (a) => a.id === articleId
    );

    const original = blogArticles.find(
      (a) => a.id === articleId
    );

    if (updated && original) {
      original.comentarios = updated.comentarios;

      const card = [...document.querySelectorAll(".blog-article")]
        .find((node) => {
          const number = node.querySelector(".blog-article-top span");
          return number?.textContent ===
            "Registro: " + String(articleId).padStart(4, "0");
        });

      const button = card?.querySelector(
        ".blog-article-actions .blog-button"
      );

      if (button) {
        button.textContent =
          `Comentários (${updated.comentarios})`;
      }
    }
  } catch (error) {
    console.error("Erro ao atualizar contagem:", error);
  }
}

function setupMediaInputs() {
  const preview = $("blog-media-preview");
  const imageInput = $("blog-images");
  const videoInput = $("blog-videos");
  function render() {
    preview.replaceChildren();
    for (const [kind, files] of [["imagem", selectedBlogImages], ["video", selectedBlogVideos]]) {
      files.forEach((file, index) => {
        const item = element("div", "blog-media-preview-item");
        const url = URL.createObjectURL(file);
        const media = document.createElement(kind === "imagem" ? "img" : "video");
        media.src = url;
        if (kind === "video") media.controls = true;
        media.addEventListener("load", () => URL.revokeObjectURL(url), {once:true});
        if (kind === "video") media.addEventListener("loadeddata", () => URL.revokeObjectURL(url), {once:true});
        const name = element("div", "", file.name);
        const remove = element("button", "blog-button", "Remover");
        remove.type = "button";
        remove.addEventListener("click", () => {
          if (kind === "imagem") selectedBlogImages.splice(index, 1);
          else selectedBlogVideos.splice(index, 1);
          render();
        });
        item.append(media, name, remove);
        preview.append(item);
      });
    }
  }
  imageInput.addEventListener("change", () => {
    selectedBlogImages.push(...imageInput.files);
    imageInput.value = "";
    if (selectedBlogImages.length > 10) {
      selectedBlogImages = selectedBlogImages.slice(0, 10);
      alert("Máximo de 10 imagens.");
    }
    render();
  });
  videoInput.addEventListener("change", () => {
    selectedBlogVideos.push(...videoInput.files);
    videoInput.value = "";
    if (selectedBlogVideos.length > 6) {
      selectedBlogVideos = selectedBlogVideos.slice(0, 6);
      alert("Máximo de 6 vídeos.");
    }
    render();
  });
  return () => { selectedBlogImages = []; selectedBlogVideos = []; render(); };
}

async function uploadBlogMedia(articleId, kind, file) {
  const response = await fetch("/api/blog/midia", {
    method: "POST", credentials: "same-origin",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Blog-Article-ID": String(articleId),
      "X-Blog-Media-Type": kind,
      "X-Blog-Media-Name": encodeURIComponent(file.name)
    },
    body: file
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${file.name}: ${result.message || "Erro no upload."}`);
  return result;
}

function setupEditor() {
  const clearMedia = setupMediaInputs();
  const form = $("blog-create-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isAdmin()) return;

    const button = form.querySelector('button[type="submit"]');
    const status = $("blog-create-status");

    button.disabled = true;
    status.textContent = "Publicando...";

    try {
      const published = await api("/api/blog/publicar", "POST", {
        titulo: $("blog-title").value.trim(),
        subtitulo: $("blog-subtitle").value.trim(),
        conteudo: $("blog-content").value.trim()
      });

      const files = [
        ...selectedBlogImages.map(file => ["imagem", file]),
        ...selectedBlogVideos.map(file => ["video", file])
      ];
      let completed = 0;
      const errors = [];
      for (const [kind, file] of files) {
        status.textContent = `Enviando mídias: ${completed + 1}/${files.length}...`;
        try {
          await uploadBlogMedia(published.id, kind, file);
          completed++;
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (errors.length) {
        status.textContent = `Artigo criado. ${completed} mídia(s) enviada(s). Falhas: ${errors.join(" | ")}`;
      } else {
        form.reset();
        clearMedia();
        status.textContent = "Publicação criada com sucesso!";
      }

      await loadArticles();

    } catch (error) {
      status.textContent = error.message;

    } finally {
      button.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupEditor();
  await loadUser();
  await loadArticles();
});
