// E9 — auxiliar de leitura estável para gates de navegador.
//
// `useClientSpace` pode atualizar a conta ativa DEPOIS da primeira leitura da
// página. O `useEffect` de `activeAccount` então dispara um segundo `load()`,
// que coloca `readLoading=true` e substitui a lista pelo spinner. Um
// `locator.waitFor()` no título passa nesse intervalo, e a asserção seguinte
// lê um `body.innerText()` sem o protocolo — foi a falha intermitente
// "o protocolo precisa estar visível" observada em 27/10/2026 (1ª execução do
// gate 41/42; isolado 1/1; repetição 42/42).
//
// A correção não é `waitForTimeout`: é esperar o próprio ESTADO estável do
// corpo (textos obrigatórios presentes, textos de transição ausentes) dentro
// de uma única avaliação atômica no navegador.

/**
 * Espera o corpo atingir um estado estável e devolve o texto já medido.
 * @param {import('playwright').Page} page
 * @param {{ required?: string[], forbidden?: string[], timeout?: number }} options
 * @returns {Promise<string>}
 */
export async function waitForStableBodyText(page, { required = [], forbidden = [], timeout = 20_000 } = {}) {
  if (!Array.isArray(required) || required.length === 0) {
    throw new Error('waitForStableBodyText exige ao menos um texto obrigatório em `required`.');
  }
  await page.waitForFunction(
    ({ required, forbidden }) => {
      const text = document.body?.innerText || '';
      return required.every(item => text.includes(item))
        && forbidden.every(item => !text.includes(item));
    },
    { required: [...required], forbidden: [...forbidden] },
    { timeout },
  );
  return page.locator('body').innerText();
}
