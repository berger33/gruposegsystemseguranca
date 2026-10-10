// Academia Seg System Segurança: interface em JavaScript puro (sem build).
// Regras de alçada e pontuação ficam no servidor; aqui só se apresenta o resultado.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var topbar = document.getElementById('topbar');
  var toasts = document.getElementById('toasts');
  var confettiLayer = document.getElementById('confetti');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var me = null;
  var justLoggedIn = false;
  var memoryToken = null;
  var TOKEN_KEY = 'academia_token';

  var PALETTE = ['#315aca', '#0f766e', '#7c3aed', '#b45309', '#be185d', '#0369a1', '#4f46e5', '#15803d', '#475569'];
  var CONFETTI = ['#315aca', '#7fb0ff', '#c8a8ff', '#1d7a4f', '#f2b84b', '#ffffff'];

  // Ícones (traços estilo Lucide, desenhados aqui para não depender de biblioteca)
  var ICONS = {
    layers: '<path d="M12 3 2 8l10 5 10-5-10-5z"/><path d="m2 13 10 5 10-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M21.5 20a6.5 6.5 0 0 0-4-6"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 13h18"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.5"/>',
    grid: '<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>',
    shield: '<path d="M12 22s8-3.8 8-10V5l-8-3-8 3v7c0 6.2 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 4v5h-5"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    lock: '<rect x="4.5" y="11" width="15" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1"/><path d="M6.6 6.6A17.7 17.7 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    sliders: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
    history: '<path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
  };
  var TRACK_ICON = {
    fundamentos: 'layers',
    'equipe-entrada': 'users',
    'funcionario-ponto': 'clock',
    'funcionario-pedidos': 'book',
    'cliente-portal': 'users',
    'cliente-servicos': 'briefcase',
    'comercial-funil': 'target',
    'gestao-painel': 'grid',
    'rh-processos': 'briefcase',
    'rh-vida': 'users',
    'rh-folha': 'chart',
    'operacao-escala': 'pin',
    'operacao-postos': 'pin',
    'operacao-recursos': 'grid',
    'contratos-gestao': 'book',
    'financeiro-receber': 'chart',
    'compliance-gestao': 'shield',
    'admin-acessos': 'lock',
    'admin-sistema': 'shield',
    'ti-seguranca': 'shield',
    'portaria-rotina': 'pin',
    'controle-acesso': 'lock',
    'servicos-gerais': 'sparkles',
    'instalacao-seguranca': 'target',
  };
  var TAG_LABEL = { S: 'Sistema', P: 'Procedimento', T: 'Conteúdo técnico', D: 'Demonstração' };
  var STATE_LABEL = { gestao: 'Papel de gestão', padrao: 'Padrão do setor', liberada: 'Liberada', bloqueada: 'Bloqueada', sem: 'Sem acesso' };
  var STATE_GLYPH = { gestao: '★', padrao: '●', liberada: '＋', bloqueada: '－', sem: '○' };

  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, cls) {
    return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function hashOf(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  }
  function colorFor(text) { return PALETTE[hashOf(text) % PALETTE.length]; }
  function accentFor(id) { return colorFor(id || 'x'); }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    var first = parts[0] ? parts[0].charAt(0) : '';
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  // Token de sessão: sessionStorage quando disponível; memória da página como reserva (iframe sandbox).
  function getToken() {
    if (memoryToken) return memoryToken;
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
  }
  function setToken(value) {
    memoryToken = value || null;
    try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch (_) {}
  }

  function api(path, options) {
    var opts = { method: (options && options.method) || 'GET', credentials: 'same-origin', headers: {} };
    var token = getToken();
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    if (options && options.body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    return fetch(path, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || 'erro');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function setPage(html, title) {
    app.innerHTML = html;
    app.classList.remove('enter', 'bare');
    void app.offsetWidth;
    app.classList.add('enter');
    document.title = (title ? title + ' · ' : '') + 'Academia Seg System Segurança';
    app.focus({ preventScroll: true });
    animateMeters(app);
  }

  // Anéis e barras começam vazios e animam até o valor (sem depender de CSS inline no HTML).
  function animateMeters(root) {
    var scope = root || document;
    var rings = scope.querySelectorAll('[data-ring]');
    var bars = scope.querySelectorAll('[data-bar]');
    var counters = scope.querySelectorAll('[data-count]');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(rings, function (el) {
          var p = Math.max(0, Math.min(100, Number(el.getAttribute('data-ring')) || 0));
          el.style.strokeDashoffset = String(327 * (1 - p / 100));
        });
        Array.prototype.forEach.call(bars, function (el) {
          el.style.width = Math.max(0, Math.min(100, Number(el.getAttribute('data-bar')) || 0)) + '%';
        });
      });
    });
    Array.prototype.forEach.call(counters, function (el) {
      countUp(el, Number(el.getAttribute('data-count')) || 0);
    });
  }

  function countUp(el, to) {
    if (reduceMotion || to === 0) { el.textContent = String(to); return; }
    var start = null;
    var duration = 900;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function toast(options) {
    var el = document.createElement('div');
    el.className = 'toast' + (options.danger ? ' danger' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="t-ico">' + icon(options.icon || 'sparkles') + '</span><div><strong>' + esc(options.title) + '</strong>' +
      (options.text ? '<div class="small">' + esc(options.text) + '</div>' : '') + '</div><span class="t-bar"></span>';
    toasts.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, 5800);
  }

  function celebrate() {
    if (reduceMotion) return;
    var pieces = 42;
    for (var i = 0; i < pieces; i++) {
      var span = document.createElement('span');
      span.className = 'confetti';
      span.style.left = Math.random() * 100 + 'vw';
      span.style.background = CONFETTI[i % CONFETTI.length];
      span.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      span.style.animationDelay = (Math.random() * 0.4) + 's';
      span.style.width = (6 + Math.random() * 6) + 'px';
      confettiLayer.appendChild(span);
      setTimeout(function (node) { return function () { node.remove(); }; }(span), 3600);
    }
  }

  function updateTopbar() {
    topbar.hidden = !me;
    if (me) {
      document.getElementById('sector-chip').textContent = me.sectorLabel;
      var avatar = document.getElementById('avatar');
      avatar.textContent = initials(me.name);
      avatar.style.background = 'linear-gradient(135deg,' + colorFor(me.name) + ',#172b68)';
      avatar.title = me.name;
    }
  }

  function skeleton() {
    return '<div class="skel skel-hero" aria-hidden="true"></div><div class="skel-row" aria-hidden="true"><div class="skel skel-card"></div><div class="skel skel-card"></div></div>';
  }

  function renderError(message) {
    setPage('<section class="card reveal" style="max-width:560px;margin:40px auto"><div class="callout-ico" style="background:var(--danger-bg);color:var(--danger);width:48px;height:48px;border-radius:14px;display:grid;place-items:center">' +
      icon('alert') + '</div><h2 style="margin-top:14px">Não foi possível carregar</h2><p class="muted" style="margin-top:6px">' + esc(message) +
      '</p><p style="margin-top:18px"><a class="btn-primary" href="#/">Voltar ao início</a></p></section>', 'Erro');
  }

  // ---------- Acesso ----------
  function renderLogin(message) {
    var demo = document.documentElement.dataset.demo === 'true';
    var demoBox = demo
      ? '<div class="demo-box reveal" style="--d:4"><div><strong>Conta de demonstração</strong><span>carla.mendes@academia.exemplo · Academia#2026</span></div>' +
        '<button type="button" class="btn-ghost sm" id="fill-demo">Preencher</button></div>'
      : '';
    setPage(
      '<div class="login">' +
      '<section class="login-hero">' +
      '<div class="orb o1"></div><div class="orb o2"></div><div class="grid-lines"></div>' +
      '<div class="login-inner">' +
      '<div class="hero-brand reveal"><span class="brand-mark"><span>AS</span></span><span>Academia Seg System Segurança</span><span class="pill-soon">Em construção</span></div>' +
      '<div class="login-copy">' +
      '<p class="eyebrow light reveal" style="--d:1">Capacitação corporativa</p>' +
      '<h2 class="reveal" style="--d:2">Aprender no ritmo do seu trabalho.</h2>' +
      '<p class="lead reveal" style="--d:3">Trilhas por setor, aulas objetivas com verificação de aprendizagem e um progresso que você acompanha a cada conquista.</p>' +
      '</div>' +
      '<ul class="feature-list">' +
      '<li class="reveal" style="--d:4"><span class="fi">' + icon('layers', 'lg') + '</span><div><strong>Trilhas do seu setor</strong><span class="txt">Só o que é relevante para a sua função.</span></div></li>' +
      '<li class="reveal" style="--d:5"><span class="fi">' + icon('clock', 'lg') + '</span><div><strong>Aulas curtas</strong><span class="txt">De 2 a 4 minutos, com objetivo e passos claros.</span></div></li>' +
      '<li class="reveal" style="--d:6"><span class="fi">' + icon('trophy', 'lg') + '</span><div><strong>Progresso reconhecido</strong><span class="txt">Pontos, níveis e selos a cada trilha concluída.</span></div></li>' +
      '</ul>' +
      '</div>' +
      '<p class="login-foot">Grupo SEG System · Guarulhos, SP</p>' +
      '</section>' +
      '<section class="login-panel">' +
      '<div class="login-card reveal" style="--d:1">' +
      '<div class="login-head"><span class="brand-mark"><span>AS</span></span><h1>Entrar na Academia</h1><p>Use o e-mail e a senha informados pelo seu gestor.</p></div>' +
      '<form id="login-form" class="form" novalidate>' +
      '<div class="field"><label for="f-email">E-mail</label><div class="input-wrap">' + icon('mail') +
      '<input id="f-email" name="email" type="email" autocomplete="username" required placeholder="seu.nome@empresa.com.br"></div></div>' +
      '<div class="field"><label for="f-pass">Senha</label><div class="input-wrap">' + icon('lock') +
      '<input id="f-pass" name="password" type="password" autocomplete="current-password" required class="has-toggle">' +
      '<button type="button" class="toggle-pass" id="toggle-pass" aria-label="Mostrar senha" aria-pressed="false">' + icon('eye', 'sm') + '</button></div></div>' +
      '<div class="alert" id="login-error" role="alert" hidden>' + icon('alert', 'sm') + '<span id="login-error-text"></span></div>' +
      '<button class="btn-primary btn-block" type="submit" id="login-submit"><span class="btn-label">Entrar</span>' + icon('arrow', 'sm') + '<span class="spinner" aria-hidden="true"></span></button>' +
      '</form>' +
      demoBox +
      '<p class="login-note">A mesma página atende todos os setores. Depois de entrar, você vê somente as trilhas do seu setor.</p>' +
      '</div></section></div>',
      'Entrar'
    );

    app.classList.add('bare');
    if (message) showLoginError(message);
    var form = document.getElementById('login-form');
    form.addEventListener('submit', onLogin);
    document.getElementById('toggle-pass').addEventListener('click', togglePassword);
    var fill = document.getElementById('fill-demo');
    if (fill) {
      fill.addEventListener('click', function () {
        document.getElementById('f-email').value = 'carla.mendes@academia.exemplo';
        document.getElementById('f-pass').value = 'Academia#2026';
        document.getElementById('f-pass').focus();
      });
    }
    document.getElementById('f-email').focus();
  }

  function showLoginError(message) {
    var box = document.getElementById('login-error');
    document.getElementById('login-error-text').textContent = message;
    box.hidden = false;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function togglePassword(event) {
    var input = document.getElementById('f-pass');
    var button = event.currentTarget;
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    button.innerHTML = icon(show ? 'eyeOff' : 'eye', 'sm');
  }

  function onLogin(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = document.getElementById('login-submit');
    var email = form.email.value.trim();
    var password = form.password.value;
    document.getElementById('login-error').hidden = true;
    if (!email || !password) {
      showLoginError('Informe e-mail e senha.');
      return;
    }
    button.disabled = true;
    button.classList.add('loading');
    api('/api/login', { method: 'POST', body: { email: email, password: password } })
      .then(function (data) {
        me = data.user;
        setToken(data.token);
        justLoggedIn = true;
        history.replaceState(null, '', '#/');
        toast({ icon: 'check', title: 'Bem-vindo(a) à Academia', text: 'Suas trilhas já estão prontas.' });
        return route();
      })
      .catch(function (err) {
        showLoginError(err.status === 401 ? 'E-mail ou senha inválidos. Confira os dados e tente novamente.' : 'Não foi possível entrar agora. Tente novamente em instantes.');
        button.disabled = false;
        button.classList.remove('loading');
      });
  }

  function onLogout() {
    api('/api/logout', { method: 'POST' }).catch(function () {}).then(function () {
      me = null;
      setToken(null);
      history.replaceState(null, '', '#/');
      route();
    });
  }

  // ---------- Página inicial ----------
  function heroMessage(d) {
    if (d.lessonsTotal === 0) return 'Nenhuma aula publicada para o seu setor ainda.';
    if (d.lessonsDone === 0) return 'Sua primeira aula está a um clique de distância.';
    if (d.lessonsDone >= d.lessonsTotal) return 'Você concluiu todas as aulas do seu setor. Obrigado pelo empenho.';
    var left = d.lessonsTotal - d.lessonsDone;
    return 'Faltam ' + left + (left === 1 ? ' aula' : ' aulas') + ' para concluir o seu setor. Continue de onde parou.';
  }

  function rankingHtml(lb) {
    if (!lb.top.length) return '<p class="empty">Ainda não há pontuações neste setor.</p>';
    var top = lb.top[0] ? lb.top[0].points : 0;
    function row(r, i) {
      var pct = top > 0 ? Math.round((r.points / top) * 100) : 0;
      return '<li class="rank-row reveal ' + (r.isMe ? 'me' : '') + '" style="--d:' + i + '">' +
        '<span class="rank-pos">' + r.rank + '</span>' +
        '<span class="avatar sm" style="background:linear-gradient(135deg,' + colorFor(r.name) + ',#172b68)">' + esc(initials(r.name)) + '</span>' +
        '<div class="rank-name"><span class="rank-text">' + esc(r.name) + '</span>' + (r.isMe ? '<span class="you">você</span>' : '') +
        '</div><span class="rank-pts">' + r.points + '</span>' +
        '<div class="rank-bar" style="grid-column:2 / span 3"><span data-bar="' + pct + '"></span></div></li>';
    }
    var html = lb.top.map(row).join('');
    if (lb.me && lb.me.rank > 5) html += '<li class="rank-sep" aria-hidden="true"></li>' + row(lb.me, 5);
    return '<ol class="rank-list" aria-label="Ranking do setor">' + html + '</ol>' +
      '<p class="rank-foot">Comparação entre ' + lb.size + (lb.size === 1 ? ' colega' : ' colegas') + ' do mesmo setor.</p>';
  }

  function badgesHtml(earned, available) {
    var tiles = earned.map(function (b, i) {
      return '<div class="badge-tile earned" style="--d:' + i + '" title="' + esc(b.detail) + '"><span class="badge-medal">' + icon('star', 'sm') +
        '</span><strong>' + esc(b.title) + '</strong><span>' + esc(b.detail) + '</span></div>';
    });
    var locked = Math.min(available, 3);
    for (var i = 0; i < locked; i++) {
      tiles.push('<div class="badge-tile locked"><span class="badge-medal">' + icon('lock', 'sm') + '</span><strong>Em aberto</strong><span>Continue as trilhas</span></div>');
    }
    if (!tiles.length) return '<p class="empty">Nenhum selo ainda. Conclua a primeira aula para começar.</p>';
    return '<div class="badge-grid">' + tiles.join('') + '</div>' +
      (available > 0 ? '<p class="badge-note">' + available + (available === 1 ? ' selo' : ' selos') + ' ainda ' + (available === 1 ? 'disponível' : 'disponíveis') + '.</p>' : '');
  }

  function trackCard(t, i) {
    var accent = accentFor(t.id);
    var status = t.complete
      ? '<span class="pill-ok">' + icon('check') + ' Concluída</span>'
      : (t.total === 0 ? '<span class="pill-muted">Em construção</span>' : '<span class="pct">' + t.percent + '%</span>');
    return '<a class="track-card card spot reveal" style="--d:' + i + ';--accent:' + accent + '" href="#/trilha/' + esc(t.id) + '">' +
      '<div class="track-top"><span class="track-ico">' + icon(TRACK_ICON[t.id] || 'book', 'lg') + '</span>' + status + '</div>' +
      '<h3>' + esc(t.title) + '</h3><p>' + esc(t.summary) + '</p>' +
      '<div class="bar"><span data-bar="' + t.percent + '"></span></div>' +
      '<div class="track-meta"><span>' + (t.total ? t.done + ' de ' + t.total + (t.total === 1 ? ' aula' : ' aulas') + (t.pendingCount ? ' · ' : '') : '') + (t.pendingCount ? t.pendingCount + ' em construção' : '') + '</span><span>' + icon('arrow', 'sm') + '</span></div></a>';
  }

  function renderHome() {
    setPage(skeleton(), 'Início');
    return api('/api/home').then(function (d) {
      var lv = d.level;
      var pct = d.lessonsTotal ? Math.round((d.lessonsDone / d.lessonsTotal) * 100) : 0;
      var rank = d.leaderboard.me ? d.leaderboard.me.rank : null;
      var earnedCount = d.badges.earned.length;
      var next = d.next
        ? '<section class="card next-card spot reveal" style="--d:1;--accent:' + accentFor(d.next.trackId) + '">' +
          '<span class="next-ico">' + icon(TRACK_ICON[d.next.trackId] || 'book', 'lg') + '</span>' +
          '<div class="next-body"><span class="label">Continue de onde parou</span><h2>' + esc(d.next.title) + '</h2>' +
          '<p class="muted small">' + esc(d.next.trackTitle) + ' · ' + d.next.minutes + ' min</p></div>' +
          '<a class="btn-primary" href="#/aula/' + esc(d.next.id) + '">Continuar ' + icon('arrow', 'sm') + '</a></section>'
        : '<section class="card next-card reveal" style="--d:1"><span class="done-check">' + icon('check', 'lg') + '</span>' +
          '<div class="next-body"><span class="label">Concluído</span><h2>Você concluiu as aulas do seu setor</h2>' +
          '<p class="muted small">Novas trilhas aparecerão aqui quando forem publicadas.</p></div></section>';

      var html =
        '<section class="hero-card reveal">' +
        '<div class="orb o1"></div><div class="orb o2"></div><div class="grid-lines"></div>' +
        '<div class="hero-main">' +
        '<p class="eyebrow light">' + esc(d.sector.label) + ' · ' + greeting() + '</p>' +
        '<h1 class="hero-title">Olá, ' + esc(d.user.firstName) + '.</h1>' +
        '<p class="hero-sub">' + esc(heroMessage(d)) + '</p>' +
        '<div class="hero-chips">' +
        '<span class="chip-light">' + icon('trophy', 'sm') + ' Nível ' + esc(lv.name) + '</span>' +
        '<span class="chip-light">' + icon('sparkles', 'sm') + ' <b data-count="' + d.points + '">0</b>&nbsp;pontos</span>' +
        (rank ? '<span class="chip-light">' + icon('users', 'sm') + ' ' + rank + 'º no setor</span>' : '') +
        '</div>' +
        '<div class="hero-level"><div class="bar"><span data-bar="' + lv.percent + '"></span></div>' +
        '<p>' + (lv.next ? 'Faltam ' + lv.next.remaining + ' pontos para ' + esc(lv.next.name) : 'Você alcançou o nível mais alto') + '</p></div>' +
        '</div>' +
        '<div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="ring-fg" data-ring="' + pct + '" cx="60" cy="60" r="52"/></svg>' +
        '<div class="ring-text"><strong>' + pct + '%</strong><span>' + d.lessonsDone + ' de ' + d.lessonsTotal + ' aulas</span></div></div>' +
        '</section>' +
        next +
        '<div class="stat-row">' +
        '<div class="card stat-card reveal" style="--d:2"><span class="stat-ico">' + icon('check') + '</span><div><strong data-count="' + d.lessonsDone + '">0</strong><span>Aulas concluídas</span></div></div>' +
        '<div class="card stat-card reveal" style="--d:3"><span class="stat-ico">' + icon('star') + '</span><div><strong data-count="' + earnedCount + '">0</strong><span>Selos conquistados</span></div></div>' +
        '<div class="card stat-card reveal" style="--d:4"><span class="stat-ico">' + icon('target') + '</span><div><strong data-count="' + d.tracks.length + '">0</strong><span>Trilhas do setor</span></div></div>' +
        '</div>';

      var manage = d.user.canManage
        ? '<a class="card access-cta reveal" style="--d:2" href="#/acessos"><span class="stat-ico">' + icon('sliders') + '</span>' +
          '<div class="access-cta-body"><strong>Acessos às trilhas</strong><span class="muted small">Gerencie quem vê cada trilha: liberações, bloqueios e padrão do setor.</span></div>' +
          icon('arrow', 'sm') + '</a>'
        : '';

      html += '<div class="grid-home"><div>' + manage +
        '<div class="section-head"><h2>Trilhas do seu setor</h2><span class="muted">' + d.tracks.length + (d.tracks.length === 1 ? ' trilha' : ' trilhas') + '</span></div>' +
        '<div class="tracks">' + d.tracks.map(trackCard).join('') + '</div>' +
        '</div><aside class="stack">' +
        '<section class="card reveal" style="--d:2"><div class="side-title"><h2>Ranking do setor</h2>' + icon('trophy', 'sm') + '</div>' + rankingHtml(d.leaderboard) + '</section>' +
        '<section class="card reveal" style="--d:3"><div class="side-title"><h2>Selos</h2>' + icon('star', 'sm') + '</div>' + badgesHtml(d.badges.earned, d.badges.available) + '</section>' +
        '</aside></div>';

      setPage(html, 'Início');
    });
  }

  // ---------- Trilha ----------
  function renderTrack(id) {
    setPage(skeleton(), 'Trilha');
    return api('/api/tracks/' + encodeURIComponent(id)).then(function (t) {
      var accent = accentFor(t.id);
      var items = t.lessons.map(function (l, i) {
        if (l.pending) {
          return '<div class="tl-item pending reveal" style="--d:' + i + '">' +
            '<span class="tl-node">' + icon('lock', 'sm') + '</span>' +
            '<div class="tl-card card"><div><h3>' + esc(l.title) + '</h3>' +
            '<p class="muted small">' + (TAG_LABEL[l.tag] ? 'Origem: ' + TAG_LABEL[l.tag] + ' · ' : '') + 'Conteúdo ainda não publicado.</p></div>' +
            '<div class="tl-side"><span class="pill-soon-tag">Em construção</span></div></div></div>';
        }
        return '<a class="tl-item reveal ' + (l.done ? 'done' : '') + '" style="--d:' + i + '" href="#/aula/' + esc(l.id) + '">' +
          '<span class="tl-node">' + (l.done ? icon('check', 'sm') : i + 1) + '</span>' +
          '<div class="tl-card card spot"><div><h3>' + esc(l.title) + '</h3><p class="muted small">' + esc(l.objective) + '</p></div>' +
          '<div class="tl-side"><span class="muted small">' + l.minutes + ' min</span><span class="status ' + (l.done ? 'ok' : '') + '">' +
          (l.done ? 'Concluída' : 'Pendente') + '</span></div></div></a>';
      }).join('');
      setPage(
        '<nav class="crumbs reveal" aria-label="Você está aqui"><a href="#/">Início</a><span>/</span><span>' + esc(t.title) + '</span></nav>' +
        '<section class="track-hero hero-card reveal" style="--accent:' + accent + '">' +
        '<div class="orb o1"></div><div class="grid-lines"></div>' +
        '<div class="track-hero-main"><span class="track-ico">' + icon(TRACK_ICON[t.id] || 'book', 'lg') + '</span>' +
        '<div><p class="eyebrow light">Trilha · ' + esc(t.sectorLabel) + '</p><h1 class="hero-title">' + esc(t.title) + '</h1>' +
        '<p class="hero-sub">' + esc(t.summary) + '</p></div></div>' +
        '<div class="ring-wrap sm"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="ring-fg" data-ring="' + t.percent + '" cx="60" cy="60" r="52"/></svg>' +
        '<div class="ring-text"><strong>' + (t.total ? t.percent + '%' : '—') + '</strong><span>' + (t.total ? t.done + ' de ' + t.total + ' aulas' : t.pendingCount + ' em construção') + '</span></div></div>' +
        '</section>' +
        '<div class="timeline">' + items + '</div>',
        t.title
      );
    });
  }

  // ---------- Aula ----------
  function resultBlock(r) {
    return '<div class="result ' + (r.correct ? 'ok' : 'warn') + ' pop-in" role="status">' +
      '<span class="result-ico">' + icon(r.correct ? 'check' : 'refresh') + '</span><div>' +
      '<strong>' + (r.correct ? 'Resposta correta na primeira tentativa' : 'Resposta para revisar') + '</strong>' +
      '<p>' + esc(r.explanation) + '</p>' +
      '<span class="pts-pill">+' + r.pointsEarned + ' pontos nesta aula</span></div></div>';
  }

  function renderLesson(id) {
    setPage(skeleton(), 'Aula');
    return api('/api/lessons/' + encodeURIComponent(id)).then(function (l) {
      var r = l.result;
      var options = l.options.map(function (opt, i) {
        var cls = 'opt';
        var checked = r && i === r.chosen ? ' checked' : '';
        if (r) {
          cls += ' locked';
          if (i === r.answer) cls += ' correct';
          else if (i === r.chosen && !r.correct) cls += ' wrong';
        }
        return '<label class="' + cls + '"><input type="radio" name="choice" value="' + i + '"' + checked + '>' +
          '<span class="opt-mark" aria-hidden="true"></span><span class="opt-text">' + esc(opt) + '</span></label>';
      }).join('');
      var steps = l.steps.map(function (s, i) {
        return '<li class="step reveal" style="--d:' + (i + 2) + '"><span class="step-n">' + (i + 1) + '</span><p>' + esc(s) + '</p></li>';
      }).join('');
      var dots = '';
      for (var i = 1; i <= l.total; i++) dots += '<span class="' + (i === l.position ? 'on' : i < l.position ? 'past' : '') + '"></span>';

      var quiz = '<form class="quiz-form" id="quiz-form">' +
        '<fieldset' + (r ? ' disabled' : '') + ' aria-labelledby="quiz-title">' + options + '</fieldset>' +
        (r ? '' : '<button class="btn-primary btn-block" type="submit" id="quiz-submit" disabled>Registrar conclusão ' + icon('check', 'sm') + '</button>') +
        '<p class="quiz-error" id="quiz-error" role="alert"></p></form>';

      var after = '<div class="next-step">' +
        '<a class="btn-ghost" href="#/trilha/' + esc(l.trackId) + '">Voltar à trilha</a>' +
        (l.nextLessonId ? '<a class="btn-primary" href="#/aula/' + esc(l.nextLessonId) + '">Próxima aula ' + icon('arrow', 'sm') + '</a>' : '') +
        '</div>';

      setPage(
        '<nav class="crumbs reveal" aria-label="Você está aqui"><a href="#/">Início</a><span>/</span><a href="#/trilha/' + esc(l.trackId) + '">' +
        esc(l.trackTitle) + '</a><span>/</span><span>Aula ' + l.position + ' de ' + l.total + '</span></nav>' +
        '<div class="lesson-layout"><section class="lesson-main">' +
        '<header class="lesson-head reveal"><p class="eyebrow">' + esc(l.trackTitle) + '</p><h1>' + esc(l.title) + '</h1>' +
        '<div class="lesson-meta"><span>' + icon('clock', 'sm') + ' ' + l.minutes + ' min</span><span>Aula ' + l.position + ' de ' + l.total + '</span>' +
        (r ? '<span class="pill-ok">' + icon('check') + ' Concluída</span>' : '') + '</div>' +
        '<div class="dots" aria-hidden="true">' + dots + '</div></header>' +
        '<div class="callout reveal" style="--d:1"><span class="callout-ico">' + icon('target') + '</span><div><strong>Objetivo</strong><p>' + esc(l.objective) + '</p></div></div>' +
        '<h2 class="section-sub">Passos</h2><ol class="steps">' + steps + '</ol>' +
        '</section>' +
        '<aside class="card quiz-card reveal" style="--d:2" aria-labelledby="quiz-title"><p class="eyebrow">Verificação de aprendizagem</p>' +
        '<h2 id="quiz-title">' + esc(l.question) + '</h2>' +
        '<p class="muted small" style="margin-bottom:12px">Os pontos são creditados na primeira conclusão.</p>' +
        quiz + (r ? resultBlock(r) + after : '') +
        '</aside></div>',
        l.title
      );

      if (!r) {
        var form = document.getElementById('quiz-form');
        var submit = document.getElementById('quiz-submit');
        form.addEventListener('change', function () {
          submit.disabled = false;
          Array.prototype.forEach.call(form.querySelectorAll('.opt'), function (o) {
            o.classList.toggle('picked', o.querySelector('input').checked);
          });
        });
        form.addEventListener('submit', function (event) { onAnswer(event, l.id); });
      }
    });
  }

  function onAnswer(event, lessonId) {
    event.preventDefault();
    var form = event.currentTarget;
    var checked = form.querySelector('input[name="choice"]:checked');
    var errorEl = document.getElementById('quiz-error');
    if (!checked) {
      errorEl.textContent = 'Escolha uma resposta para concluir a aula.';
      return;
    }
    var submit = document.getElementById('quiz-submit');
    submit.disabled = true;
    api('/api/lessons/' + encodeURIComponent(lessonId) + '/complete', { method: 'POST', body: { choice: Number(checked.value) } })
      .then(function (res) {
        if (!res.alreadyCompleted) {
          var text = '+' + res.pointsEarned + ' pontos' + (res.correct ? ' · acerto na primeira tentativa' : '');
          if (res.trackCompleted) {
            toast({ icon: 'trophy', title: 'Trilha concluída!', text: text });
            celebrate();
          } else if (res.levelUp) {
            toast({ icon: 'sparkles', title: 'Novo nível: ' + res.level.name, text: text });
            celebrate();
          } else {
            toast({ icon: 'check', title: 'Aula concluída', text: text });
          }
          (res.newBadges || []).forEach(function (b) {
            toast({ icon: 'star', title: 'Selo conquistado: ' + b.title, text: b.detail });
          });
        }
        return renderLesson(lessonId);
      })
      .catch(function (err) {
        if (err.status === 401) return route();
        errorEl.textContent = 'Não foi possível registrar agora. Tente novamente.';
        submit.disabled = false;
      });
  }

  // ---------- Busca ----------
  function renderSearch(q) {
    var term = q.trim();
    if (term.length < 2) {
      setPage('<section class="card reveal" style="max-width:560px;margin:40px auto"><h2>Busca</h2><p class="muted" style="margin-top:6px">Digite pelo menos duas letras na busca do topo da página.</p></section>', 'Busca');
      return Promise.resolve();
    }
    return api('/api/search?q=' + encodeURIComponent(term)).then(function (data) {
      var list = data.results.length
        ? '<div class="result-list">' + data.results.map(function (r, i) {
          return '<a class="card spot result-item reveal" style="--d:' + i + '" href="#/aula/' + esc(r.id) + '"><span class="num">' + icon('book') + '</span>' +
            '<div><h3>' + esc(r.title) + '</h3><p>' + esc(r.trackTitle) + ' · ' + r.minutes + ' min</p></div></a>';
        }).join('') + '</div>'
        : '<p class="empty" style="margin-top:18px">Nenhuma aula do seu setor corresponde a esta busca.</p>';
      setPage('<nav class="crumbs reveal"><a href="#/">Início</a><span>/</span><span>Busca</span></nav>' +
        '<h1 class="reveal">Resultados para “' + esc(term) + '”</h1>' + list, 'Busca');
    });
  }

  // ---------- Acessos às trilhas (Marcelo, RH e admin) ----------
  var accessView = null;
  var accessFilters = { sector: '', person: '', track: '', changedOnly: false };
  var accessSelection = {};

  function accessStateChip(state) {
    var label = STATE_LABEL[state] || state;
    return '<span class="st st-' + esc(state) + '" title="' + esc(label) + '"><i>' + (STATE_GLYPH[state] || '·') + '</i>' + esc(label) + '</span>';
  }

  function accessLegend() {
    return '<div class="access-legend">' + ['gestao', 'padrao', 'liberada', 'bloqueada', 'sem'].map(function (k) {
      return '<span class="st st-' + k + '"><i>' + STATE_GLYPH[k] + '</i>' + STATE_LABEL[k] + '</span>';
    }).join('') + '</div>';
  }

  function accessPersonMatches(person) {
    if (accessFilters.sector && person.sector !== accessFilters.sector) return false;
    if (accessFilters.person) {
      var q = accessFilters.person.toLowerCase();
      if (person.name.toLowerCase().indexOf(q) === -1 && person.email.toLowerCase().indexOf(q) === -1) return false;
    }
    if (accessFilters.changedOnly) {
      var states = accessView.states[person.id] || {};
      var any = false;
      for (var key in states) {
        if (states[key] === 'liberada' || states[key] === 'bloqueada') { any = true; break; }
      }
      if (!any) return false;
    }
    return true;
  }

  function accessTrackMatches(track) {
    if (accessFilters.track) {
      var q = accessFilters.track.toLowerCase();
      if (track.title.toLowerCase().indexOf(q) === -1 && track.id.indexOf(q) === -1) return false;
    }
    return true;
  }

  function paintAccessMatrix() {
    var host = document.getElementById('access-matrix');
    if (!host || !accessView) return;
    var tracks = accessView.tracks.filter(accessTrackMatches);
    var people = accessView.people.filter(accessPersonMatches);
    if (!tracks.length || !people.length) {
      host.innerHTML = '<p class="empty">Nenhum resultado para os filtros escolhidos.</p>';
      return;
    }
    var groups = [];
    tracks.forEach(function (t) {
      var last = groups[groups.length - 1];
      if (last && last.name === t.group) last.count += 1;
      else groups.push({ name: t.group, count: 1 });
    });
    var head =
      '<tr class="grp">' + '<th class="person-col"></th>' + groups.map(function (g) {
        return '<th colspan="' + g.count + '">' + esc(g.name) + '</th>';
      }).join('') + '</tr>' +
      '<tr>' + '<th class="person-col"><label class="chk"><input type="checkbox" id="chk-all"><span>Pessoa</span></label></th>' +
      tracks.map(function (t) {
        return '<th class="track-col"><button type="button" class="track-head" data-track="' + esc(t.id) + '" title="Padrão do setor: ' + esc(t.title) + '">' +
          '<span>' + esc(t.title.split(':')[0]) + (t.pendingCount ? '<i class="pend-dot" title="' + t.pendingCount + ' aulas em construção"></i>' : '') + '</span></button></th>';
      }).join('') + '</tr>';

    var body = people.map(function (person) {
      var states = accessView.states[person.id] || {};
      return '<tr data-user="' + esc(person.id) + '">' +
        '<th class="person-col"><label class="chk"><input type="checkbox" class="chk-person" data-user="' + esc(person.id) + '"' + (accessSelection[person.id] ? ' checked' : '') + '>' +
        '<span class="avatar sm" style="background:linear-gradient(135deg,' + colorFor(person.name) + ',#172b68)">' + esc(initials(person.name)) + '</span>' +
        '<button type="button" class="person-link" data-user="' + esc(person.id) + '"><strong>' + esc(person.name) + '</strong>' +
        '<em>' + esc(person.sectorLabel) + (person.manager ? ' · gestão' : '') + '</em></button></label></th>' +
        tracks.map(function (t) {
          var st = states[t.id] || 'sem';
          return '<td><button type="button" class="cell st-' + esc(st) + '" data-user="' + esc(person.id) + '" data-track="' + esc(t.id) + '" title="' + esc(STATE_LABEL[st]) + '">' +
            '<i>' + (STATE_GLYPH[st] || '·') + '</i></button></td>';
        }).join('') + '</tr>';
    }).join('');

    host.innerHTML = '<div class="matrix-scroll"><table class="access-matrix"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

    var all = document.getElementById('chk-all');
    if (all) {
      all.checked = people.length > 0 && people.every(function (p) { return accessSelection[p.id]; });
      all.addEventListener('change', function () {
        people.forEach(function (p) {
          if (all.checked) accessSelection[p.id] = true;
          else delete accessSelection[p.id];
        });
        paintAccessMatrix();
        updateBatchBar();
      });
    }
    Array.prototype.forEach.call(host.querySelectorAll('.chk-person'), function (chk) {
      chk.addEventListener('change', function () {
        if (chk.checked) accessSelection[chk.dataset.user] = true;
        else delete accessSelection[chk.dataset.user];
        updateBatchBar();
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.cell'), function (btn) {
      btn.addEventListener('click', function () { openCellModal(btn.dataset.user, btn.dataset.track); });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.person-link'), function (btn) {
      btn.addEventListener('click', function () { openPersonDrawer(btn.dataset.user); });
    });
    Array.prototype.forEach.call(host.querySelectorAll('.track-head'), function (btn) {
      btn.addEventListener('click', function () { openSectorModal(btn.dataset.track); });
    });
  }

  function updateBatchBar() {
    var bar = document.getElementById('batch-bar');
    if (!bar) return;
    var ids = Object.keys(accessSelection);
    bar.hidden = ids.length === 0;
    var count = document.getElementById('batch-count');
    if (count) count.textContent = ids.length + (ids.length === 1 ? ' pessoa selecionada' : ' pessoas selecionadas');
    var sel = document.getElementById('batch-track');
    if (sel && !sel.options.length && accessView) {
      sel.innerHTML = accessView.tracks.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.title) + '</option>';
      }).join('');
    }
  }

  function postAccess(path, body, okMessage) {
    return api(path, { method: 'POST', body: body }).then(function () {
      toast({ icon: 'check', title: 'Tudo certo', text: okMessage });
      return reloadAccess();
    }).catch(function (err) {
      var msg = err && err.data && err.data.error === 'motivo_obrigatorio'
        ? 'Informe um motivo com pelo menos 3 letras.'
        : 'Não foi possível aplicar a alteração.';
      toast({ icon: 'alert', title: 'Alteração não aplicada', text: msg, danger: true });
    });
  }

  function openModal(html) {
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = '<div class="modal card" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', escModal);
    return overlay;
  }

  function escModal(event) {
    if (event.key === 'Escape') closeModal();
  }

  function closeModal() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.remove();
    document.removeEventListener('keydown', escModal);
  }

  function askReason(title, text, confirmLabel, onConfirm) {
    var overlay = openModal(
      '<h2>' + esc(title) + '</h2><p class="muted small">' + esc(text) + '</p>' +
      '<div class="field"><label for="m-reason">Motivo (fica na auditoria)</label>' +
      '<textarea id="m-reason" rows="3" placeholder="Ex.: alinhado com o plano de treinamento do período"></textarea></div>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">Cancelar</button>' +
      '<button type="button" class="btn-primary" id="m-ok">' + esc(confirmLabel) + '</button></div>'
    );
    overlay.querySelector('#m-cancel').addEventListener('click', closeModal);
    overlay.querySelector('#m-ok').addEventListener('click', function () {
      var reason = overlay.querySelector('#m-reason').value.trim();
      if (reason.length < 3) {
        overlay.querySelector('#m-reason').classList.add('invalid');
        return;
      }
      closeModal();
      onConfirm(reason);
    });
    overlay.querySelector('#m-reason').focus();
  }

  function openCellModal(userId, trackId) {
    var person = accessView.people.filter(function (p) { return p.id === userId; })[0];
    var track = accessView.tracks.filter(function (t) { return t.id === trackId; })[0];
    if (!person || !track) return;
    var state = (accessView.states[userId] || {})[trackId] || 'sem';
    if (person.manager) {
      var info = openModal('<h2>' + esc(person.name) + '</h2><p class="muted small">' + esc(track.title) + '</p>' +
        '<p>Esta pessoa tem <strong>papel de gestão</strong> e enxerga todas as trilhas. Não há estado individual a alterar.</p>' +
        '<div class="modal-actions"><button type="button" class="btn-primary" id="m-close">Fechar</button></div>');
      info.querySelector('#m-close').addEventListener('click', closeModal);
      return;
    }
    var overlay = openModal(
      '<h2>' + esc(person.name) + '</h2><p class="muted small">' + esc(track.title) + ' · estado atual: ' + esc(STATE_LABEL[state]) + '</p>' +
      '<div class="field"><label for="m-reason">Motivo (fica na auditoria)</label>' +
      '<textarea id="m-reason" rows="3" placeholder="Ex.: liberado para a turma de supervisão"></textarea></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn-ghost" data-act="reset">Padrão do setor</button>' +
      '<button type="button" class="btn-ghost ok" data-act="grant">Liberar</button>' +
      '<button type="button" class="btn-ghost danger" data-act="block">Bloquear</button>' +
      '</div>'
    );
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-act]'), function (btn) {
      btn.addEventListener('click', function () {
        var reason = overlay.querySelector('#m-reason').value.trim();
        if (reason.length < 3) {
          overlay.querySelector('#m-reason').classList.add('invalid');
          return;
        }
        closeModal();
        postAccess('/api/accesses/user', { userId: userId, trackId: trackId, action: btn.dataset.act, reason: reason },
          'Acesso de ' + person.name.split(' ')[0] + ' atualizado.');
      });
    });
    overlay.querySelector('#m-reason').focus();
  }

  function openSectorModal(trackId) {
    var track = accessView.tracks.filter(function (t) { return t.id === trackId; })[0];
    if (!track) return;
    var sectorIds = Object.keys(accessView.sectors);
    var rows = sectorIds.map(function (sid) {
      var custom = accessView.sectorDefaults[sid] && accessView.sectorDefaults[sid][trackId];
      return '<label class="sector-row"><input type="checkbox" data-sector="' + esc(sid) + '"' + (custom === true ? ' checked' : '') + (custom === undefined ? ' data-default="1"' : '') + '>' +
        '<span>' + esc(accessView.sectors[sid]) + '</span><em class="muted small">' + (custom === undefined ? 'padrão da trilha' : (custom ? 'liberada' : 'retirada')) + '</em></label>';
    }).join('');
    var overlay = openModal(
      '<h2>Padrão do setor</h2><p class="muted small">' + esc(track.title) + ' · afeta todas as pessoas do setor que não tenham liberação ou bloqueio individual.</p>' +
      '<div class="sector-list">' + rows + '</div>' +
      '<div class="field"><label for="m-reason">Motivo (fica na auditoria)</label><textarea id="m-reason" rows="2"></textarea></div>' +
      '<label class="chk confirm"><input type="checkbox" id="m-confirm"><span>Entendo que isso altera o acesso de todas as pessoas dos setores marcados</span></label>' +
      '<div class="modal-actions"><button type="button" class="btn-ghost" id="m-cancel">Cancelar</button>' +
      '<button type="button" class="btn-primary" id="m-ok">Salvar alterações</button></div>'
    );
    overlay.querySelector('#m-cancel').addEventListener('click', closeModal);
    overlay.querySelector('#m-ok').addEventListener('click', function () {
      var reason = overlay.querySelector('#m-reason').value.trim();
      var confirm = overlay.querySelector('#m-confirm').checked;
      if (reason.length < 3 || !confirm) {
        if (reason.length < 3) overlay.querySelector('#m-reason').classList.add('invalid');
        if (!confirm) overlay.querySelector('#m-confirm').closest('.chk').classList.add('invalid');
        return;
      }
      var changed = [];
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-sector]'), function (chk) {
        var sid = chk.dataset.sector;
        var custom = accessView.sectorDefaults[sid] && accessView.sectorDefaults[sid][trackId];
        if (custom === undefined) return;
        if (custom !== chk.checked) changed.push({ sector: sid, on: chk.checked });
      });
      closeModal();
      if (!changed.length) return;
      var chain = Promise.resolve();
      changed.forEach(function (item) {
        chain = chain.then(function () {
          return api('/api/accesses/sector', { method: 'POST', body: { sector: item.sector, trackId: trackId, on: item.on, reason: reason } });
        });
      });
      chain.then(function () {
        toast({ icon: 'check', title: 'Padrão atualizado', text: changed.length + (changed.length === 1 ? ' setor alterado.' : ' setores alterados.') });
        return reloadAccess();
      }).catch(function () {
        toast({ icon: 'alert', title: 'Alteração não aplicada', text: 'Tente novamente.', danger: true });
      });
    });
  }

  function openPersonDrawer(userId) {
    var person = accessView.people.filter(function (p) { return p.id === userId; })[0];
    if (!person) return;
    var states = accessView.states[userId] || {};
    var rows = accessView.tracks.map(function (t) {
      var st = states[t.id] || 'sem';
      var why = st === 'gestao' ? 'Vê todas as trilhas pelo papel'
        : st === 'liberada' ? 'Liberação individual registrada'
        : st === 'bloqueada' ? 'Bloqueio individual registrado'
        : st === 'padrao' ? 'Definido pelo setor'
        : 'Fora do setor e sem liberação';
      var prog = (person.progress || []).filter(function (x) { return x.id === t.id; })[0];
      var pct = prog && prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
      return '<li><div class="pd-track"><strong>' + esc(t.title) + '</strong>' + accessStateChip(st) + '</div>' +
        '<p class="muted small">' + esc(why) + (prog && prog.total ? ' · ' + prog.done + ' de ' + prog.total + ' aulas publicadas' + (prog.pendingCount ? ' · ' + prog.pendingCount + ' em construção' : '') : (prog && prog.pendingCount ? ' · ' + prog.pendingCount + ' em construção' : '')) + '</p>' +
        (prog && prog.total ? '<div class="bar thin"><span data-bar="' + pct + '"></span></div>' : '') + '</li>';
    }).join('');
    var mine = accessView.audit.filter(function (e) { return e.userId === userId || e.sector === person.sector; });
    var audit = mine.length ? mine.slice(0, 12).map(function (e) {
      return '<li><strong>' + esc(e.trackTitle) + '</strong><p class="muted small">' + esc(e.action === 'grant' ? 'Liberada' : e.action === 'block' ? 'Bloqueada' : e.action === 'reset' ? 'Voltou ao padrão' : e.action === 'sector-on' ? 'Padrão do setor: liberada' : 'Padrão do setor: retirada') +
        ' · ' + esc(e.byName) + ' · ' + esc(String(e.at).slice(0, 10)) + '</p><p class="small">' + esc(e.reason) + '</p></li>';
    }).join('') : '<li><p class="muted small">Nenhuma alteração registrada.</p></li>';

    var overlay = openModal(
      '<div class="drawer-head"><span class="avatar lg" style="background:linear-gradient(135deg,' + colorFor(person.name) + ',#172b68)">' + esc(initials(person.name)) + '</span>' +
      '<div><h2>' + esc(person.name) + '</h2><p class="muted small">' + esc(person.email) + ' · ' + esc(person.sectorLabel) + '</p></div></div>' +
      '<div class="stat-row mini"><div class="card stat-card"><strong>' + person.points + '</strong><span>Pontos</span></div>' +
      '<div class="card stat-card"><strong>' + person.lessonsDone + '/' + person.lessonsTotal + '</strong><span>Aulas</span></div></div>' +
      '<h3>Trilhas e acesso</h3><ul class="pd-list">' + rows + '</ul>' +
      '<h3>Histórico de alterações</h3><ul class="pd-audit">' + audit + '</ul>' +
      '<div class="modal-actions"><button type="button" class="btn-primary" id="m-close">Fechar</button></div>'
    );
    overlay.querySelector('#m-close').addEventListener('click', closeModal);
    animateMeters(overlay);
  }

  function exportAccessCsv() {
    if (!accessView) return;
    var tracks = accessView.tracks;
    var lines = [['Pessoa', 'E-mail', 'Setor'].concat(tracks.map(function (t) { return t.title; }))];
    accessView.people.forEach(function (person) {
      var states = accessView.states[person.id] || {};
      lines.push([person.name, person.email, person.sectorLabel].concat(tracks.map(function (t) { return STATE_LABEL[states[t.id]] || ''; })));
    });
    var csv = lines.map(function (row) {
      return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'acessos-as-trilhas.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function paintAccessAudit() {
    var host = document.getElementById('access-audit');
    if (!host || !accessView) return;
    var q = (accessFilters.track || '').toLowerCase();
    var items = accessView.audit.filter(function (e) {
      if (accessFilters.person) {
        var p = accessFilters.person.toLowerCase();
        if ((e.userName || e.sectorLabel || '').toLowerCase().indexOf(p) === -1 && (e.byName || '').toLowerCase().indexOf(p) === -1) return false;
      }
      return true;
    });
    host.innerHTML = items.length
      ? '<ul class="audit-list">' + items.map(function (e) {
        return '<li><div class="audit-top"><strong>' + esc(e.trackTitle) + '</strong><span class="muted small">' + esc(String(e.at).replace('T', ' ').slice(0, 16)) + '</span></div>' +
          '<p class="small">' + esc(e.action === 'grant' ? 'Liberada para ' + (e.userName || '') : e.action === 'block' ? 'Bloqueada para ' + (e.userName || '') : e.action === 'reset' ? 'Voltou ao padrão para ' + (e.userName || '') : e.action === 'sector-on' ? 'Padrão do setor liberado: ' + (e.sectorLabel || '') : 'Padrão do setor retirado: ' + (e.sectorLabel || '')) + '</p>' +
          '<p class="muted small">' + esc(e.byName) + ' · ' + esc(e.reason) + '</p></li>';
      }).join('') + '</ul>'
      : '<p class="empty">Nenhuma alteração registrada até aqui.</p>';
  }

  function reloadAccess() {
    return api('/api/accesses').then(function (data) {
      accessView = data;
      paintAccessMatrix();
      paintAccessAudit();
      updateBatchBar();
      animateMeters(document.getElementById('app'));
    });
  }

  function renderAcessos() {
    setPage(skeleton(), 'Acessos às trilhas');
    return api('/api/accesses').then(function (data) {
      accessView = data;
      accessSelection = {};
      var sectorOpts = Object.keys(data.sectors).map(function (sid) {
        return '<option value="' + esc(sid) + '">' + esc(data.sectors[sid]) + '</option>';
      }).join('');
      setPage(
        '<nav class="crumbs reveal"><a href="#/">Início</a><span>/</span><span>Acessos às trilhas</span></nav>' +
        '<div class="access-head reveal"><div><h1>Acessos às trilhas</h1>' +
        '<p class="muted">Quem vê cada trilha, por setor e por pessoa. Toda alteração exige motivo e fica registrada.</p></div>' +
        '<a class="btn-ghost" href="#/">' + icon('arrow', 'sm') + ' Voltar</a></div>' +
        '<section class="card reveal" style="--d:1"><div class="access-toolbar">' +
        '<div class="field"><label for="f-setor">Setor</label><select id="f-setor"><option value="">Todos</option>' + sectorOpts + '</select></div>' +
        '<div class="field"><label for="f-pessoa">Pessoa</label><input id="f-pessoa" type="search" placeholder="Nome ou e-mail"></div>' +
        '<div class="field"><label for="f-trilha">Trilha</label><input id="f-trilha" type="search" placeholder="Nome da trilha"></div>' +
        '<label class="chk solo"><input type="checkbox" id="f-changed"><span>Só alterados</span></label>' +
        '<button type="button" class="btn-ghost sm" id="f-export">' + icon('download', 'sm') + ' Exportar CSV</button>' +
        '</div>' + accessLegend() +
        '<div class="batch-bar" id="batch-bar" hidden><strong id="batch-count"></strong>' +
        '<select id="batch-track" aria-label="Trilha da ação em lote"></select>' +
        '<button type="button" class="btn-ghost sm ok" data-batch="grant">Liberar</button>' +
        '<button type="button" class="btn-ghost sm danger" data-batch="block">Bloquear</button>' +
        '<button type="button" class="btn-ghost sm" data-batch="reset">Padrão</button></div>' +
        '<div id="access-matrix"></div></section>' +
        '<section class="card reveal" style="--d:2"><div class="side-title"><h2>Auditoria</h2>' + icon('history', 'sm') + '</div>' +
        '<p class="muted small">As últimas 100 alterações, com quem fez, o que mudou e o motivo.</p>' +
        '<div id="access-audit"></div></section>',
        'Acessos às trilhas'
      );

      document.getElementById('f-setor').addEventListener('change', function (e) { accessFilters.sector = e.target.value; paintAccessMatrix(); });
      document.getElementById('f-pessoa').addEventListener('input', function (e) { accessFilters.person = e.target.value.trim(); paintAccessMatrix(); paintAccessAudit(); });
      document.getElementById('f-trilha').addEventListener('input', function (e) { accessFilters.track = e.target.value.trim(); paintAccessMatrix(); });
      document.getElementById('f-changed').addEventListener('change', function (e) { accessFilters.changedOnly = e.target.checked; paintAccessMatrix(); });
      document.getElementById('f-export').addEventListener('click', exportAccessCsv);
      Array.prototype.forEach.call(document.querySelectorAll('[data-batch]'), function (btn) {
        btn.addEventListener('click', function () {
          var ids = Object.keys(accessSelection);
          var trackId = document.getElementById('batch-track').value;
          if (!ids.length || !trackId) return;
          var action = btn.dataset.batch;
          askReason('Alteração em lote', ids.length + ' pessoas · ' + action + ' na trilha selecionada.', 'Aplicar', function (reason) {
            var chain = Promise.resolve();
            ids.forEach(function (uid) {
              chain = chain.then(function () {
                return api('/api/accesses/user', { method: 'POST', body: { userId: uid, trackId: trackId, action: action, reason: reason } });
              });
            });
            chain.then(function () {
              toast({ icon: 'check', title: 'Alteração aplicada', text: ids.length + ' pessoas atualizadas.' });
              accessSelection = {};
              return reloadAccess();
            }).catch(function () {
              toast({ icon: 'alert', title: 'Alteração não aplicada', text: 'Tente novamente.', danger: true });
            });
          });
        });
      });

      paintAccessMatrix();
      paintAccessAudit();
      updateBatchBar();
      animateMeters(document.getElementById('app'));
    });
  }

  // ---------- Roteamento ----------
  function route() {
    var loading = me ? Promise.resolve(me) : api('/api/me').then(function (d) { return d.user; }).catch(function () { return null; });
    return loading.then(function (user) {
      me = user;
      updateTopbar();
      if (!me) return renderLogin();
      var parts = location.hash.replace(/^#/, '').split('?');
      var segments = parts[0].split('/').filter(Boolean);
      var query = new URLSearchParams(parts[1] || '');
      var page;
      if (segments[0] === 'acessos') page = renderAcessos();
      else if (segments[0] === 'trilha' && segments[1]) page = renderTrack(segments[1]);
      else if (segments[0] === 'aula' && segments[1]) page = renderLesson(segments[1]);
      else if (segments[0] === 'busca') page = renderSearch(query.get('q') || '');
      else page = renderHome();
      return page.then(function () { justLoggedIn = false; }).catch(function (err) {
        if (err.status === 401) {
          me = null;
          setToken(null);
          updateTopbar();
          if (justLoggedIn) {
            return renderLogin('O navegador não manteve a sua sessão. Tente abrir a Academia em uma nova aba, sem bloqueio de cookies de terceiros, e entre de novo.');
          }
          return renderLogin('Sua sessão expirou. Entre novamente.');
        }
        if (err.status === 404) return renderError('Este conteúdo não está disponível para o seu setor.');
        return renderError('Tente atualizar a página em alguns instantes.');
      });
    });
  }

  document.getElementById('logout').addEventListener('click', onLogout);
  document.querySelector('.skip').addEventListener('click', function (event) {
    event.preventDefault();
    app.focus();
  });
  document.getElementById('search-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var q = document.getElementById('search-input').value.trim();
    if (q.length >= 2) location.hash = '#/busca?q=' + encodeURIComponent(q);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var input = document.getElementById('search-input');
    if (input && !topbar.hidden) {
      event.preventDefault();
      input.focus();
    }
  });
  // Brilho que acompanha o cursor nos cartões (efeito "spot").
  document.addEventListener('pointermove', function (event) {
    var card = event.target.closest && event.target.closest('.spot');
    if (!card) return;
    var rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (event.clientY - rect.top) + 'px');
  });
  window.addEventListener('hashchange', route);
  route();
})();
