
/* CHÉRIE - BANDEIRAS METÁLICAS */

function nomeDoPais(codigo) {
  if (!codigo) return "";

  const pais = (window.CHERIE_PAISES || []).find(item =>
    Array.isArray(item)
      ? item[0] === codigo
      : item.code === codigo
  );

  if (pais) {
    return Array.isArray(pais) ? pais[1] : pais.name;
  }

  try {
    return new Intl.DisplayNames(["pt-BR"], {
      type: "region"
    }).of(codigo);
  } catch {
    return codigo;
  }
}

function emojiBandeira(codigo) {
  if (!/^[A-Z]{2}$/.test(codigo || "")) return "";

  return [...codigo].map(letra =>
    String.fromCodePoint(
      127397 + letra.charCodeAt(0)
    )
  ).join("");
}

function mostrarBandeira(elemento, pais, oculto = false) {
  if (!elemento) return;

  elemento.replaceChildren();

  if (!pais || oculto) {
    elemento.hidden = true;
    return;
  }

  const codigo = String(pais).toUpperCase();
  const nome = nomeDoPais(codigo);

  const placa = document.createElement("span");
  placa.className = "cherie-country-badge";
  placa.title = nome;

  const bandeira = document.createElement("span");
  bandeira.className = "cherie-country-flag";
  bandeira.textContent = emojiBandeira(codigo);
  bandeira.setAttribute("aria-hidden", "true");

  const texto = document.createElement("span");
  texto.className = "cherie-country-name";
  texto.textContent = nome;

  placa.append(bandeira, texto);
  elemento.appendChild(placa);
  elemento.hidden = false;
}

window.mostrarBandeira = mostrarBandeira;

