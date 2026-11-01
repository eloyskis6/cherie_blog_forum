
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("request-form");
  const message = document.getElementById("recovery-message");

  if (!form || !message) {
    console.error("Formulário de recuperação não encontrado.");
    return;
  }

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
          ? "Se o e-mail estiver cadastrado, você receberá um link."
          : "Não foi possível enviar o e-mail.");

      message.style.color = response.ok ? "#294c35" : "#a02c2c";

    } catch (error) {
      console.error("Erro na recuperação:", error);

      message.textContent =
        "Não foi possível conectar ao servidor.";

      message.style.color = "#a02c2c";

    } finally {
      button.disabled = false;
    }
  });
});
