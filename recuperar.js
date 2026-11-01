
const msg = document.getElementById("recovery-message");

async function send(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw Error(data.message || "Não foi possível concluir.");
  }

  return data;
}

const request = document.getElementById("request-form");

if (request) {
  request.addEventListener("submit", async e => {
    e.preventDefault();

    msg.textContent = "Enviando...";

    try {
      const data = await send(
        "/api/recuperacao/solicitar",
        {
          email: document.getElementById("email").value.trim()
        }
      );

      msg.textContent = data.message;
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

const reset = document.getElementById("reset-form");

if (reset) {
  const token = new URLSearchParams(
    location.search
  ).get("token") || "";

  if (!token) {
    msg.textContent = "Link de recuperação ausente.";
    reset.querySelector("button").disabled = true;
  }

  reset.addEventListener("submit", async e => {
    e.preventDefault();

    const password = document.getElementById("password").value;
    const confirm = document.getElementById("confirm").value;

    if (password !== confirm) {
      msg.textContent = "As senhas não coincidem.";
      return;
    }

    msg.textContent = "Alterando senha...";

    try {
      const data = await send(
        "/api/recuperacao/redefinir",
        { token, password }
      );

      msg.textContent = data.message;
      reset.querySelector("button").disabled = true;
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("request-form");
  const message = document.getElementById("recovery-message");

  if (!form || !message) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const button = form.querySelector('button[type="submit"]');

    button.disabled = true;
    message.textContent = "Enviando solicitação...";

    try {
      const response = await fetch("/api/recuperacao/solicitar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      message.textContent =
        data.message ||
        (response.ok
          ? "Solicitação recebida."
          : "Não foi possível enviar o e-mail.");

    } catch (error) {
      console.error(error);
      message.textContent =
        "Não foi possível conectar ao servidor.";
    } finally {
      button.disabled = false;
    }
  });
});
