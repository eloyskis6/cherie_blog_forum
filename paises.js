
/* ==========================================
   CHÉRIE - PAÍSES E TERRITÓRIOS
   ISO 3166-1 / Português brasileiro
   ========================================== */

(() => {
  "use strict";

  const ISO_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
YE YT
ZA ZM ZW
`.trim().split(/\s+/);

  const nomes = new Intl.DisplayNames(["pt-BR"], {
    type: "region"
  });

  const ajustes = {
    AX: "Ilhas Åland",
    BQ: "Caribe Neerlandês",
    CD: "República Democrática do Congo",
    CG: "República do Congo",
    CI: "Costa do Marfim",
    CW: "Curaçao",
    FK: "Ilhas Malvinas (Falkland)",
    GB: "Reino Unido",
    HK: "Hong Kong",
    KP: "Coreia do Norte",
    KR: "Coreia do Sul",
    MO: "Macau",
    PS: "Palestina",
    RU: "Rússia",
    SZ: "Essuatíni",
    TL: "Timor-Leste",
    TR: "Turquia",
    TW: "Taiwan",
    US: "Estados Unidos",
    VA: "Vaticano"
  };

  const collator = new Intl.Collator("pt-BR", {
    sensitivity: "base"
  });

  const paises = ISO_CODES.map(code => ({
    code,
    name: ajustes[code] || nomes.of(code)
  })).sort((a, b) => collator.compare(a.name, b.name));

  // Disponível para cadastro.js e perfil.js.
  window.CHERIE_PAISES = Object.freeze(paises);

  // Preenche os seletores de país existentes na página.
  function preencherSeletores() {
    const seletores = document.querySelectorAll(
      'select#country, select[data-country-select]'
    );

    for (const select of seletores) {
      const valorAnterior = select.value;

      // Evita duplicar opções se o script for executado novamente.
      select.replaceChildren();

      const inicial = document.createElement("option");
      inicial.value = "";
      inicial.textContent = "Selecione seu país...";
      select.appendChild(inicial);

      for (const pais of paises) {
        const option = document.createElement("option");
        option.value = pais.code;
        option.textContent = pais.name;
        select.appendChild(option);
      }

      if (valorAnterior) {
        select.value = valorAnterior;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      preencherSeletores,
      { once: true }
    );
  } else {
    preencherSeletores();
  }

})();
