
/* ==========================================
   CHÉRIE - CADASTRO
   ========================================== */

const ageSlider = document.getElementById("age");
const ageValue = document.getElementById("age-value");
const ageMessage = document.getElementById("age-message");

function atualizarIdade() {
  if (!ageSlider || !ageValue || !ageMessage) return;

  const idade = Number(ageSlider.value);
  ageValue.textContent = `${idade} anos`;

  let mensagem = "";

  if (idade < 26) {
    mensagem = "Um adulto jovem :)";
  } else if (idade < 36) {
    mensagem = "A juventude continua!";
  } else if (idade < 49) {
    mensagem = "Uma fase de novas experiências.";
  } else if (idade < 59) {
    mensagem = "Uma vida cheia de histórias.";
  } else if (idade < 69) {
    mensagem = "A experiência tem seu charme.";
  } else if (idade < 79) {
    mensagem = "Muitas histórias para compartilhar!";
  } else if (idade < 90) {
    mensagem = "Uma longa trajetória de vida.";
  } else if (idade < 103) {
    mensagem = "Mais de nove décadas de histórias!";
  } else {
    mensagem =
      "Mais de um século de existência! Você realmente tem essa idade?!";
  }

  ageMessage.textContent = mensagem;
}

if (ageSlider && ageValue && ageMessage) {
  ageSlider.addEventListener("input", atualizarIdade);
  atualizarIdade();
}

/* ==========================================
   SELEÇÃO DE PAÍS
   ========================================== */

const countrySelect = document.getElementById("country");

/* ==========================================
   FORMULÁRIO DE CADASTRO
   ========================================== */

const formulario = document.getElementById("register-form");

if (formulario) {
  formulario.addEventListener("submit", async function (evento) {
    evento.preventDefault();

    const feedback = document.getElementById("form-feedback");
    const botaoEnviar = formulario.querySelector(
      'button[type="submit"]'
    );

    function mostrarFeedback(mensagem, tipo = "error") {
      if (feedback) {
        feedback.textContent = mensagem;
        feedback.classList.remove("error", "success");
        feedback.classList.add(tipo);
      }
    }

    const senha = document.getElementById("password").value;
    const confirmacao =
      document.getElementById("confirm-password").value;

    if (senha !== confirmacao) {
      mostrarFeedback("As senhas não coincidem.");
      return;
    }

    if (senha.length < 7) {
      mostrarFeedback(
        "A senha precisa ter pelo menos 7 caracteres."
      );
      return;
    }

    if (countrySelect && !countrySelect.value &&
        countrySelect.options.length <= 1) {
      mostrarFeedback(
        "A lista de países ainda não foi carregada."
      );
      return;
    }

    const dados = Object.fromEntries(
      new FormData(formulario).entries()
    );

    // Garante que o backend receba um booleano.
    dados.hide_country = Boolean(hideCountry?.false);

    // País opcional, representado por código ISO.
    dados.country = countrySelect?.value || null;

    if (botaoEnviar) {
      botaoEnviar.disabled = true;
      botaoEnviar.textContent = "Criando conta...";
    }

    mostrarFeedback("Enviando cadastro...", "success");

    try {
      const resposta = await fetch("/api/cadastro", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(dados)
      });

      const resultado = await resposta.json().catch(
        () => ({})
      );

      if (!resposta.ok) {
        mostrarFeedback(
          resultado.message ||
          "Não foi possível criar sua conta."
        );
        return;
      }

      mostrarFeedback(
        "Conta criada com sucesso!",
        "success"
      );

      window.location.href = "concluido.html";

    } catch (erro) {
      console.error("Erro no cadastro:", erro);

      mostrarFeedback(
        "Erro ao conectar com o servidor. Tente novamente."
      );

    } finally {
      if (botaoEnviar) {
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = "Finalizar cadastro";
      }
    }
  });
}

/* ==========================================
   MOSTRAR / OCULTAR SENHAS
   ========================================== */

const botaoOlho = document.querySelector(".toggle-password");
const campoSenha = document.getElementById("password");
const campoConfirmacao =
  document.getElementById("confirm-password");

if (botaoOlho && campoSenha && campoConfirmacao) {
  botaoOlho.addEventListener("click", function () {
    const mostrar = campoSenha.type === "password";

    campoSenha.type = mostrar ? "text" : "password";
    campoConfirmacao.type = mostrar ? "text" : "password";

    botaoOlho.setAttribute(
      "aria-label",
      mostrar ? "Ocultar senhas" : "Mostrar senhas"
    );

    botaoOlho.setAttribute(
      "aria-pressed",
      String(mostrar)
    );
  });
}

