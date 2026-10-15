// UX-PRO-08D: somente instrumentação; nenhuma resposta de produto é forjada.
import assert from 'node:assert/strict';

const directory = area => `docs/ux-pro-08-${area}-evidencias`;
export const measurementPlan = {
  outputDir: directory('conhecimento'),
  measurements: true,
  viewports: [
    [320, 780], [390, 844], [1440, 900],
  ].flatMap(([width, height]) => ['escuro'].map(theme => ({
    name: `08d-w${width}-${theme}`, width, height, theme,
  }))),
  targets: [
    { route: '/admin/conhecimento', role: 'admin', slug: 'conhecimento', area: 'conhecimento', keyboard: 'knowledge', waitFor: 'Base de Conhecimento e Procedimentos Operacionais', waitForRole: 'heading' },
    { route: '/admin/marcelo/assistente', role: 'marcelo', slug: 'marcelo', area: 'assistentes', keyboard: 'rag', waitFor: 'Assistente Marcelo', waitForRole: 'heading' },
    { route: '/admin/rh/assistente', role: 'rh', slug: 'rh', area: 'assistentes', keyboard: 'rag', waitFor: 'Assistente RH', waitForRole: 'heading' },
    { route: '/admin/aparencia', role: 'ti', slug: 'aparencia', area: 'aparencia', keyboard: 'gallery', waitFor: 'Escolha a apresentação do site' },
  ].map(target => ({ ...target, outputDir: directory(target.area) })),
};

export async function focusedTarget(page, key) {
  return page.evaluate(key => {
    const node = document.activeElement;
    if (!node || node === document.body) return { key, target: 'body', visible: false, focusVisible: false };
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const before = window.__ux08dFocusBaseline?.get(node);
    const focusVisible = node.matches(':focus-visible') && (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
      || (style.boxShadow !== 'none' && style.boxShadow !== before?.shadow)
      || (before && style.borderColor !== before.border)
    );
    return {
      key, tag: node.tagName.toLowerCase(),
      target: node.getAttribute('data-testid') || node.getAttribute('aria-label') || (node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90) || node.tagName.toLowerCase(),
      visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.left >= -1 && rect.right <= innerWidth + 1,
      focusVisible: Boolean(focusVisible),
      fullyVisible: rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1,
      border: style.borderColor, shadow: style.boxShadow,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      width: Math.round(rect.width), height: Math.round(rect.height),
    };
  }, key);
}

export async function measureKeyboard(page, target) {
  await page.evaluate(() => {
    window.__ux08dFocusBaseline = new WeakMap([...document.querySelectorAll('a,button,input,textarea,select,summary,[tabindex]')].map(node => {
      const style = getComputedStyle(node);
      return [node, { border: style.borderColor, shadow: style.boxShadow }];
    }));
  });
  const steps = [];
  const press = async key => {
    await page.keyboard.press(key);
    // O browser pode rolar suavemente após Tab: medir depois de assentar,
    // não registrar a posição transitória como defeito do produto.
    await page.waitForTimeout(250);
    const step = await focusedTarget(page, key);
    steps.push(step);
    return step;
  };
  // Inicia no primeiro foco obtido pelo capturador; nenhum .focus() ou click().
  steps.push(await focusedTarget(page, 'Tab (primeiro)'));
  const selectors = {
    knowledge: '[role="tab"]', rag: '[data-testid="rag-question"]',
    gallery: '[aria-label="Dez apresentações disponíveis"] button',
    preview: '[data-testid="site-preview-notice"] a',
  };
  const reached = async () => page.locator(selectors[target.keyboard]).evaluateAll(nodes => nodes.includes(document.activeElement));
  for (let count = 0; !await reached() && count < 100; count++) await press('Tab');
  assert.ok(await reached(), `Tab não alcançou ${target.keyboard}`);
  const actions = [];
  if (target.keyboard === 'knowledge') {
    for (const key of ['ArrowRight', 'End', 'Home']) {
      await press(key);
      assert.equal(await page.locator('[role="tab"][aria-selected="true"]').evaluate(node => node === document.activeElement), true);
    }
    actions.push('tablist: ArrowRight, End e Home alteram seleção e foco');
    await press('Tab');
  } else if (target.keyboard === 'rag') {
    await page.keyboard.type('Como consultar documentos publicados nesta base?');
    await press('Tab');
    assert.equal(await page.locator('[data-testid="rag-submit"]').evaluate(node => node === document.activeElement), true);
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/ai/answer') && response.request().method() === 'POST');
    await page.keyboard.press('Enter');
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.ollama_used, false);
    assert.equal(body.sources.length, 0);
    await page.locator('[data-testid="rag-answer"]').waitFor();
    actions.push('pergunta digitada e enviada por Tab/Enter; HTTP 200, zero fontes, modelo não chamado');
    await press('Shift+Tab');
  } else if (target.keyboard === 'gallery') {
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[aria-label="Dez apresentações disponíveis"] button').first().getAttribute('aria-pressed'), 'true');
    actions.push('Enter compara layout 01; nenhum PUT/publicação');
    await press('Tab');
    await press('Shift+Tab');
  } else {
    await press('Tab');
    assert.equal(await page.locator('[data-testid="site-preview-notice"] a').nth(1).evaluate(node => node === document.activeElement), true);
    actions.push('Tab alcança os dois links da faixa, sem navegar/publicar');
    await press('Shift+Tab');
  }
  const problems = steps.filter(step => !step.fullyVisible || !step.focusVisible)
    .map(step => `teclado: ${step.target}: integralmente visível=${step.fullyVisible}, foco=${step.focusVisible}`);
  return {
    keyboardSteps: steps, keyboardActions: actions,
    // Contrato UX-PRO-00: só creditar percurso se TODOS os alvos foram medidos
    // como integralmente visíveis e com indicador de foco; a sequência bruta permanece para diagnóstico.
    ...(problems.length ? {} : { percursoTeclado: steps.map(step => `${step.key}: ${step.target}`) }),
    keyboardProblems: problems,
  };
}

export async function measureTheme(page, target, requested) {
  return page.evaluate(({ target, requested }) => {
    const sample = selector => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, color: style.color };
    };
    return {
      requested, actual: document.documentElement.dataset.colorMode || null,
      adminTheme: document.documentElement.dataset.adminTheme || 'day',
      body: sample('body'),
      surface: sample(target.keyboard === 'rag' ? '[data-testid="rag-widget"]' : target.keyboard === 'preview' ? '[data-testid="site-preview-notice"]' : 'main'),
      scope: target.role === 'client' || target.keyboard === 'preview' ? 'sem garantia de tema sistêmico; medido, não aplicado ao site público' : 'staff',
    };
  }, { target, requested });
}
