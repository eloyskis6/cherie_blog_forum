
/* ========================================
   CHÉRIE - INDEX2
   Área inicial de usuários conectados
   ======================================== */

document.addEventListener("DOMContentLoaded", () => {

  const welcomeUsername =
    document.getElementById("welcome-username");

  const memberUsername =
    document.getElementById("member-username");

  const memberAvatar =
    document.getElementById("member-avatar");

  const logoutButton =
    document.getElementById("member-logout");

  /* Carregar usuário conectado */

  async function loadUser() {
    try {
      const response = await fetch("/api/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });

      if (response.status === 401) {
        window.location.replace("login.html");
        return;
      }

      if (!response.ok) {
        throw new Error("Não foi possível carregar sua conta.");
      }

      const user = await response.json();

      const username = user.username || "Usuário";

      welcomeUsername.textContent = username;
      memberUsername.textContent = username;

      /* Foto do perfil */

      const avatar = user.avatar_url || user.avatar;

      if (
        typeof avatar === "string" &&
        (
          avatar.startsWith("/uploads/") ||
          avatar.startsWith("uploads/")
        )
      ) {
        memberAvatar.src = avatar;
      } else {
        memberAvatar.src = "initial.jpeg";
      }

      memberAvatar.onerror = function () {
        this.onerror = null;
        this.src = "initial.jpeg";
      };

    } catch (error) {
      console.error("Erro ao carregar usuário:", error);

      welcomeUsername.textContent =
        "Não foi possível carregar";

      memberUsername.textContent =
        "Erro de conexão";
    }
  }

  /* Encerrar sessão */

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Saindo...";

    try {
      const response = await fetch("/api/sair", {
        method: "POST",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("Erro ao encerrar sessão.");
      }

      window.location.replace("index.html");

    } catch (error) {
      console.error(error);

      logoutButton.disabled = false;
      logoutButton.textContent = "Sair da conta";

      alert("Não foi possível sair da conta. Tente novamente.");
    }
  });

  loadUser();

});


/* Mensagens rotativas da Chérie */

document.addEventListener("DOMContentLoaded", () => {
  const messageElement =
    document.getElementById("welcome-message");

  const usernameElement =
    document.getElementById("welcome-username");

  if (!messageElement || !usernameElement) return;

  const messages = [
    "Oi, é um prazer te ter por aqui,",
    "Não pare de vir ver... não é tão ruim assim. Em breve você começa a gostar.",
    "Oi? Está aí?",
    "Me pergunto se você gosta disso.",
    "Você sempre tem um cantinho aqui. Continue a voltar."
  ];

  let index = 0;
  let activeSeconds = 0;
  let lastActivity = Date.now();

  function showMessage() {
    const username =
      document.getElementById("member-username")
        ?.textContent?.trim() || "...";

    messageElement.replaceChildren(
      document.createTextNode(messages[index] + " "),
      Object.assign(document.createElement("strong"), {
        id: "welcome-username",
        textContent: username
      }),
      document.createTextNode("!")
    );
  }

  function markActive() {
    lastActivity = Date.now();
  }

  ["pointerdown", "keydown", "scroll", "touchstart"]
    .forEach(eventName => {
      document.addEventListener(eventName, markActive, {
        passive: true
      });
    });

  /* Troca após 5 minutos acumulados de atividade */

  setInterval(() => {
    const isActive =
      document.visibilityState === "visible" &&
      Date.now() - lastActivity < 60000;

    if (!isActive) return;

    activeSeconds++;

    if (activeSeconds >= 300) {
      activeSeconds = 0;
      index = (index + 1) % messages.length;
      showMessage();
    }
  }, 1000);

  /* Atualiza a mensagem quando o nome carregar */

  const accountName =
    document.getElementById("member-username");

  if (accountName) {
    const observer = new MutationObserver(() => {
      showMessage();
    });

    observer.observe(accountName, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  showMessage();
});
