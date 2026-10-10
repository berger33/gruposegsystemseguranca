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
  var memoryResumeId = null;
  var memoryResumeUserId = null;
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
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
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
    applyTheme(currentTheme());
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
      var navAccess = document.getElementById('nav-acessos');
      if (navAccess) navAccess.hidden = !me.isManager;
      document.getElementById('sector-chip').textContent = me.sectorLabel;
      var avatar = document.getElementById('avatar');
      avatar.textContent = initials(me.name);
      avatar.style.background = 'linear-gradient(135deg,' + colorFor(me.name) + ',#172b68)';
      avatar.title = me.name;
      refreshNotifBell();
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
      '<button type="button" class="theme-toggle js-theme login-theme" aria-label="Alternar tema"></button>' +
      '<div class="login-head"><span class="brand-mark"><span>AS</span></span><h1 class="grad-text">Entrar na Academia</h1><p>Use o e-mail e a senha informados pelo seu gestor.</p></div>' +
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
  function resumeStorageKey() { return me ? 'academia-last-lesson:' + me.id : null; }
  function rememberLesson(id) {
    var key = resumeStorageKey();
    if (!key || !id) return;
    memoryResumeId = id;
    memoryResumeUserId = me.id;
    try { localStorage.setItem(key, id); } catch (e) {}
  }
  function clearRememberedLesson(id) {
    var key = resumeStorageKey();
    if (!key) return;
    var clearThis = !id || (memoryResumeUserId === me.id && memoryResumeId === id);
    if (clearThis) { memoryResumeId = null; memoryResumeUserId = null; }
    try {
      var stored = localStorage.getItem(key);
      if (!id || stored === id || clearThis) localStorage.removeItem(key);
    } catch (e) {}
  }
  function resolveResumeTarget(fallback) {
    var key = resumeStorageKey();
    if (!key) return Promise.resolve(fallback);
    var remembered = memoryResumeUserId === me.id ? memoryResumeId : null;
    try { if (!remembered) remembered = localStorage.getItem(key); } catch (e) {}
    if (!remembered || (fallback && remembered === fallback.id)) return Promise.resolve(fallback);
    return api('/api/lessons/' + encodeURIComponent(remembered)).then(function (lesson) {
      if (lesson.pending || lesson.done) {
        clearRememberedLesson(remembered);
        return fallback;
      }
      return { id: lesson.id, title: lesson.title, minutes: lesson.minutes, trackId: lesson.trackId, trackTitle: lesson.trackTitle, resumed: true };
    }).catch(function () {
      clearRememberedLesson(remembered);
      return fallback;
    });
  }

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
    var status = t.complete ? '<span class="pill-ok">' + icon('check') + ' Concluída</span>' : '<span class="pct">' + t.percent + '%</span>';
    return '<a class="track-card card spot reveal" style="--d:' + i + ';--accent:' + accent + '" href="#/trilha/' + esc(t.id) + '">' +
      '<div class="track-top"><span class="track-ico">' + icon(TRACK_ICON[t.id] || 'book', 'lg') + '</span>' + status + '</div>' +
      '<h3>' + esc(t.title) + '</h3><p>' + esc(t.summary) + '</p>' +
      '<div class="bar"><span data-bar="' + t.percent + '"></span></div>' +
      '<div class="track-meta"><span>' + t.done + ' de ' + t.total + (t.total === 1 ? ' aula' : ' aulas') +
      (t.pendingCount ? ' · ' + t.pendingCount + ' em construção' : '') + '</span><span>' + icon('arrow', 'sm') + '</span></div></a>';
  }

  function renderHome() {
    setPage(skeleton(), 'Início');
    return api('/api/home').then(function (d) {
      return resolveResumeTarget(d.next).then(function (resumeNext) {
      var lv = d.level;
      var pct = d.lessonsTotal ? Math.round((d.lessonsDone / d.lessonsTotal) * 100) : 0;
      var rank = d.leaderboard.me ? d.leaderboard.me.rank : null;
      var earnedCount = d.badges.earned.length;
      var next = resumeNext
        ? '<section class="card next-card spot reveal" style="--d:1;--accent:' + accentFor(resumeNext.trackId) + '">' +
          '<span class="next-ico">' + icon(TRACK_ICON[resumeNext.trackId] || 'book', 'lg') + '</span>' +
          '<div class="next-body"><span class="label">' + (resumeNext.resumed ? 'Retomar sua última aula' : 'Continue de onde parou') + '</span><h2>' + esc(resumeNext.title) + '</h2>' +
          '<p class="muted small">' + esc(resumeNext.trackTitle) + ' · ' + resumeNext.minutes + ' min</p></div>' +
          '<a class="btn-primary" href="#/aula/' + esc(resumeNext.id) + '">' + (resumeNext.resumed ? 'Retomar' : 'Continuar') + ' ' + icon('arrow', 'sm') + '</a></section>'
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
    });
  }

  // ---------- Trilha ----------
  function renderTrack(id) {
    setPage(skeleton(), 'Trilha');
    return api('/api/tracks/' + encodeURIComponent(id)).then(function (t) {
      var accent = accentFor(t.id);
      var items = t.lessons.map(function (l, i) {
        if (l.pending) {
          return '<div class="tl-item pending reveal" style="--d:' + i + '"><span class="tl-node">' + icon('lock', 'sm') + '</span>' +
            '<div class="tl-card card"><div><h3>' + esc(l.title) + '</h3><p class="muted small">' + esc(l.objective) + '</p></div>' +
            '<div class="tl-side"><span class="muted small">' + l.minutes + ' min</span><span class="status pending">Em construção</span></div></div></div>';
        }
        return '<a class="tl-item reveal ' + (l.done ? 'done' : '') + '" style="--d:' + i + '" href="#/aula/' + esc(l.id) + '">' +
          '<span class="tl-node">' + (l.done ? icon('check', 'sm') : i + 1) + '</span>' +
          '<div class="tl-card card spot"><div><h3>' + esc(l.title) + '</h3><p class="muted small">' + esc(l.objective) + '</p></div>' +
          '<div class="tl-side"><span class="muted small">' + l.minutes + ' min</span><span class="status ' + (l.done ? 'ok' : '') + '">' +
          (l.done ? 'Concluída' : 'Pendente') + '</span></div></div></a>';
      }).join('');
      var certificateCta = t.complete && t.total > 0
        ? '<section class="cert-cta card reveal" aria-labelledby="cert-cta-title"><div><span class="eyebrow">Conquista da trilha</span><h2 id="cert-cta-title">Sua jornada foi concluída</h2><p class="muted small">Emita um certificado digital com código único e QR de validação pública.</p></div><button class="btn-primary" type="button" data-certificate="' + esc(t.id) + '">Emitir certificado ' + icon('arrow', 'sm') + '</button></section>'
        : '';
      setPage(
        '<nav class="crumbs reveal" aria-label="Você está aqui"><a href="#/">Início</a><span>/</span><span>' + esc(t.title) + '</span></nav>' +
        '<section class="track-hero hero-card reveal" style="--accent:' + accent + '">' +
        '<div class="orb o1"></div><div class="grid-lines"></div>' +
        '<div class="track-hero-main"><span class="track-ico">' + icon(TRACK_ICON[t.id] || 'book', 'lg') + '</span>' +
        '<div><p class="eyebrow light">Trilha · ' + esc(t.sectorLabel) + '</p><h1 class="hero-title">' + esc(t.title) + '</h1>' +
        '<p class="hero-sub">' + esc(t.summary) + '</p></div></div>' +
        '<div class="ring-wrap sm"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52"/>' +
        '<circle class="ring-fg" data-ring="' + t.percent + '" cx="60" cy="60" r="52"/></svg>' +
        (t.total ? '<div class="ring-text"><strong>' + t.percent + '%</strong><span>' + t.done + ' de ' + t.total + '</span></div>' : '<div class="ring-text"><strong>Em</strong><span>construção</span></div>') + '</div>' +
        '</section>' + certificateCta +
        '<div class="timeline">' + items + '</div>',
        t.title
      );
    });
  }

  // ---------- Certificado digital e validação pública ----------
  var CERTIFICATE_OVERLAY_ID = 'certificate-overlay';
  var certificateReturnFocus = null;
  var certificateBackground = [];
  function certificateUrl(code) {
    var url = new URL(location.href);
    url.hash = '/validar-certificado?codigo=' + encodeURIComponent(code);
    return url.toString();
  }
  function workloadLabel(minutes) {
    var total = Math.max(0, Number(minutes) || 0);
    var hours = Math.floor(total / 60);
    var rest = total % 60;
    if (!hours) return total + (total === 1 ? ' minuto' : ' minutos');
    if (!rest) return hours + (hours === 1 ? ' hora' : ' horas');
    return hours + 'h ' + String(rest).padStart(2, '0') + 'min';
  }
  function formatCertificateDate(value) {
    try { return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }
  function makeQrSvg(url) {
    if (typeof window.qrcode !== 'function') return '';
    var qr = window.qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true, title: 'Validar certificado de conclusão', alt: 'QR code para consultar a validade deste certificado' });
  }
  function closeCertificate() {
    var overlay = document.getElementById(CERTIFICATE_OVERLAY_ID);
    if (overlay) overlay.remove();
    document.body.classList.remove('certificate-open', 'printing-certificate');
    certificateBackground.forEach(function (state) {
      if (state.inert) state.node.setAttribute('inert', '');
      else state.node.removeAttribute('inert');
      if (state.ariaHidden === null) state.node.removeAttribute('aria-hidden');
      else state.node.setAttribute('aria-hidden', state.ariaHidden);
    });
    certificateBackground = [];
    if (certificateReturnFocus && document.contains(certificateReturnFocus)) certificateReturnFocus.focus();
    certificateReturnFocus = null;
  }
  function showCertificate(cert) {
    closeCertificate();
    certificateReturnFocus = document.activeElement;
    var verifyUrl = certificateUrl(cert.code);
    var qrSvg = '';
    try { qrSvg = makeQrSvg(verifyUrl); } catch (e) { qrSvg = ''; }
    var overlay = document.createElement('div');
    overlay.className = 'cert-overlay';
    overlay.id = CERTIFICATE_OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'certificate-title');
    overlay.setAttribute('aria-describedby', 'certificate-description');
    overlay.innerHTML =
      '<div class="cert-actions"><p>Para salvar: escolha <strong>Salvar como PDF</strong> na janela de impressão.</p><div><button type="button" class="btn-ghost sm" id="cert-close">Fechar</button><button type="button" class="btn-primary sm" id="cert-print">Imprimir / salvar PDF ' + icon('arrow', 'sm') + '</button></div></div>' +
      '<article class="certificate-paper" id="certificate-paper">' +
        '<div class="certificate-border"><div class="certificate-inner">' +
          '<header class="certificate-brand"><img src="vendor/seg-system-logo.jpg" alt="Logo Grupo SEG System Segurança"><div><strong>GRUPO SEG SYSTEM</strong><span>SEGURANÇA INTEGRADA</span></div><span class="certificate-seal" aria-hidden="true">SGS</span></header>' +
          '<p class="certificate-kicker">ACADEMIA · DESENVOLVIMENTO PROFISSIONAL</p>' +
          '<h1 id="certificate-title">Certificado de conclusão</h1>' +
          '<p id="certificate-description" class="certificate-intro">Certificamos que</p>' +
          '<h2 class="certificate-name">' + esc(cert.recipientName) + '</h2>' +
          '<p class="certificate-copy">concluiu com êxito a trilha de aprendizagem</p>' +
          '<h3 class="certificate-track">' + esc(cert.trackTitle) + '</h3>' +
          '<p class="certificate-workload">Carga horária: <strong>' + esc(workloadLabel(cert.workloadMinutes)) + '</strong></p>' +
          (document.documentElement.dataset.demo === 'true' ? '<p class="certificate-demo-note">Demonstração: os registros ficam neste navegador. Para validar em qualquer dispositivo, a Academia precisa estar publicada com o servidor persistente.</p>' : '') +
          '<footer class="certificate-footer"><div class="certificate-signature"><span>Emitido digitalmente pela</span><strong>Grupo SEG System Segurança</strong><small>' + esc(formatCertificateDate(cert.issuedAt)) + '</small></div>' +
            '<div class="certificate-verify"><div class="certificate-qr" aria-label="QR code para validar este certificado">' + (qrSvg || '<span class="qr-unavailable">QR indisponível neste navegador</span>') + '</div><code>' + esc(cert.code) + '</code><a href="' + esc(verifyUrl) + '" target="_blank" rel="noopener noreferrer">Validar certificado</a></div></footer>' +
        '</div></div>' +
      '</article>';
    document.body.appendChild(overlay);
    document.body.classList.add('certificate-open');
    certificateBackground = Array.prototype.map.call(document.body.children, function (node) {
      return node === overlay ? null : { node: node, inert: Boolean(node.inert), ariaHidden: node.getAttribute('aria-hidden') };
    }).filter(Boolean);
    certificateBackground.forEach(function (state) {
      state.node.setAttribute('inert', '');
      state.node.setAttribute('aria-hidden', 'true');
    });
    overlay.querySelector('#cert-close').addEventListener('click', closeCertificate);
    overlay.querySelector('#cert-print').addEventListener('click', function () {
      document.body.classList.add('printing-certificate');
      window.addEventListener('afterprint', function () { document.body.classList.remove('printing-certificate'); }, { once: true });
      window.print();
    });
    overlay.addEventListener('click', function (event) { if (event.target === overlay) closeCertificate(); });
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeCertificate();
        return;
      }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      var focusable = Array.prototype.slice.call(overlay.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (node) { return !node.hidden && node.getClientRects().length > 0; });
      if (!focusable.length) { event.preventDefault(); overlay.focus(); return; }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      var outside = !overlay.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    });
    overlay.querySelector('#cert-close').focus();
  }
  function issueCertificate(trackId) {
    api('/api/certificates', { method: 'POST', body: { trackId: trackId } }).then(function (data) {
      if (!data.certificate) throw new Error('certificado_indisponivel');
      showCertificate(data.certificate);
    }).catch(function (err) {
      if (err.status === 409) toast({ icon: 'alert', title: 'Trilha ainda não concluída', text: 'Conclua todas as aulas publicadas antes de emitir o certificado.' });
      else if (err.status === 401) route();
      else toast({ icon: 'alert', title: 'Não foi possível emitir', text: 'Tente novamente em alguns instantes.' });
    });
  }
  function renderCertificateValidation(code) {
    var normalized = String(code || '').trim().toUpperCase();
    if (!/^SGS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(normalized)) {
      setPage('<section class="validation-card card" role="status"><span class="validation-mark invalid">' + icon('x') + '</span><p class="eyebrow">Validação pública</p><h1>Certificado não encontrado</h1><p class="muted">Confira o código impresso no certificado ou leia novamente o QR code.</p><a class="btn-ghost" href="#/">Voltar à Academia</a></section>', 'Validar certificado');
      return Promise.resolve();
    }
    setPage('<section class="validation-card card" aria-live="polite"><p class="eyebrow">Validação pública</p><h1>Consultando certificado…</h1><p class="muted">Aguarde enquanto verificamos o código.</p></section>', 'Validar certificado');
    return api('/api/certificates/' + encodeURIComponent(normalized)).then(function (data) {
      var cert = data.certificate;
      setPage('<section class="validation-card card" role="status"><img class="validation-logo" src="vendor/seg-system-logo.jpg" alt="Grupo SEG System Segurança"><span class="validation-mark valid">' + icon('check') + '</span><p class="eyebrow">Validação pública · ' + esc(cert.code) + '</p><h1>Certificado válido</h1><p class="validation-name">' + esc(cert.recipientName) + '</p><p class="validation-copy">concluiu a trilha</p><h2>' + esc(cert.trackTitle) + '</h2><div class="validation-meta"><span><strong>Carga horária</strong>' + esc(workloadLabel(cert.workloadMinutes)) + '</span><span><strong>Emitido em</strong>' + esc(formatCertificateDate(cert.issuedAt)) + '</span></div><p class="validation-note">Este registro foi localizado na base de certificados da Academia Seg System Segurança.</p>' + (document.documentElement.dataset.demo === 'true' ? '<p class="validation-note">Esta é uma demonstração: a validação global depende da publicação com servidor persistente.</p>' : '') + '<a class="btn-ghost" href="#/">Voltar à Academia</a></section>', 'Certificado válido');
    }).catch(function (err) {
      if (err.status === 404) {
        setPage('<section class="validation-card card" role="alert"><span class="validation-mark invalid">' + icon('x') + '</span><p class="eyebrow">Validação pública · ' + esc(normalized) + '</p><h1>Certificado não encontrado</h1><p class="muted">Este código não consta na base de certificados. Verifique se foi digitado corretamente.</p><a class="btn-ghost" href="#/">Voltar à Academia</a></section>', 'Certificado não encontrado');
        return;
      }
      renderError('Não foi possível consultar o certificado agora. Tente novamente em instantes.');
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
      if (l.pending) return renderPendingLesson(l);
      if (l.done) clearRememberedLesson(l.id); else rememberLesson(l.id);
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
          if (res.nextLessonId) rememberLesson(res.nextLessonId); else clearRememberedLesson(lessonId);
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

  // ---------- Aula em construção ----------
  function renderPendingLesson(l) {
    setPage(
      '<nav class="crumbs reveal" aria-label="Você está aqui"><a href="#/">Início</a><span>/</span><a href="#/trilha/' + esc(l.trackId) + '">' +
      esc(l.trackTitle) + '</a><span>/</span><span>Aula ' + l.position + ' de ' + l.total + '</span></nav>' +
      '<div class="lesson-layout"><section class="lesson-main">' +
      '<header class="lesson-head reveal"><p class="eyebrow">' + esc(l.trackTitle) + '</p><h1>' + esc(l.title) + '</h1>' +
      '<div class="lesson-meta"><span>' + icon('clock', 'sm') + ' ' + l.minutes + ' min</span><span>Aula ' + l.position + ' de ' + l.total + '</span>' +
      '<span class="status pending">Em construção</span>' + (l.rotulo && l.rotulo !== 'Em construção' ? '<span class="pill-soon dark">' + esc(l.rotulo) + '</span>' : '') + '</div></header>' +
      '<div class="callout reveal" style="--d:1"><span class="callout-ico">' + icon('target') + '</span><div><strong>Objetivo</strong><p>' + esc(l.objective) + '</p></div></div>' +
      '</section>' +
      '<aside class="card quiz-card reveal" style="--d:2"><p class="eyebrow">Em construção</p><h2>Esta aula ainda não foi publicada</h2>' +
      '<p class="muted small">O conteúdo e a verificação de aprendizagem serão liberados depois de validados pela área responsável. Enquanto isso, ela não entra no seu progresso.</p>' +
      '<p style="margin-top:16px"><a class="btn-ghost" href="#/trilha/' + esc(l.trackId) + '">Voltar à trilha</a></p></aside></div>',
      l.title
    );
  }

  // ---------- Acessos às trilhas (gestão) ----------
  var SOURCE_TEXT = { gestao: 'Gestão total', padrao: 'Padrão do setor', liberada: 'Liberada', bloqueada: 'Bloqueada', nenhum: 'Sem acesso' };
  var ACTION_TEXT = { liberar: 'Liberou a trilha', bloquear: 'Bloqueou a trilha', padrao: 'Voltou ao padrão', 'padrao-setor': 'Alterou o público da trilha' };
  var ERROR_TEXT = {
    motivo_obrigatorio: 'Informe um motivo com pelo menos 5 caracteres.',
    perfil_de_gestao: 'Admin e Marcelo sempre veem todas as trilhas e não podem ser restringidos.',
    sem_permissao: 'Sua conta não pode alterar acessos.',
    setor_invalido: 'Um dos setores escolhidos não existe.',
    setores_invalidos: 'Escolha pelo menos um público para a trilha.',
  };
  var ACCESS = { data: null, tab: 'trilha', trackId: null, personId: null, motivo: '', busca: '', msg: '' };

  function accessError(err) {
    if (err.status === 401) return route();
    ACCESS.msg = ERROR_TEXT[err.message] || 'Não foi possível salvar agora. Tente novamente.';
    drawAccess();
    var motive = document.getElementById('a-motivo');
    if (motive && err.message === 'motivo_obrigatorio') motive.focus();
  }

  function renderAccess() {
    setPage(skeleton(), 'Acessos às trilhas');
    return api('/api/acessos').then(function (data) {
      ACCESS.data = data;
      if (!ACCESS.trackId || !data.tracks.some(function (t) { return t.id === ACCESS.trackId; })) ACCESS.trackId = data.tracks[0].id;
      if (!ACCESS.personId || !data.people.some(function (p) { return p.id === ACCESS.personId; })) ACCESS.personId = data.people[0].id;
      drawAccess();
    });
  }

  function reloadAccess() {
    return api('/api/acessos').then(function (data) {
      ACCESS.data = data;
      ACCESS.msg = '';
      drawAccess();
    });
  }

  function drawAccess() {
    var tabs = '<div class="seg-tabs" role="tablist" aria-label="Forma de gestão">' +
      accessTab('trilha', 'Por trilha', 'layers') + accessTab('pessoa', 'Por pessoa', 'users') + '</div>';
    var body = ACCESS.tab === 'trilha' ? trackAccessHtml() : personAccessHtml();
    var motive = '<div class="motive-bar"><label for="a-motivo"><strong>Motivo da alteração</strong>' +
      '<span class="muted small"> · obrigatório, com pelo menos 5 caracteres · fica registrado</span></label>' +
      '<input id="a-motivo" type="text" maxlength="240" value="' + esc(ACCESS.motivo) + '" placeholder="Ex.: novo posto de portaria, revisão do setor"></div>';
    setPage(
      '<nav class="crumbs reveal" aria-label="Você está aqui"><a href="#/">Início</a><span>/</span><span>Acessos às trilhas</span></nav>' +
      '<section class="hero-card reveal"><div class="orb o1"></div><div class="orb o2"></div><div class="grid-lines"></div>' +
      '<div class="hero-main"><p class="eyebrow light">Gestão da Academia</p><h1 class="hero-title">Acessos às trilhas</h1>' +
      '<p class="hero-sub">O acesso de cada pessoa é o padrão do setor, somado às liberações e menos os bloqueios individuais. Toda alteração pede um motivo e fica no registro.</p></div></section>' +
      tabs + motive +
      '<div class="alert-line" id="a-msg" role="status" aria-live="polite">' + (ACCESS.msg ? '<span>' + esc(ACCESS.msg) + '</span>' : '') + '</div>' +
      body + logHtml(),
      'Acessos às trilhas'
    );
  }

  function accessTab(id, label, ico) {
    var on = ACCESS.tab === id;
    return '<button type="button" class="seg-tab' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-access="tab" data-tab="' + id + '">' +
      icon(ico, 'sm') + '<span>' + label + '</span></button>';
  }

  function trackAccessHtml() {
    var d = ACCESS.data;
    var sel = d.tracks.filter(function (t) { return t.id === ACCESS.trackId; })[0] || d.tracks[0];
    var groups = [];
    var byGroup = {};
    d.tracks.forEach(function (t) {
      if (!byGroup[t.group]) { byGroup[t.group] = []; groups.push(t.group); }
      byGroup[t.group].push(t);
    });
    var picker = groups.map(function (g) {
      return '<div class="pick-group"><h3>' + esc(g) + '</h3>' + byGroup[g].map(function (t) {
        var on = t.id === sel.id;
        var meta = t.published + (t.published === 1 ? ' aula publicada' : ' aulas publicadas') +
          (t.pending ? ' · ' + t.pending + ' em construção' : '') + (t.customDefault ? ' · público ajustado' : '');
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-access="track" data-track="' + esc(t.id) + '" aria-pressed="' + on + '">' +
          '<span class="pick-title">' + esc(t.title) + '</span><span class="pick-meta">' + esc(meta) + '</span></button>';
      }).join('') + '</div>';
    }).join('');

    var audiences = sel.audiences || [];
    var allOn = audiences.indexOf('todos') >= 0;
    var options = [{ id: 'todos', label: 'Todos os setores' }].concat(d.sectors);
    var checks = options.map(function (s) {
      var checked = allOn ? s.id === 'todos' : audiences.indexOf(s.id) >= 0;
      var disabled = allOn && s.id !== 'todos';
      return '<label class="sector-check' + (checked ? ' on' : '') + '"><input type="checkbox" value="' + esc(s.id) + '" data-sector-check' +
        (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span>' + esc(s.label) + '</span></label>';
    }).join('');

    return '<div class="access-layout">' +
      '<aside class="card pick-panel reveal" aria-label="Trilhas"><p class="eyebrow">Trilhas</p>' + picker + '</aside>' +
      '<section class="card access-editor reveal" style="--d:1"><p class="eyebrow">Quem vê esta trilha</p>' +
      '<h2>' + esc(sel.title) + '</h2><p class="muted small">' + esc(sel.group) + ' · ' + sel.published + ' publicadas' +
      (sel.pending ? ' · ' + sel.pending + ' em construção' : '') + '</p>' +
      '<div class="sector-grid">' + checks + '</div>' +
      '<div class="ae-actions"><button type="button" class="btn-primary" data-access="save-default" data-track="' + esc(sel.id) + '">Salvar público' + ' ' + icon('check', 'sm') + '</button>' +
      '<button type="button" class="btn-ghost" data-access="reset-default" data-track="' + esc(sel.id) + '">Restaurar padrão original</button></div>' +
      '<p class="muted small ae-note">Mudar o público da trilha vale para todo o setor. Para uma pessoa específica, use a aba “Por pessoa”. Admin e Marcelo veem todas as trilhas.</p>' +
      '</section></div>';
  }

  function personAccessHtml() {
    var d = ACCESS.data;
    var q = ACCESS.busca.trim().toLowerCase();
    var people = d.people.filter(function (p) {
      return !q || (p.name + ' ' + p.sectorLabel + ' ' + p.email).toLowerCase().indexOf(q) >= 0;
    });
    var sel = d.people.filter(function (p) { return p.id === ACCESS.personId; })[0] || d.people[0];
    var list = people.length ? people.map(function (p) {
      var on = p.id === sel.id;
      return '<button type="button" class="person-pick' + (on ? ' on' : '') + '" data-access="person" data-person="' + esc(p.id) + '" aria-pressed="' + on + '">' +
        '<span class="avatar sm" style="background:linear-gradient(135deg,' + colorFor(p.name) + ',#172b68)">' + esc(initials(p.name)) + '</span>' +
        '<span class="pp-text"><strong>' + esc(p.name) + '</strong><small>' + esc(p.sectorLabel) + (p.fullAccess ? ' · gestão total' : '') + '</small></span></button>';
    }).join('') : '<p class="empty">Nenhuma pessoa encontrada.</p>';

    function grantBtn(person, track, acao, label, current) {
      return '<button type="button" class="seg' + (current ? ' on' : '') + '" data-access="grant" data-person="' + esc(person.id) +
        '" data-track="' + esc(track.id) + '" data-acao="' + acao + '" aria-pressed="' + current + '"' + (person.fullAccess ? ' disabled' : '') + '>' + label + '</button>';
    }
    var rows = d.tracks.map(function (t) {
      var src = sel.access[t.id] || 'nenhum';
      return '<div class="grant-row ' + src + '"><div class="gr-text"><strong>' + esc(t.title) + '</strong><small>' + esc(t.group) + '</small></div>' +
        '<span class="src-pill ' + src + '">' + esc(SOURCE_TEXT[src] || src) + '</span>' +
        '<div class="seg-group" role="group" aria-label="Acesso à trilha ' + esc(t.title) + '">' +
        grantBtn(sel, t, 'padrao', 'Padrão', src === 'padrao' || src === 'nenhum' || src === 'gestao') +
        grantBtn(sel, t, 'liberar', 'Liberar', src === 'liberada') +
        grantBtn(sel, t, 'bloquear', 'Bloquear', src === 'bloqueada') + '</div></div>';
    }).join('');

    return '<div class="access-layout">' +
      '<aside class="card pick-panel reveal" aria-label="Pessoas"><p class="eyebrow">Pessoas</p>' +
      '<input type="search" id="a-busca" class="search-field" placeholder="Buscar pessoa ou setor" value="' + esc(ACCESS.busca) + '" aria-label="Buscar pessoa">' +
      '<div class="people-list">' + list + '</div></aside>' +
      '<section class="card access-editor reveal" style="--d:1"><p class="eyebrow">Trilhas desta pessoa</p>' +
      '<div class="person-head"><span class="avatar" style="background:linear-gradient(135deg,' + colorFor(sel.name) + ',#172b68)">' + esc(initials(sel.name)) + '</span>' +
      '<div><h2>' + esc(sel.name) + '</h2><p class="muted small">' + esc(sel.sectorLabel) + ' · ' + esc(sel.email) + '</p></div></div>' +
      (sel.fullAccess ? '<div class="callout" style="margin-top:14px"><span class="callout-ico">' + icon('shield') + '</span><div><strong>Perfil de gestão</strong><p>Vê todas as trilhas e não pode ser restringido.</p></div></div>' : '') +
      '<div class="grant-list">' + rows + '</div>' +
      '<p class="muted small ae-note">Padrão: segue o público do setor. Liberar: adiciona a trilha, mesmo fora do setor. Bloquear: retira a trilha, mesmo dentro do setor.</p>' +
      '</section></div>';
  }

  function logHtml() {
    var log = ACCESS.data.log || [];
    var names = {};
    ACCESS.data.sectors.forEach(function (s) { names[s.id] = s.label; });
    names.todos = 'Todos os setores';
    function mapped(acao, text) {
      if (acao === 'padrao-setor') return String(text).split(', ').map(function (x) { return names[x] || x; }).join(', ');
      return SOURCE_TEXT[text] || text;
    }
    if (!log.length) return '<section class="card log-card reveal"><h2>Registro de alterações</h2><p class="empty">Nenhuma alteração registrada ainda.</p></section>';
    var rows = log.slice(0, 12).map(function (e) {
      return '<li><span class="log-when">' + esc(fmtDate(e.at)) + '</span><div><strong>' + esc(ACTION_TEXT[e.acao] || e.acao) + '</strong> · ' +
        esc(e.trackTitle) + (e.pessoaNome ? ' · ' + esc(e.pessoaNome) : '') +
        '<p class="muted small">' + esc(e.porNome) + ' · ' + esc(e.motivo) + '</p>' +
        '<p class="muted small">' + esc(mapped(e.acao, e.antes)) + ' → ' + esc(mapped(e.acao, e.depois)) + '</p></div></li>';
    }).join('');
    return '<section class="card log-card reveal"><h2>Registro de alterações</h2><ol class="log-list">' + rows + '</ol></section>';
  }

  function fmtDate(text) {
    var date = new Date(text);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function motiveOk() {
    if (ACCESS.motivo.trim().length >= 5) return true;
    ACCESS.msg = ERROR_TEXT.motivo_obrigatorio;
    drawAccess();
    document.getElementById('a-motivo').focus();
    return false;
  }

  function setGrant(personId, trackId, acao) {
    if (!motiveOk()) return;
    api('/api/acessos/alterar', { method: 'POST', body: { userId: personId, trackId: trackId, acao: acao, motivo: ACCESS.motivo.trim() } })
      .then(function () {
        toast({ icon: 'check', title: 'Acesso atualizado', text: 'A alteração foi registrada.' });
        ACCESS.motivo = '';
        return reloadAccess();
      })
      .catch(accessError);
  }

  function saveTrackDefault(trackId) {
    if (!motiveOk()) return;
    var boxes = app.querySelectorAll('input[data-sector-check]:checked');
    var setores = Array.prototype.map.call(boxes, function (el) { return el.value; });
    api('/api/acessos/padrao', { method: 'POST', body: { trackId: trackId, setores: setores, motivo: ACCESS.motivo.trim() } })
      .then(function () {
        toast({ icon: 'check', title: 'Público da trilha atualizado', text: 'Vale para todo o setor e fica registrado.' });
        ACCESS.motivo = '';
        return reloadAccess();
      })
      .catch(accessError);
  }

  function resetTrackDefault(trackId) {
    if (!motiveOk()) return;
    api('/api/acessos/padrao', { method: 'POST', body: { trackId: trackId, setores: null, motivo: ACCESS.motivo.trim() } })
      .then(function () {
        toast({ icon: 'refresh', title: 'Padrão original restaurado' });
        ACCESS.motivo = '';
        return reloadAccess();
      })
      .catch(accessError);
  }

  function onAppClick(event) {
    var certificateButton = event.target.closest && event.target.closest('[data-certificate]');
    if (certificateButton && !certificateButton.disabled) {
      issueCertificate(certificateButton.getAttribute('data-certificate'));
      return;
    }
    var el = event.target.closest && event.target.closest('[data-access]');
    if (!el || el.disabled) return;
    var kind = el.getAttribute('data-access');
    if (kind === 'tab') { ACCESS.tab = el.getAttribute('data-tab'); ACCESS.msg = ''; drawAccess(); }
    else if (kind === 'track') { ACCESS.trackId = el.getAttribute('data-track'); ACCESS.msg = ''; drawAccess(); }
    else if (kind === 'person') { ACCESS.personId = el.getAttribute('data-person'); ACCESS.msg = ''; drawAccess(); }
    else if (kind === 'grant') setGrant(el.getAttribute('data-person'), el.getAttribute('data-track'), el.getAttribute('data-acao'));
    else if (kind === 'save-default') saveTrackDefault(el.getAttribute('data-track'));
    else if (kind === 'reset-default') resetTrackDefault(el.getAttribute('data-track'));
  }

  function onAppInput(event) {
    var target = event.target;
    if (target.id === 'a-motivo') { ACCESS.motivo = target.value; return; }
    if (target.id === 'a-busca') {
      var pos = target.selectionStart;
      ACCESS.busca = target.value;
      drawAccess();
      var box = document.getElementById('a-busca');
      box.focus();
      box.setSelectionRange(pos, pos);
    }
  }

  function onAppChange(event) {
    var target = event.target;
    if (!target.hasAttribute || !target.hasAttribute('data-sector-check')) return;
    if (target.value !== 'todos') return;
    Array.prototype.forEach.call(app.querySelectorAll('input[data-sector-check]'), function (box) {
      if (box.value === 'todos') return;
      box.disabled = target.checked;
      if (target.checked) box.checked = false;
      box.parentNode.classList.toggle('on', box.checked);
    });
    target.parentNode.classList.toggle('on', target.checked);
  }

  // ---------- Roteamento ----------
  function route() {
    var parts = location.hash.replace(/^#/, '').split('?');
    var segments = parts[0].split('/').filter(Boolean);
    var query = new URLSearchParams(parts[1] || '');
    if (segments[0] === 'validar-certificado') {
      if (document.getElementById(CERTIFICATE_OVERLAY_ID)) closeCertificate();
      return renderCertificateValidation(query.get('codigo') || '');
    }
    var loading = me ? Promise.resolve(me) : api('/api/me').then(function (d) { return d.user; }).catch(function () { return null; });
    return loading.then(function (user) {
      me = user;
      updateTopbar();
      if (!me) return renderLogin();
      var page;
      if (segments[0] === 'trilha' && segments[1]) page = renderTrack(segments[1]);
      else if (segments[0] === 'aula' && segments[1]) page = renderLesson(segments[1]);
      else if (segments[0] === 'busca') page = renderSearch(query.get('q') || '');
      else if (segments[0] === 'acessos') page = me.isManager ? renderAccess() : renderHome();
      else page = renderHome();
      return page.then(function () { if (justLoggedIn) startTour(); justLoggedIn = false; }).catch(function (err) {
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
    hideSearchPop();
    var q = document.getElementById('search-input').value.trim();
    if (q.length >= 2) location.hash = '#/busca?q=' + encodeURIComponent(q);
  });
  document.getElementById('search-input').addEventListener('input', onSearchInput);
  document.getElementById('search-input').addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { hideSearchPop(); return; }
    if (event.key === 'ArrowDown' && setSearchActive(1)) event.preventDefault();
    else if (event.key === 'ArrowUp' && setSearchActive(-1)) event.preventDefault();
    else if (event.key === 'Enter') {
      var pop = document.getElementById('search-pop');
      var active = pop && !pop.hidden ? pop.querySelector('[role="option"][aria-selected="true"]') : null;
      if (active) { event.preventDefault(); active.click(); }
    }
  });
  document.getElementById('search-input').addEventListener('blur', function () { setTimeout(hideSearchPop, 160); });
  document.addEventListener('keydown', function (event) {
    var certDialog = document.getElementById(CERTIFICATE_OVERLAY_ID);
    var tourDialog = document.getElementById('tour-card');
    var dialog = certDialog || tourDialog;
    if (event.key === 'Escape') {
      if (certDialog) { event.preventDefault(); closeCertificate(); return; }
      if (tourDialog) { event.preventDefault(); endTour(); return; }
      var notificationPanel = document.getElementById('notif-pop');
      if (notificationPanel && !notificationPanel.hidden) {
        notificationPanel.hidden = true;
        document.getElementById('notif-toggle').setAttribute('aria-expanded', 'false');
        document.getElementById('notif-toggle').focus();
        return;
      }
      hideSearchPop();
    }
    if (dialog && event.key === 'Tab') {
      var focusables = Array.prototype.slice.call(dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'));
      if (focusables.length) {
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
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
  // ---------- Tema claro/escuro ----------
  var THEME_KEY = 'academia-tema';
  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var isLight = theme === 'light';
    Array.prototype.forEach.call(document.querySelectorAll('.js-theme'), function (btn) {
      btn.innerHTML = icon(isLight ? 'moon' : 'sun', 'sm');
      btn.setAttribute('aria-label', isLight ? 'Ativar modo escuro' : 'Ativar modo claro');
      btn.title = isLight ? 'Modo claro ativo' : 'Modo escuro ativo';
    });
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  }

  // ---------- Busca instantânea ----------
  var searchTimer = null;
  function hideSearchPop() {
    var p = document.getElementById('search-pop'); if (p) p.hidden = true;
    var input = document.getElementById('search-input');
    if (input) { input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  }
  function setSearchActive(delta) {
    var input = document.getElementById('search-input');
    var pop = document.getElementById('search-pop');
    if (!input || !pop || pop.hidden) return false;
    var options = Array.prototype.slice.call(pop.querySelectorAll('[role="option"]'));
    if (!options.length) return false;
    var current = options.findIndex(function (option) { return option.getAttribute('aria-selected') === 'true'; });
    var index = current < 0 ? (delta > 0 ? 0 : options.length - 1) : (current + delta + options.length) % options.length;
    options.forEach(function (option, i) {
      var active = i === index;
      option.setAttribute('aria-selected', active ? 'true' : 'false');
      option.classList.toggle('hl', active);
    });
    input.setAttribute('aria-activedescendant', options[index].id);
    options[index].scrollIntoView({ block: 'nearest' });
    return true;
  }
  function onSearchInput() {
    var input = document.getElementById('search-input');
    var pop = document.getElementById('search-pop');
    clearTimeout(searchTimer);
    var q = input.value.trim();
    if (q.length < 2) { hideSearchPop(); return; }
    searchTimer = setTimeout(function () {
      api('/api/search?q=' + encodeURIComponent(q)).then(function (data) {
        if (input.value.trim() !== q) return;
        var items = data.results.slice(0, 6);
        var html = items.length ? items.map(function (r, index) {
          return '<a role="option" aria-selected="false" id="search-option-' + index + '" href="#/aula/' + esc(r.id) + '"><span class="sp-ico">' + icon('book') + '</span><div><strong>' + esc(r.title) + '</strong><small>' + esc(r.trackTitle) + ' · ' + r.minutes + ' min</small></div></a>';
        }).join('') : '<div class="sp-empty" role="status">Nada encontrado no seu setor para “' + esc(q) + '”.</div>';
        html += '<a role="option" aria-selected="false" id="search-option-' + items.length + '" class="sp-foot" href="#/busca?q=' + encodeURIComponent(q) + '">Ver todos os resultados</a>';
        pop.innerHTML = html;
        pop.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        input.removeAttribute('aria-activedescendant');
      }).catch(function () { hideSearchPop(); });
    }, 200);
  }

  // ---------- Central de notificações ----------
  function notifFromLog(e) {
    var when = '';
    try { when = new Date(e.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (err) {}
    if (e.acao === 'padrao-setor') return { type: '', ico: 'users', title: 'Público da trilha alterado', text: e.porNome + ' alterou o público de “' + e.trackTitle + '”.', time: when };
    var verb = e.acao === 'liberar' ? 'liberou' : e.acao === 'bloquear' ? 'bloqueou' : 'restaurou o padrão de';
    return { type: e.acao === 'bloquear' ? 'warn' : 'ok', ico: e.acao === 'bloquear' ? 'lock' : 'check', title: 'Trilha ' + verb, text: e.porNome + ' ' + verb + ' “' + e.trackTitle + '” para ' + e.pessoaNome + '.', time: when };
  }
  function loadNotif() {
    var items = [{ type: '', ico: 'sparkles', title: 'Bem-vindo(a) à Academia', text: 'Trilhas por setor com progresso, selos e ranking.' }];
    var ps = [api('/api/home').then(function (d) {
      (d.badges.earned || []).forEach(function (b) { items.push({ type: 'ok', ico: 'star', title: 'Selo conquistado: ' + b.title, text: b.detail || '' }); });
    }).catch(function () {})];
    if (me && me.isManager) ps.push(api('/api/acessos').then(function (d) {
      (d.log || []).slice(0, 8).forEach(function (e) { items.push(notifFromLog(e)); });
    }).catch(function () {}));
    return Promise.all(ps).then(function () { return items; });
  }
  function openNotif() {
    var pop = document.getElementById('notif-pop');
    var button = document.getElementById('notif-toggle');
    if (!pop.hidden) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); return; }
    button.setAttribute('aria-expanded', 'true');
    pop.innerHTML = '<div class="notif-head"><h3 id="notif-title">Notificações</h3></div><div class="notif-list"><div class="notif-item"><span class="n-ico">' + icon('clock', 'sm') + '</span><p>Carregando…</p></div></div>';
    pop.hidden = false;
    loadNotif().then(function (items) {
      var html = items.map(function (n) {
        return '<div class="notif-item ' + n.type + '"><span class="n-ico">' + icon(n.ico, 'sm') + '</span><div><strong>' + esc(n.title) + '</strong><p>' + esc(n.text) + '</p>' + (n.time ? '<time>' + esc(n.time) + '</time>' : '') + '</div></div>';
      }).join('');
      if (pop.hidden) return;
      pop.querySelector('.notif-list').innerHTML = html || '<div class="notif-item"><p>Sem notificações.</p></div>';
      pop.focus();
    });
  }
  function refreshNotifBell() {
    var b = document.getElementById('notif-toggle');
    if (!b) return;
    b.innerHTML = icon('bell', 'sm');
    if (me && me.isManager) {
      api('/api/acessos').then(function (d) {
        var n = (d.log || []).length;
        b.innerHTML = icon('bell', 'sm') + (n ? '<span class="notif-count">' + (n > 9 ? '9+' : n) + '</span>' : '');
      }).catch(function () {});
    }
  }

  // ---------- Tour de boas-vindas ----------
  var TOUR_KEY = 'academia-tour-v1';
  var tourSteps = [
    { sel: '#search-input', t: 'Busque sem sair da página', d: 'Digite para ver resultados instantâneos das aulas do seu setor.' },
    { sel: '#notif-toggle', t: 'Central de notificações', d: 'Acompanhe conquistas e, para gestores, as alterações de acesso.' },
    { sel: '#theme-toggle', t: 'Tema claro ou escuro', d: 'Alterne quando quiser; a escolha fica salva neste navegador.' },
    { sel: '.track-card', t: 'Suas trilhas', d: 'Cada cartão é uma trilha do seu setor, com progresso e aulas.' },
    { sel: '.ring-wrap', t: 'Seu progresso', d: 'O anel mostra quanto da sua jornada você já concluiu.' },
  ];
  var tourIndex = 0;
  function clearTourDom() {
    ['tour-overlay', 'tour-card'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); });
    var s = document.querySelector('.tour-spot'); if (s) s.remove();
  }
  function endTour() { clearTourDom(); try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {} app.focus({ preventScroll: true }); }
  function positionTourCard(card, spot) {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (spot) {
      var r = spot.getBoundingClientRect();
      var top = r.bottom + 14, left = Math.min(Math.max(16, r.left), vw - 356);
      if (top + 200 > vh) top = Math.max(16, r.top - 210);
      card.style.top = top + 'px'; card.style.left = Math.max(16, left) + 'px';
    } else { card.style.top = '50%'; card.style.left = '50%'; card.style.transform = 'translate(-50%,-50%)'; }
  }
  function renderTour() {
    clearTourDom();
    while (tourIndex < tourSteps.length && !document.querySelector(tourSteps[tourIndex].sel)) tourIndex++;
    if (tourIndex >= tourSteps.length) return endTour();
    var step = tourSteps[tourIndex];
    var target = document.querySelector(step.sel);
    var overlay = document.createElement('div'); overlay.className = 'tour-overlay'; overlay.id = 'tour-overlay'; overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    var spot = null;
    var r = target.getBoundingClientRect();
    spot = document.createElement('div'); spot.className = 'tour-spot';
    spot.style.left = (r.left - 6) + 'px'; spot.style.top = (r.top - 6) + 'px';
    spot.style.width = (r.width + 12) + 'px'; spot.style.height = (r.height + 12) + 'px';
    document.body.appendChild(spot);
    var card = document.createElement('div'); card.className = 'tour-card'; card.id = 'tour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tour-title'); card.setAttribute('aria-describedby', 'tour-description');
    card.innerHTML = '<span class="t-step">Passo ' + (tourIndex + 1) + ' de ' + tourSteps.length + '</span><h3 id="tour-title">' + esc(step.t) + '</h3><p id="tour-description">' + esc(step.d) + '</p>' +
      '<div class="tour-actions"><button class="btn-ghost sm" id="tour-skip" type="button">Pular</button><button class="btn-primary sm" id="tour-next" type="button">' + (tourIndex === tourSteps.length - 1 ? 'Concluir' : 'Próximo') + '</button></div>';
    document.body.appendChild(card);
    positionTourCard(card, spot);
    document.getElementById('tour-skip').addEventListener('click', endTour);
    document.getElementById('tour-next').addEventListener('click', function () { tourIndex++; renderTour(); });
    document.getElementById('tour-next').focus();
  }
  function startTour() { try { if (localStorage.getItem(TOUR_KEY)) return; } catch (e) { return; } tourIndex = 0; setTimeout(renderTour, 500); }

  // ---------- Fundo de partículas (constelação) ----------
  function initParticles() {
    var canvas = document.getElementById('fx-canvas');
    if (!canvas) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var parts = [];
    var W = 0, H = 0;
    var COLORS = ['110,160,255', '139,92,246', '34,211,238'];
    function resize() {
      W = canvas.width = Math.floor(window.innerWidth * dpr);
      H = canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      var n = Math.min(70, Math.floor((window.innerWidth * window.innerHeight) / 26000));
      parts = [];
      for (var i = 0; i < n; i++) {
        parts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.14 * dpr, vy: (Math.random() - 0.5) * 0.14 * dpr,
          r: (Math.random() * 1.6 + 0.6) * dpr,
          c: COLORS[i % COLORS.length], a: Math.random() * 0.5 + 0.2,
        });
      }
    }
    function tick() {
      ctx.clearRect(0, 0, W, H);
      var link = 120 * dpr;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.c + ',' + p.a + ')';
        ctx.fill();
        for (var j = i + 1; j < parts.length; j++) {
          var q = parts[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < link) {
            ctx.strokeStyle = 'rgba(' + p.c + ',' + (0.14 * (1 - d / link)) + ')';
            ctx.lineWidth = dpr * 0.6;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      requestAnimationFrame(tick);
    }
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(tick);
  }

  app.addEventListener('click', onAppClick);
  app.addEventListener('input', onAppInput);
  app.addEventListener('change', onAppChange);
  document.addEventListener('click', function (event) {
    var t = event.target.closest && event.target.closest('.js-theme');
    if (t) { event.preventDefault(); toggleTheme(); return; }
    var notif = document.getElementById('notif-pop');
    if (notif && !notif.hidden && !event.target.closest('.notif-wrap')) {
      notif.hidden = true;
      document.getElementById('notif-toggle').setAttribute('aria-expanded', 'false');
    }
    var sp = document.getElementById('search-pop');
    if (sp && !sp.hidden && !event.target.closest('.search')) hideSearchPop();
  });
  document.getElementById('notif-toggle').addEventListener('click', function (event) {
    event.stopPropagation();
    openNotif();
  });
  window.addEventListener('hashchange', function () { hideSearchPop(); route(); });

  // Tema automático: usa a preferência do sistema quando não há escolha salva.
  var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(storedTheme() === 'light' ? 'light' : storedTheme() === 'dark' ? 'dark' : (prefersLight ? 'light' : 'dark'));
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onSys = function (ev) { if (!storedTheme()) applyTheme(ev.matches ? 'light' : 'dark'); };
    if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
  }
  initParticles();
  route();
})();
