
/* =========================================
   CHÉRIE - PERFIL PÚBLICO
   ========================================= */

const $ = id => document.getElementById(id);

const id = new URLSearchParams(
  window.location.search
).get("id");

let myVote = 0;


/* =========================================
   COMUNICAÇÃO COM O SERVIDOR
   ========================================= */

async function req(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "same-origin",
    body: body !== undefined
      ? JSON.stringify(body)
      : undefined
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Erro no servidor.");
  }

  return result;
}


/* =========================================
   CARREGAR PERFIL PÚBLICO
   ========================================= */

async function load() {
  try {

    if (!id) {
      throw new Error("Perfil não informado.");
    }

    const usuario = await req(
      "/api/usuario?id=" + encodeURIComponent(id)
 );

    /* NOME DE USUÁRIO */

    $("name").textContent = usuario.username;


    /* IDADE E SEXO */

    $("meta").textContent = [
      usuario.age === null
        ? "Idade oculta"
        : usuario.age + " anos",

      usuario.sex === null
        ? "Sexo oculto"
        : (usuario.sex || "Não informado")
    ].join(" · ");


    /* FOTO DO PERFIL */

    $("avatar").src = usuario.avatar || "initial.jpeg";


    /* BANNER */

    $("cover").style.backgroundImage = usuario.banner
      ? `url(${JSON.stringify(usuario.banner)})`
      : "";


    /* =====================================
       BANDEIRA METÁLICA DO PAÍS
       ===================================== */

    const countryElement = $("public-country");

    if (typeof window.mostrarBandeira === "function") {

      window.mostrarBandeira(
        countryElement,
        usuario.country,
        usuario.hide_country
      );

    } else if (countryElement) {

      countryElement.hidden = true;

      console.warn(
        "bandeiras.js não foi carregado corretamente."
      );

    }


    /* CURTIDAS E DISLIKES */

    $("likes").textContent = usuario.likes;
    $("dislikes").textContent = usuario.dislikes;

    myVote = usuario.my_vote || 0;

    $("like").classList.toggle(
      "active",
      myVote === 1
    );

    $("dislike").classList.toggle(
      "active",
      myVote === -1
    );


    /* LIMPAR MENSAGEM DE ERRO */

    $("message").textContent = "";

  } catch (error) {

    $("message").textContent =
      error.message || "Erro ao carregar perfil.";

    console.error("Erro no perfil público:", error);

  }
}


/* =========================================
   CURTIDAS E DISLIKES
   ========================================= */

async function vote(value) {
  try {

    const novoVoto = myVote === value
      ? 0
      : value;

    await req("/api/voto", "POST", {
      user_id: Number(id),
      vote: novoVoto
    });

    await load();

  } catch (error) {

    $("message").textContent =
      error.message + " Entre na conta para votar.";

  }
}


/* =========================================
   BOTÕES
   ========================================= */

$("like").onclick = () => vote(1);

$("dislike").onclick = () => vote(-1);


/* =========================================
   INICIAR
   ========================================= */

load();
