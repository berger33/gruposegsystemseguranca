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
  };
  var TRACK_ICON = {
    fundamentos: 'layers',
    'funcionario-ponto': 'clock',
    'cliente-portal': 'users',
    'rh-processos': 'briefcase',
    'comercial-funil': 'target',
    'financeiro-receber': 'chart',
    'operacao-escala': 'pin',
    'gestao-painel': 'grid',
    'ti-controle': 'shield',
  };

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
    el.className = 'toast';
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
      tiles.push('<div class="badge-tile locked"><span class="badge-medal">' + icon('lock', 'sm') + '</span><strong>A conquistar</strong><span>Continue as trilhas</span></div>');
    }
    if (!tiles.length) return '<p class="empty">Nenhum selo ainda. Conclua a primeira aula para começar.</p>';
    return '<div class="badge-grid">' + tiles.join('') + '</div>' +
      (available > 0 ? '<p class="badge-note">' + available + (available === 1 ? ' selo' : ' selos') + ' ainda ' + (available === 1 ? 'disponível' : 'disponíveis') + '.</p>' : '');
  }

  function trackCard(t, i) {
    var accent = accentFor(t.id);
    var status = t.complete ? '<span class="pill-ok">' + icon('check') + ' Concluída</span>' : '<span class="pct">' + t.percent + '%</span>';
    return '<a class="track-card card spot reveal" style="--d:' + i + ';--accent:' + accent + '" href="#/trilha/' + esc(t.id) + '">' +
      '<div class="track-top"><span class="track-ico">' + icon(TRACK_ICON[t.id] || 'book', 'lg') + '</span>' + status + '</div>' +
      '<h3>' + esc(t.title) + '</h3><p>' + esc(t.summary) + '</p>' +
      '<div class="bar"><span data-bar="' + t.percent + '"></span></div>' +
      '<div class="track-meta"><span>' + t.done + ' de ' + t.total + (t.total === 1 ? ' aula' : ' aulas') + '</span><span>' + icon('arrow', 'sm') + '</span></div></a>';
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

      html += '<div class="grid-home"><div>' +
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
        '<div class="ring-text"><strong>' + t.percent + '%</strong><span>' + t.done + ' de ' + t.total + '</span></div></div>' +
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
      if (segments[0] === 'trilha' && segments[1]) page = renderTrack(segments[1]);
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
