const $ = (s) => document.querySelector(s);
async function api(url, body, method = 'POST') {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET') {
    options.body = JSON.stringify(body || {});
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({ error: 'Respuesta inesperada del servidor.' }));
  if (!response.ok) throw new Error(data.error || 'Ocurrió un error.');
  return data;
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function participantPage() {
  const join = $('#join'), play = $('#play'), form = $('#join-form');
  let gid = null, name = sessionStorage.getItem('participant_name') || '', picked = null;
  let pollingInterval = null;

  async function currentState() { return api('/api/state', null, 'GET'); }

  async function updateRoundInfo() {
    try {
      const d = await currentState();
      gid = d.game.id;
      $('#round-info').textContent = `Partida activa: ${d.game.name} · Ronda de ${d.game.round_size} preguntas.`;
      if (d.game.status === 'finished') showPodium(d);
    } catch (e) {
      $('#round-info').textContent = 'Aún no hay una partida disponible.';
    }
  }

  await updateRoundInfo();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    name = $('#nickname').value.trim();
    try {
      const d = await api('/api/register', { nickname: name });
      name = d.state.participant_name || name;
      sessionStorage.setItem('participant_name', name);
      gid = d.state.game.id;
      activate(name);
    } catch (err) {
      $('#join-error').textContent = err.message;
    }
  });

  if (name) {
    try {
      const d = await api('/api/register', { nickname: name });
      gid = d.state.game.id;
      activate(name);
    } catch (e) {
      sessionStorage.removeItem('participant_name');
      name = '';
    }
  }

  function activate(playerName) {
    join.classList.add('hidden');
    $('#podium').classList.add('hidden');
    play.classList.remove('hidden');
    $('#player-name').textContent = playerName;
    refresh();
    if (!pollingInterval) {
      pollingInterval = setInterval(refresh, 1500);
    }
  }

  async function refresh() {
    try {
      const data = await currentState();
      gid = data.game.id;
      if (data.game.status === 'finished') {
        showPodium(data);
        return;
      }
      $('#podium').classList.add('hidden');
      play.classList.remove('hidden');
      render(data);
    } catch (e) {
      $('#answer-status').textContent = e.message;
    }
  }

  function showPodium(data) {
    play.classList.add('hidden');
    join.classList.add('hidden');
    $('#podium').classList.remove('hidden');
    const winners = data.podium || [];
    $('#podium-list').innerHTML = winners.length ? winners.map((p, i) =>
      `<article class="podium-place place-${i + 1}" style="--delay:${i * 220}ms">
        <span class="podium-medal">${i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'}</span>
        <small>${i === 0 ? 'GANADOR/A' : `${p.position}° LUGAR`}</small>
        <strong>${esc(p.nickname)}</strong>
        <b>${p.score} ${p.score === 1 ? 'punto' : 'puntos'}</b>
      </article>`
    ).join('') : '<p>No hubo participantes en esta partida.</p>';

    $('#confetti').innerHTML = Array.from({ length: 28 }, (_, i) =>
      `<i style="--i:${i};--h:${(i * 47) % 360}deg;left:${(i * 37) % 100}%;--duration:${2.2 + (i % 8) * .2}s"></i>`
    ).join('');
  }

  function render(data) {
    const game = data.game, q = data.question;
    $('#game-status').textContent = ({ waiting: 'En espera', running: 'Partida en curso', finished: 'Partida finalizada' })[game.status] || game.status;
    if (!q) {
      $('#waiting').classList.remove('hidden');
      $('#question-box').classList.add('hidden');
      return;
    }
    $('#waiting').classList.add('hidden');
    $('#question-box').classList.remove('hidden');
    $('#question-counter').textContent = q.is_tiebreak ? 'PREGUNTA DE DESEMPATE' : `Pregunta ${q.question_order} de ${game.round_size}`;
    $('#question-text').textContent = q.question_text;

    const closed = q.status !== 'open', answered = Boolean(data.my_answer);
    picked = answered ? data.my_answer : picked;

    $('#options').innerHTML = ['A', 'B', 'C', 'D'].map((letter) =>
      `<button class="answer-option ${picked === letter ? 'selected' : ''}" data-choice="${letter}" ${closed || answered ? 'disabled' : ''}>
        <b>${letter}</b>
        <span>${esc(q['option_' + letter.toLowerCase()])}</span>
      </button>`
    ).join('');

    document.querySelectorAll('.answer-option').forEach(b => b.addEventListener('click', () => {
      picked = b.dataset.choice;
      document.querySelectorAll('.answer-option').forEach(x => x.classList.toggle('selected', x.dataset.choice === picked));
      $('#confirm-answer').disabled = !picked;
    }));

    $('#confirm-answer').disabled = closed || answered || !picked;
    $('#confirm-answer').textContent = answered ? 'Respuesta confirmada' : 'Confirmar respuesta';
    $('#answer-status').textContent = answered ? 'Tu respuesta quedó registrada.' : closed ? 'No respondiste a tiempo.' : picked ? 'Revisa tu alternativa y confírmala.' : 'Selecciona una alternativa.';

    const feedback = $('#feedback');
    feedback.classList.toggle('hidden', !closed || !q.correct_option);
    if (closed && q.correct_option) {
      feedback.innerHTML = `<strong>Correcta: ${q.correct_option}) ${esc(q['option_' + q.correct_option.toLowerCase()])}</strong><p>${esc(q.explanation || '')}</p>`;
    }
  }

  $('#confirm-answer').addEventListener('click', async () => {
    try {
      await api('/api/answer', { choice: picked });
      $('#confirm-answer').disabled = true;
      refresh();
      toast('Respuesta confirmada');
    } catch (e) {
      toast(e.message);
      refresh();
    }
  });
}

async function adminPage() {
  const login = $('#login'), dashboard = $('#dashboard');
  let gid = null, pollingInterval = null;

  async function load() {
    const data = await api(gid ? `/api/admin/state?game=${gid}` : '/api/admin/state', null, 'GET');
    gid = data.game.id;
    render(data);
    return data;
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { username: $('#username').value, password: $('#password').value });
      login.classList.add('hidden');
      dashboard.classList.remove('hidden');
      await refresh();
      startPolling();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  function startPolling() {
    if (!pollingInterval) {
      pollingInterval = setInterval(refresh, 2000);
    }
  }

  async function refresh() {
    try {
      const d = await load();
      $('#login').classList.add('hidden');
      dashboard.classList.remove('hidden');
      startPolling();
      return d;
    } catch (e) {
      if (e.message.includes('iniciar sesión')) {
        login.classList.remove('hidden');
        dashboard.classList.add('hidden');
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
      } else {
        toast(e.message);
      }
    }
  }

  function render(d) {
    const g = d.game, q = d.question;
    $('#game-name').textContent = g.name;
    $('#stat-status').textContent = ({ waiting: 'En espera', running: 'En curso', finished: 'Finalizada' })[g.status];
    $('#stat-people').textContent = d.participants.length;
    $('#stat-connected').textContent = d.participants.filter(p => p.connected).length;
    $('#stat-answers').textContent = d.answer_count;
    $('#stat-pending').textContent = d.pending_count;
    $('#show-leaderboard').checked = Boolean(g.show_leaderboard_after_question);
    $('#round-size').value = g.round_size;
    $('#round-size').disabled = g.status !== 'waiting';
    $('#save-round-size').disabled = g.status !== 'waiting';

    const tieQuestion = (d.round_questions || []).find(x => x.is_tiebreak && x.status === 'draft');
    $('#round-summary').textContent = tieQuestion ? 'Desempate pendiente' : `${(d.round_questions || []).filter(x => !x.is_tiebreak).length} preguntas sorteadas`;

    const flowBtn = $('#flow-btn'), finishBtn = $('#finish-btn');
    if (flowBtn) {
      if (g.status === 'waiting') {
        flowBtn.dataset.action = 'start-game';
        flowBtn.textContent = 'Comenzar partida';
        flowBtn.className = 'primary';
        flowBtn.disabled = false;
        if (finishBtn) finishBtn.disabled = true;
      } else if (g.status === 'running') {
        if (finishBtn) finishBtn.disabled = false;
        if (q && q.status === 'open') {
          flowBtn.dataset.action = 'close-question';
          flowBtn.textContent = 'Cerrar pregunta';
          flowBtn.className = 'warning';
          flowBtn.disabled = false;
        } else {
          const pendingQuestions = (d.round_questions || []).filter(x => x.status === 'draft');
          if (tieQuestion) {
            flowBtn.dataset.action = 'start-question';
            flowBtn.textContent = 'Iniciar desempate';
            flowBtn.className = 'primary';
            flowBtn.disabled = false;
          } else if (pendingQuestions.length > 0) {
            flowBtn.dataset.action = 'start-question';
            flowBtn.textContent = q ? 'Siguiente pregunta' : 'Iniciar pregunta';
            flowBtn.className = 'primary';
            flowBtn.disabled = false;
          } else {
            flowBtn.dataset.action = 'finish-game';
            flowBtn.textContent = 'Finalizar partida';
            flowBtn.className = 'danger';
            flowBtn.disabled = false;
          }
        }
      } else {
        flowBtn.dataset.action = '';
        flowBtn.textContent = 'Partida finalizada';
        flowBtn.className = 'secondary';
        flowBtn.disabled = true;
        if (finishBtn) finishBtn.disabled = true;
      }
    }

    $('#current-admin-question').innerHTML = q ?
      `<div class="eyebrow">${q.is_tiebreak ? 'PREGUNTA DE DESEMPATE' : `Pregunta ${q.question_order} de ${g.round_size}`} · ${esc(q.status)}</div>
       <h3>${esc(q.question_text)}</h3>
       <p>${['A', 'B', 'C', 'D'].map(x => `${x}) ${esc(q['option_' + x.toLowerCase()])}`).join('　 ·　 ')}</p>
       ${q.status === 'closed' ? `<div class="feedback"><strong>Correcta: ${q.correct_option}</strong> ${esc(q.explanation)} <small>${esc(q.source)}</small></div>` : ''}` :
      '<p>Se sortearán las preguntas del banco completo al comenzar la partida.</p>';

    $('#participants-table').innerHTML = d.participants.map(p =>
      `<tr>
        <td>${esc(p.nickname)}</td>
        <td><span class="status-dot ${p.connected ? 'online' : ''}"></span>${p.connected ? 'Activo' : 'Inactivo'}</td>
        <td>${p.selected_option ? `Confirmada · ${esc(p.selected_option)}` : (p.connected ? 'Pendiente' : 'Inactivo, pendiente')}</td>
        <td><button class="plain details" data-id="${esc(p.id)}">Detalle</button></td>
      </tr>`
    ).join('') || '<tr><td colspan="4">Aún no hay participantes.</td></tr>';

    $('#leaderboard').innerHTML = d.leaderboard.map(p =>
      `<tr>
        <td>${p.position}</td>
        <td>${esc(p.nickname)}</td>
        <td><strong>${p.score}</strong></td>
        <td>${p.correct}</td>
        <td>${p.answered}</td>
        <td>${p.unanswered}</td>
      </tr>`
    ).join('') || '<tr><td colspan="6">Los puntajes aparecerán al responder.</td></tr>';

    const banks = d.questions;
    $('#bank-list').innerHTML = banks.map(item =>
      `<article class="bank-item">
        <div>
          <strong>${esc(item.question_text)}</strong>
          <small>${esc(item.category)} · ${esc(item.difficulty)} · ${esc(item.source)}</small>
        </div>
        <div>
          <button class="plain edit-question" data-id="${item.id}">Editar</button>
          <button class="plain delete-question" data-id="${item.id}">Eliminar</button>
        </div>
      </article>`
    ).join('');

    $('#question-list').innerHTML = (d.round_questions || []).map(item =>
      `<div class="selection-item">
        <b>${item.question_order}. ${esc(item.question_text)}</b>
        <small>${item.is_tiebreak ? 'Desempate' : esc(item.category + ' · ' + item.difficulty)}</small>
      </div>`
    ).join('') || `<p>Al comenzar se sortearán ${g.round_size} preguntas del banco de ${banks.length} disponibles.</p>`;

    $('#admin-game-select').innerHTML = d.games.map(x =>
      `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)} (${esc(x.status)})</option>`
    ).join('');

    document.querySelectorAll('.details').forEach(b => b.onclick = async () => {
      try {
        const r = await api(`/api/admin/results/${b.dataset.id}?game=${gid}`, null, 'GET');
        alert(r.answers.map(x => `Pregunta ${x.question_order}: ${x.selected_option} ${x.is_correct ? '✓' : '✗'} · ${x.question_text}`).join('\n') || 'Sin respuestas registradas.');
      } catch (e) {
        toast(e.message);
      }
    });

    document.querySelectorAll('.edit-question').forEach(b => b.onclick = () => {
      const questionItem = banks.find(x => x.id === Number(b.dataset.id));
      if (!questionItem) return;
      $('#edit-id').value = questionItem.id;
      $('#q-text').value = questionItem.question_text;
      ['a', 'b', 'c', 'd'].forEach(x => $('#opt-' + x).value = questionItem['option_' + x]);
      $('#correct').value = questionItem.correct_option;
      $('#category').value = questionItem.category;
      $('#difficulty').value = questionItem.difficulty;
      $('#explanation').value = questionItem.explanation;
      $('#source').value = questionItem.source;
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });

    document.querySelectorAll('.delete-question').forEach(b => b.onclick = async () => {
      if (!confirm('¿Eliminar esta pregunta del banco?')) return;
      try {
        await api('/api/admin/questions/delete', { id: Number(b.dataset.id) });
        refresh();
      } catch (e) {
        toast(e.message);
      }
    });
  }

  $('#admin-game-select').addEventListener('change', async e => {
    gid = Number(e.target.value);
    await api('/api/admin/select-game', { game_id: gid });
    refresh();
  });

  $('#show-leaderboard').addEventListener('change', async e => {
    try {
      await api('/api/admin/display-settings', { game_id: gid, show_leaderboard_after_question: e.target.checked });
    } catch (err) {
      toast(err.message);
    }
  });

  $('#new-game').onclick = async () => {
    const name = prompt('Nombre de la nueva partida');
    if (!name) return;
    const size = Number(prompt('¿Cuántas preguntas tendrá la ronda? Escribe 10, 15 o 20.', '10'));
    if (![10, 15, 20].includes(size)) return toast('Elige 10, 15 o 20 preguntas.');
    if (!confirm('Se activará esta partida y se cerrará cualquier partida que esté abierta. ¿Continuar?')) return;
    try {
      const d = await api('/api/admin/games', { name, round_size: size });
      gid = d.game_id;
      refresh();
    } catch (e) {
      toast(e.message);
    }
  };

  document.querySelectorAll('[data-action]').forEach(b => b.onclick = async () => {
    if (!b.dataset.action) return;
    if (b.dataset.action === 'close-question' && Number($('#stat-pending').textContent) > 0 && !confirm(`Aún hay ${$('#stat-pending').textContent} participantes pendientes. ¿Cerrar de todas formas?`)) return;
    if (b.dataset.action === 'finish-game' && !confirm('¿Deseas finalizar la partida?')) return;
    try {
      await api(`/api/admin/control/${b.dataset.action}`, { game_id: gid });
      refresh();
    } catch (e) {
      toast(e.message);
    }
  });

  $('#save-round-size').onclick = async () => {
    try {
      await api('/api/admin/round-size', { game_id: gid, round_size: Number($('#round-size').value) });
      refresh();
      toast('Cantidad de preguntas guardada');
    } catch (e) {
      toast(e.message);
    }
  };

  $('#question-form').onsubmit = async e => {
    e.preventDefault();
    const body = {
      id: $('#edit-id').value || null,
      question_text: $('#q-text').value,
      option_a: $('#opt-a').value,
      option_b: $('#opt-b').value,
      option_c: $('#opt-c').value,
      option_d: $('#opt-d').value,
      correct_option: $('#correct').value,
      category: $('#category').value,
      difficulty: $('#difficulty').value,
      explanation: $('#explanation').value,
      source: $('#source').value
    };
    try {
      await api('/api/admin/questions', body);
      e.target.reset();
      $('#edit-id').value = '';
      refresh();
      toast('Pregunta guardada');
    } catch (err) {
      toast(err.message);
    }
  };

  $('#cancel-edit').onclick = () => {
    $('#question-form').reset();
    $('#edit-id').value = '';
  };

  $('#logout').onclick = async () => {
    await api('/api/admin/logout', {});
    location.reload();
  };

  refresh();
}

async function projectionPage() {
  async function refresh() {
    try {
      const d = await api('/api/admin/state', null, 'GET');
      const q = d.question;
      $('#projection-wait').classList.toggle('hidden', Boolean(q) || d.game.status === 'finished');
      $('#projection-question').classList.toggle('hidden', !q || d.game.status === 'finished');
      $('#projection-final').classList.toggle('hidden', d.game.status !== 'finished');

      if (q) {
        $('#projection-meta').textContent = `${q.is_tiebreak ? 'DESEMPATE' : `PREGUNTA ${q.question_order} DE ${d.game.round_size}`} · ${q.category}`;
        $('#projection-text').textContent = q.question_text;
        $('#projection-options').innerHTML = ['A', 'B', 'C', 'D'].map(x =>
          `<div class="projection-option"><b>${x}</b><span>${esc(q['option_' + x.toLowerCase()])}</span></div>`
        ).join('');

        const closed = $('#projection-closed');
        closed.classList.toggle('hidden', q.status !== 'closed');
        if (q.status === 'closed') {
          closed.innerHTML = `<strong>Respuesta correcta: ${q.correct_option}</strong><p>${esc(q.explanation)}</p><small>${esc(q.source)}</small>`;
        }

        const board = $('#projection-after-board');
        board.classList.toggle('hidden', q.status !== 'closed' || !d.game.show_leaderboard_after_question);
        $('#projection-board').innerHTML = d.leaderboard.map(p =>
          `<div class="projection-rank"><b>${p.position}</b><span>${esc(p.nickname)}</span><strong>${p.score} pts</strong></div>`
        ).join('');
      }

      if (d.game.status === 'finished') {
        $('#projection-leaderboard').innerHTML = d.leaderboard.map(p =>
          `<div class="projection-rank"><b>${p.position}</b><span>${esc(p.nickname)}</span><strong>${p.score} pts</strong></div>`
        ).join('');
      }
    } catch (e) {
      $('#projection-wait').innerHTML = '<h1>Inicia sesión como administrador</h1><p>Abre /admin en esta misma ventana o navegador, inicia sesión y vuelve a esta pestaña.</p>';
    }
  }

  refresh();
  setInterval(refresh, 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'participant') participantPage();
  if (page === 'admin') adminPage();
  if (page === 'projection') projectionPage();
});

