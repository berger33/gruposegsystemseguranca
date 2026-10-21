/** Browser-side PU4 probe. Pass this function to Playwright page.evaluate(). */
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
  const samples = [];
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
    const ownSelector = `${owner.tagName.toLowerCase()}${owner.id ? `#${owner.id}` : ''}${typeof owner.className === 'string' && owner.className.trim() ? `.${owner.className.trim().split(/\s+/).join('.')}` : ''}`;
    const parent = owner.parentElement;
    const parentSelector = parent && (parent.id || (typeof parent.className === 'string' && parent.className.trim()))
      ? `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ''}${typeof parent.className === 'string' && parent.className.trim() ? `.${parent.className.trim().split(/\s+/).join('.')}` : ''}`
      : null;
    const selector = parentSelector ? `${parentSelector} > ${ownSelector}` : ownSelector;
    samples.push({
      tag: owner.tagName.toLowerCase(), selector, text: text.slice(0, 120),
      ratio, foreground: style.color,
      background: backgroundResolved ? background.map(Math.round) : 'complex/indeterminate',
      backgroundResolved,
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
  };
}
