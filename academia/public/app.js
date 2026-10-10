// Academia Seg System Segurança: interface em JavaScript puro (sem build).
// Toda regra de alçada e de pontuação fica no servidor; aqui só se apresenta o resultado.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var topbar = document.getElementById('topbar');
  var me = null;
  var justLoggedIn = false;

  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, options) {
    var opts = { method: (options && options.method) || 'GET', credentials: 'same-origin', headers: {} };
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
    document.title = (title ? title + ' · ' : '') + 'Academia Seg System Segurança';
    app.focus({ preventScroll: true });
  }

  function toast(message) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 6000);
  }

  function updateTopbar() {
    topbar.hidden = !me;
    if (me) {
      document.getElementById('sector-chip').textContent = me.sectorLabel;
      document.getElementById('who').textContent = me.name;
    }
  }

  function renderError(message) {
    setPage('<section class="notice"><h2>Não foi possível carregar</h2><p>' + esc(message) +
      '</p><p><a href="#/">Voltar ao início</a></p></section>', 'Erro');
  }

  // ---------- Acesso ----------
  function renderLogin(message) {
    setPage(
      '<section class="login-wrap"><div class="card login-card">' +
      '<div class="brand-mark" aria-hidden="true">AS</div>' +
      '<p class="eyebrow">Acesso</p>' +
      '<h1>Academia Seg System Segurança</h1>' +
      '<p class="lead">Trilhas de capacitação por setor. Entre com o seu e-mail e a sua senha.</p>' +
      '<form class="form" id="login-form" novalidate>' +
      '<label>E-mail<input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Senha<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn" type="submit">Entrar</button>' +
      '<p class="error" id="login-error" role="alert">' + esc(message || '') + '</p>' +
      '</form>' +
      '<p class="login-note">A mesma página atende todos os setores. Depois de entrar, você vê somente as trilhas do seu setor. Sem acesso? Fale com o seu gestor.</p>' +
      '</div></section>',
      'Entrar'
    );
    document.getElementById('login-form').addEventListener('submit', onLogin);
    document.querySelector('#login-form input[name="email"]').focus();
  }

  function onLogin(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('button');
    var errorEl = document.getElementById('login-error');
    var email = form.email.value.trim();
    var password = form.password.value;
    if (!email || !password) {
      errorEl.textContent = 'Informe e-mail e senha.';
      return;
    }
    button.disabled = true;
    api('/api/login', { method: 'POST', body: { email: email, password: password } })
      .then(function (data) {
        me = data.user;
        justLoggedIn = true;
        history.replaceState(null, '', '#/');
        return route();
      })
      .catch(function (err) {
        errorEl.textContent = err.status === 401 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar agora. Tente novamente.';
        button.disabled = false;
      });
  }

  function onLogout() {
    api('/api/logout', { method: 'POST' }).catch(function () {}).then(function () {
      me = null;
      history.replaceState(null, '', '#/');
      route();
    });
  }

  // ---------- Página inicial ----------
  function rankingTable(lb) {
    if (!lb.top.length) return '<p class="empty">Ainda não há pontuações neste setor.</p>';
    function row(r) {
      return '<tr class="' + (r.isMe ? 'me' : '') + '"><td>' + r.rank + 'º</td><td>' + esc(r.name) +
        (r.isMe ? ' <span class="muted small">(você)</span>' : '') + '</td><td class="num">' + r.points + '</td></tr>';
    }
    var body = lb.top.map(row).join('');
    if (lb.me && lb.me.rank > 5) body += row(lb.me);
    return '<table class="ranking"><caption class="sr-only">Ranking do setor por pontos</caption>' +
      '<thead><tr><th scope="col">Posição</th><th scope="col">Nome</th><th scope="col" class="num">Pontos</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  function badgesHtml(earned, available) {
    var footer = '<p class="small muted" style="margin-top:12px">' + available + ' a conquistar</p>';
    if (!earned.length) return '<p class="empty">Nenhum selo ainda. Conclua a primeira aula para começar.</p>' + footer;
    return '<ul class="badges">' + earned.map(function (b) {
      return '<li><span class="badge-icon" aria-hidden="true">✓</span><div><strong>' + esc(b.title) +
        '</strong><small>' + esc(b.detail) + '</small></div></li>';
    }).join('') + '</ul>' + footer;
  }

  function trackCard(t) {
    var right = t.complete ? '<span class="tag-done">Concluída</span>' : '<span>' + t.percent + '%</span>';
    return '<a class="track-card" href="#/trilha/' + esc(t.id) + '"><h3>' + esc(t.title) + '</h3><p>' + esc(t.summary) +
      '</p><div class="bar" aria-hidden="true"><span style="width:' + t.percent + '%"></span></div>' +
      '<div class="track-meta"><span>' + t.done + ' de ' + t.total + ' aulas</span>' + right + '</div></a>';
  }

  function renderHome() {
    return api('/api/home').then(function (d) {
      var lv = d.level;
      var remaining = lv.next ? 'Faltam ' + lv.next.remaining + ' pontos para ' + esc(lv.next.name) + '.' : 'Você alcançou o nível mais alto.';
      var next = d.next
        ? '<section class="card next"><div><span class="label">Próxima aula</span><h2>' + esc(d.next.title) +
          '</h2><p class="muted small">' + esc(d.next.trackTitle) + ' · ' + d.next.minutes + ' min</p></div>' +
          '<a class="btn" href="#/aula/' + esc(d.next.id) + '">Continuar</a></section>'
        : '<section class="card next"><div><span class="label">Concluído</span><h2>Você concluiu as aulas do seu setor</h2>' +
          '<p class="muted small">Novas trilhas aparecerão aqui quando forem publicadas.</p></div></section>';

      setPage(
        '<section><p class="eyebrow">' + esc(d.sector.label) + '</p><h1>Olá, ' + esc(d.user.firstName) + '</h1>' +
        '<p class="lead">Trilhas do seu setor. Cada aula concluída fica registrada no seu progresso.</p></section>' +
        '<div class="layout"><div>' +
        '<section class="card"><div class="progress-grid">' +
        '<div class="stat"><span class="label">Nível</span><strong>' + esc(lv.name) + '</strong></div>' +
        '<div class="stat"><span class="label">Pontos</span><strong>' + d.points + '</strong></div>' +
        '<div class="stat"><span class="label">Aulas concluídas</span><strong>' + d.lessonsDone + ' de ' + d.lessonsTotal + '</strong></div>' +
        '</div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + lv.percent +
        '" aria-label="Progresso até o próximo nível"><span style="width:' + lv.percent + '%"></span></div>' +
        '<p class="bar-caption">' + remaining + '</p></section>' +
        next +
        '<h2 class="section-title">Trilhas do seu setor</h2>' +
        '<div class="tracks">' + d.tracks.map(trackCard).join('') + '</div>' +
        '</div><aside>' +
        '<section class="card"><h2>Ranking do setor</h2>' + rankingTable(d.leaderboard) +
        '<p class="ranking-foot">Comparação entre ' + d.leaderboard.size + ' colegas do setor ' + esc(d.sector.label) + '.</p></section>' +
        '<section class="card"><h2>Selos</h2>' + badgesHtml(d.badges.earned, d.badges.available) + '</section>' +
        '</aside></div>',
        'Início'
      );
    });
  }

  // ---------- Trilha ----------
  function renderTrack(id) {
    return api('/api/tracks/' + encodeURIComponent(id)).then(function (t) {
      var items = t.lessons.map(function (l, i) {
        return '<li><a href="#/aula/' + esc(l.id) + '"><span class="lesson-num' + (l.done ? ' done' : '') + '" aria-hidden="true">' +
          (l.done ? '✓' : i + 1) + '</span><div><h3>' + esc(l.title) + '</h3><small>' + esc(l.objective) + ' · ' + l.minutes +
          ' min</small></div><span class="status' + (l.done ? ' done' : '') + '">' + (l.done ? 'Concluída' : 'Pendente') + '</span></a></li>';
      }).join('');
      setPage(
        '<nav class="breadcrumb" aria-label="Você está aqui"><a href="#/">Início</a> / <span>' + esc(t.title) + '</span></nav>' +
        '<section class="card"><p class="eyebrow">Trilha · ' + esc(t.sectorLabel) + '</p><h1>' + esc(t.title) + '</h1>' +
        '<p class="lead">' + esc(t.summary) + '</p>' +
        '<div class="bar"><span style="width:' + t.percent + '%"></span></div>' +
        '<p class="bar-caption">' + t.done + ' de ' + t.total + ' aulas concluídas</p></section>' +
        '<h2 class="section-title">Aulas</h2><ol class="lessons">' + items + '</ol>',
        t.title
      );
    });
  }

  // ---------- Aula ----------
  function resultFeedback(r) {
    return '<div class="feedback ' + (r.correct ? 'ok' : 'partial') + '" id="feedback" tabindex="-1" role="status">' +
      '<h3>' + (r.correct ? 'Resposta correta na primeira tentativa' : 'Resposta para revisar') + '</h3>' +
      '<p>' + esc(r.explanation) + '</p>' +
      '<p class="small muted">Pontos desta aula: ' + r.pointsEarned + '</p></div>';
  }

  function renderLesson(id) {
    return api('/api/lessons/' + encodeURIComponent(id)).then(function (l) {
      var r = l.result;
      var options = l.options.map(function (opt, i) {
        var cls = 'option';
        if (r) {
          cls += ' locked';
          if (i === r.answer) cls += ' correct';
          else if (i === r.chosen && !r.correct) cls += ' wrong';
        }
        var checked = r && i === r.chosen ? ' checked' : '';
        return '<label class="' + cls + '"><input type="radio" name="choice" value="' + i + '"' + checked + '> <span>' + esc(opt) + '</span></label>';
      }).join('');

      var steps = l.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      var quiz = '<form class="quiz" id="quiz-form">' +
        '<fieldset' + (r ? ' disabled' : '') + '><legend>' + esc(l.question) + '</legend>' + options + '</fieldset>' +
        (r ? '' : '<button class="btn" type="submit" id="quiz-submit" disabled>Registrar conclusão</button>') +
        '<p class="error" id="quiz-error" role="alert"></p></form>';

      var after = '<div class="next-step"><a class="btn btn-secundario" href="#/trilha/' + esc(l.trackId) + '">Voltar à trilha</a>' +
        (l.nextLessonId ? '<a class="btn" href="#/aula/' + esc(l.nextLessonId) + '">Próxima aula</a>' : '') + '</div>';

      setPage(
        '<nav class="breadcrumb" aria-label="Você está aqui"><a href="#/">Início</a> / <a href="#/trilha/' + esc(l.trackId) + '">' +
        esc(l.trackTitle) + '</a> / <span>Aula ' + l.position + ' de ' + l.total + '</span></nav>' +
        '<section class="card"><div class="lesson-head"><div><p class="eyebrow">' + esc(l.trackTitle) + '</p><h1>' + esc(l.title) +
        '</h1><p class="meta-line">' + l.minutes + ' min · Aula ' + l.position + ' de ' + l.total + '</p></div>' +
        (r ? '<span class="tag-done">Concluída</span>' : '') + '</div>' +
        '<p class="lead" style="margin-top:12px"><strong>Objetivo:</strong> ' + esc(l.objective) + '</p>' +
        '<ol class="steps">' + steps + '</ol></section>' +
        '<section class="card" aria-labelledby="quiz-title"><h2 id="quiz-title">Verificação de aprendizagem</h2>' +
        '<p class="muted small">Responda para concluir a aula. Os pontos da aula são creditados na primeira conclusão.</p>' +
        quiz + (r ? resultFeedback(r) : '') + '</section>' + after,
        l.title
      );

      if (!r) {
        var form = document.getElementById('quiz-form');
        var submit = document.getElementById('quiz-submit');
        form.addEventListener('change', function () { submit.disabled = false; });
        form.addEventListener('submit', function (event) { onAnswer(event, l.id); });
      } else {
        document.getElementById('feedback').focus({ preventScroll: false });
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
        var parts = [];
        if (!res.alreadyCompleted) parts.push('+' + res.pointsEarned + ' pontos');
        if (res.levelUp) parts.push('Novo nível: ' + res.level.name);
        if (res.trackCompleted) parts.push('Trilha concluída');
        (res.newBadges || []).forEach(function (b) { parts.push('Selo: ' + b.title); });
        if (parts.length) toast(parts.join(' · '));
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
      setPage('<section class="notice"><h2>Busca</h2><p>Digite pelo menos duas letras na busca do topo da página.</p></section>', 'Busca');
      return Promise.resolve();
    }
    return api('/api/search?q=' + encodeURIComponent(term)).then(function (data) {
      var list = data.results.length
        ? '<ol class="lessons">' + data.results.map(function (r) {
          return '<li><a href="#/aula/' + esc(r.id) + '"><span class="lesson-num" aria-hidden="true">›</span><div><h3>' + esc(r.title) +
            '</h3><small>' + esc(r.trackTitle) + ' · ' + r.minutes + ' min</small></div><span class="status"></span></a></li>';
        }).join('') + '</ol>'
        : '<p class="empty">Nenhuma aula do seu setor corresponde a esta busca.</p>';
      setPage('<nav class="breadcrumb"><a href="#/">Início</a> / <span>Busca</span></nav>' +
        '<h1>Resultados para “' + esc(term) + '”</h1><div style="margin-top:18px">' + list + '</div>', 'Busca');
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
  document.getElementById('search-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var q = document.getElementById('search-input').value.trim();
    if (q.length >= 2) location.hash = '#/busca?q=' + encodeURIComponent(q);
  });
  window.addEventListener('hashchange', route);
  route();
})();
