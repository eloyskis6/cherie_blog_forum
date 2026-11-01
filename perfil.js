
/* CHÉRIE - PERFIL */

const $ = id => document.getElementById(id);
let current = null;

async function api(path, method = "GET", data) {
  const options = {
    method,
    credentials: "same-origin",
    headers: {}
  };

  if (data !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  }

  const response = await fetch(path, options);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Falha na solicitação.");
  }

  return result;
}

function feedback(message) {
  $("profile-status").textContent = message;
}

/* NOME DO PAÍS */


function nomePais(codigo) {
  if (!codigo) return "Não informado";

  const paises = window.CHERIE_PAISES ||
    (typeof CHERIE_PAISES !== "undefined"
      ? CHERIE_PAISES
      : []);

  const pais = paises.find(item =>
    Array.isArray(item)
      ? item[0] === codigo
      : item.code === codigo
  );

  if (!pais) return codigo;

  return Array.isArray(pais) ? pais[1] : pais.name;
}

/* CARREGAR PERFIL */

async function load() {
  try {
    current = await api("/api/me");

    $("profile-name").textContent = current.username;
    $("new-username").value = current.username;

    $("profile-meta").textContent = [
      !current.hide_age
        ? `${current.age} anos`
        : "Idade oculta",

      !current.hide_sex
        ? (current.sex || "Não informado")
        : "Sexo oculto"
    ].join(" · ");

    $("hide-age").checked = !!current.hide_age;
    $("hide-sex").checked = !!current.hide_sex;

    /* PAÍS */

    const countrySelect = $("country");
    const hideCountry = $("hide-country");
    const profileCountry = $("profile-country");

    if (countrySelect) {
      countrySelect.value = current.country || "";
    }

    if (hideCountry) {
      hideCountry.checked = !!current.hide_country;
    }

    mostrarBandeira(
  profileCountry,
  current.country,
  current.hide_country
);

    /* FOTO E BANNER */

    $("avatar").src = current.avatar || "initial.jpeg";

    $("cover").style.backgroundImage = current.banner
      ? `url(${JSON.stringify(current.banner)})`
      : "";

    /* REAÇÕES */

    $("likes").textContent = current.likes;
    $("dislikes").textContent = current.dislikes;

    /* PERFIL PÚBLICO */

    $("public-link").href =
      "usuario.html?id=" + encodeURIComponent(current.id);

  } catch (error) {
    feedback(
      error.message ||
      "Você precisa entrar na sua conta para editar o perfil."
    );

    if (
      /sessão|autentic/i.test(error.message || "")
    ) {
      setTimeout(() => {
        location.href = "login.html";
      }, 2200);
    }
  }
}

/* EXECUTAR ALTERAÇÕES */

async function action(fn) {
  try {
    await fn();
    await load();
    feedback("Alterações salvas!");
  } catch (error) {
    feedback(error.message || "Erro ao salvar alterações.");
  }
}

/* IMAGENS */

async function readImage(file) {
  if (!file) {
    throw Error("Escolha uma imagem primeiro.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw Error("A imagem deve ter até 2 MB.");
  }

  if (![
    "image/jpeg",
    "image/png",
    "image/webp"
  ].includes(file.type)) {
    throw Error("Use JPG, PNG ou WebP.");
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      Error("Erro ao ler imagem.")
    );

    reader.readAsDataURL(file);
  });
}

/* SALVAR FOTO */

$("save-avatar").onclick = () => action(
  async () => api("/api/perfil", "POST", {
    avatar: await readImage($("avatar-file").files[0])
  })
);

/* SALVAR BANNER */

$("save-banner").onclick = () => action(
  async () => api("/api/perfil", "POST", {
    banner: await readImage($("banner-file").files[0])
  })
);

/* SALVAR PAÍS */

const saveCountry = $("save-country");

if (saveCountry) {
  saveCountry.onclick = () => action(
    () => api("/api/perfil", "POST", {
      country: $("country").value || null
    })
  );
}

/* SALVAR PRIVACIDADE */

$("save-privacy").onclick = () => action(
  () => api("/api/perfil", "POST", {
    hide_age: $("hide-age").checked,
    hide_sex: $("hide-sex").checked,
    hide_country: $("hide-country")?.checked || false
  })
);

/* ALTERAR NOME DE USUÁRIO */

$("username-form").onsubmit = event => {
  event.preventDefault();

  action(
    () => api("/api/perfil", "POST", {
      username: $("new-username").value.trim()
    })
  );
};

/* ALTERAR SENHA */

$("password-form").onsubmit = event => {
  event.preventDefault();

  if (
    $("new-password").value !==
    $("repeat-password").value
  ) {
    feedback(
      "A confirmação não corresponde à nova senha."
    );
    return;
  }

  action(async () => {
    await api("/api/perfil/senha", "POST", {
      old_password: $("old-password").value,
      new_password: $("new-password").value
    });

    $("password-form").reset();
  });
};

/* SAIR DA CONTA */

$("logout").onclick = async () => {
  try {
    await api("/api/sair", "POST", {});
    location.href = "login.html";
  } catch (error) {
    feedback(error.message);
  }
};

/* INICIALIZAÇÃO */


function carregarListaDePaises() {
  const seletor = document.getElementById("country");
  if (!seletor) return;

  const paises = window.CHERIE_PAISES ||
    (typeof CHERIE_PAISES !== "undefined"
      ? CHERIE_PAISES
      : []);

  if (!paises.length) {
    console.error("Lista de países não carregada.");
    return;
  }

  const selecionado = seletor.value;

  seletor.innerHTML =
    '<option value="">Selecione seu país...</option>';

  for (const item of paises) {
    const codigo = Array.isArray(item) ? item[0] : item.code;
    const nome = Array.isArray(item) ? item[1] : item.name;

    const option = document.createElement("option");
    option.value = codigo;
    option.textContent = nome;

    seletor.appendChild(option);
  }

  seletor.value = selecionado;
}

carregarListaDePaises();


load();

