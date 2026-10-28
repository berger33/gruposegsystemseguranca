/**
 * Browser-side PU4 probe. Pass this function to Playwright page.evaluate().
 *
 * E18 (27/10/2026): o retrato 10B registrava apenas CONTAGENS — 708 amostras
 * abaixo de 4.5:1, 196 indeterminadas e 108 textos visíveis não medidos. Sem
 * as amostras não havia como dizer QUAL cor ou QUAL seletor corrigir. Este
 * helper continua devolvendo exatamente os mesmos campos e contagens (o
 * baseline 10B depende disso) e passa a devolver também:
 *   - `samples[].reason` para as indeterminadas (complex_background,
 *     no_opaque_background, invalid_foreground);
 *   - `unmeasuredSamples` com seletor/texto de cada texto visível cujo
 *     getClientRects() veio vazio.
 * Nenhuma regra de visibilidade ou de composição de cor mudou.
 */
export function measureTextContrast() {
  const parseColor = value => {
    const values = value.match(/[\d.]+/g);
    return values && values.length >= 3
      ? { rgb: values.slice(0, 3).map(Number), alpha: values.length > 3 ? Number(values[3]) : 1 }
      : null;
  };
  const luminance = color => {
    const channels = color.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const composite = (front, back, alpha) => front.map((value, index) => value * alpha + back[index] * (1 - alpha));
  const describe = node => {
    if (!node || node.nodeType !== 1) return '';
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${typeof node.className === 'string' && node.className.trim() ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}`;
  };
  const selectorOf = owner => {
    const own = describe(owner);
    const parent = owner.parentElement;
    const parentSelector = parent && (parent.id || (typeof parent.className === 'string' && parent.className.trim()))
      ? describe(parent) : null;
    return parentSelector ? `${parentSelector} > ${own}` : own;
  };
  const samples = [];
  const unmeasuredSamples = [];
  let renderedTextNodeCount = 0;
  let unmeasuredVisibleTextCount = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    const text = (textNode.textContent || '').replace(/\s+/g, ' ').trim();
    const owner = textNode.parentElement;
    if (!text || !owner) continue;
    let visible = true;
    for (let node = owner; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.1) {
        visible = false;
        break;
      }
    }
    if (!visible) continue;
    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    if (!rects.length) {
      unmeasuredVisibleTextCount += 1;
      unmeasuredSamples.push({
        tag: owner.tagName.toLowerCase(), selector: selectorOf(owner), text: text.slice(0, 120),
        reason: 'no_client_rect', ownerTag: owner.parentElement?.tagName.toLowerCase() ?? null,
      });
      continue;
    }
    renderedTextNodeCount += 1;
    const style = getComputedStyle(owner);
    const foreground = parseColor(style.color);
    let background = [255, 255, 255];
    let opaqueBackgroundFound = false;
    let complexBackground = false;
    const ancestors = [];
    for (let node = owner; node && node.nodeType === 1; node = node.parentElement) ancestors.push(node);
    for (const node of ancestors.reverse()) {
      const ancestorStyle = getComputedStyle(node);
      if (ancestorStyle.backgroundImage !== 'none') complexBackground = true;
      const candidate = parseColor(ancestorStyle.backgroundColor);
      if (candidate && candidate.alpha > 0) {
        background = composite(candidate.rgb, background, candidate.alpha);
        opaqueBackgroundFound ||= candidate.alpha === 1;
      }
    }
    const backgroundResolved = opaqueBackgroundFound && !complexBackground;
    let ratio = null;
    if (foreground && backgroundResolved) {
      const finalForeground = composite(foreground.rgb, background, foreground.alpha);
      const [high, low] = [luminance(finalForeground), luminance(background)].sort((a, b) => b - a);
      ratio = Math.round((high + 0.05) / (low + 0.05) * 100) / 100;
    }
    const reason = ratio !== null ? null
      : !foreground ? 'invalid_foreground'
        : complexBackground ? 'complex_background'
          : 'no_opaque_background';
    samples.push({
      tag: owner.tagName.toLowerCase(), selector: selectorOf(owner), text: text.slice(0, 120),
      ratio, foreground: style.color,
      background: backgroundResolved ? background.map(Math.round) : 'complex/indeterminate',
      backgroundResolved, reason,
    });
  }
  return {
    status: samples.length ? 'measured' : 'not-measured',
    renderedTextNodeCount, unmeasuredVisibleTextCount,
    sampleCount: samples.length,
    resolvedCount: samples.filter(sample => sample.ratio !== null).length,
    indeterminateCount: samples.filter(sample => sample.ratio === null).length,
    under45: samples.filter(sample => sample.ratio !== null && sample.ratio < 4.5),
    samples,
    unmeasuredSamples,
  };
}
