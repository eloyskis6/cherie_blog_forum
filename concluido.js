
document.addEventListener("DOMContentLoaded", function () {

  const botaoOk = document.getElementById("okay");
  const botaoNao = document.getElementById("dontcare");
  const gatinha = document.getElementById("notice-cat");
  const mensagem = document.getElementById("notice-status");

  const DURACAO = 120; // 2 minutos
  let tempoRestante = DURACAO;
  let intervalo = null;
  let irritada = false;

  function formatarTempo(segundos) {
    const minutos = Math.floor(segundos / 60);
    const resto = segundos % 60;

    return (
      String(minutos).padStart(2, "0") +
      ":" +
      String(resto).padStart(2, "0")
    );
  }

  function atualizarMensagem() {
    mensagem.textContent =
      "Você deixou ela irritada, você conseguirá acessar o site em: " +
      formatarTempo(tempoRestante) +
      ". Não tente atualizar a página ou clicar em outros botões, " +
      "ou a contagem regressiva será reiniciada de novo.";
  }

  function reiniciarContagem() {
    tempoRestante = DURACAO;
    atualizarMensagem();
  }

  function iniciarContagem() {
    if (intervalo !== null) {
      clearInterval(intervalo);
    }

    tempoRestante = DURACAO;
    atualizarMensagem();

    intervalo = setInterval(function () {
      tempoRestante--;
      atualizarMensagem();

      if (tempoRestante <= 0) {
        clearInterval(intervalo);
        window.location.href = "perfil.html";
      }
    }, 1000);
  }

  // Botão "Tá bom"
  botaoOk.addEventListener("click", function () {
    if (irritada) {
      reiniciarContagem();
      return;
    }

    window.location.href = "perfil.html";
  });

  // Botão "Não ligo"
  botaoNao.addEventListener("click", function () {
    irritada = true;

    gatinha.src = "irritada.cherie.png";
    gatinha.alt = "Chérie irritada";

    iniciarContagem();
  });

  // Qualquer clique em outro botão reinicia a contagem
  document.addEventListener("click", function (evento) {
    if (!irritada) return;

    const botao = evento.target.closest("button, a");

    if (!botao) return;

    // O botão "Não ligo" já reinicia pelo próprio evento
    if (botao === botaoNao || botao === botaoOk) return;

    evento.preventDefault();
    reiniciarContagem();
  }, true);

});
