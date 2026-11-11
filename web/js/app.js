const $ = sel => document.querySelector(sel);
const STATUS = ['Aberta', 'Em Atendimento', 'Concluída'];

// Cache local dos dados vindos do Supabase
const state = { clientes: [], tecnicos: [], ordens_servico: [] };

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const fmtCPF = cpf => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 3000);
}

// Executa uma operação assíncrona, recarrega os dados e mostra feedback
async function run(fn, okMsg) {
  document.body.classList.add('loading');
  try {
    const msg = await fn();
    await refresh();
    toast(msg || okMsg);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  } finally {
    document.body.classList.remove('loading');
  }
}

async function refresh() {
  const [clientes, tecnicos, ordens] = await Promise.all([
    DB.select('clientes'), DB.select('tecnicos'), DB.select('ordens_servico'),
  ]);
  Object.assign(state, { clientes, tecnicos, ordens_servico: ordens });
  renderAll();
}

/* ---------- Tabs ---------- */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach(p =>
      p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
  });
});

/* ---------- Ordens de Serviço ---------- */
function renderStats(ordens) {
  const count = s => ordens.filter(o => o.status === s).length;
  $('#stats').innerHTML = [
    ['Total', ordens.length],
    ['Abertas', count('Aberta')],
    ['Em Atendimento', count('Em Atendimento')],
    ['Concluídas', count('Concluída')],
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><strong>${v}</strong></div>`).join('');
}

function fillSelects() {
  const keep = (sel, html) => { const v = sel.value; sel.innerHTML = html; if (v) sel.value = v; };
  keep($('#os-cliente'), '<option value="">Selecione...</option>' +
    state.clientes.map(c => `<option value="${c.cliente_id}">${esc(c.nome)}</option>`).join(''));
  keep($('#os-tecnico'), '<option value="">Selecione...</option>' +
    state.tecnicos.map(t => `<option value="${t.tecnico_id}">${esc(t.nome)} — ${esc(t.especialidade)}</option>`).join(''));
}

function renderOrdens() {
  const ordens = state.ordens_servico;
  const cliName = id => state.clientes.find(c => c.cliente_id === id)?.nome ?? '—';
  const tecName = id => state.tecnicos.find(t => t.tecnico_id === id)?.nome ?? '—';

  renderStats(ordens);
  fillSelects();

  const q = $('#filtro-texto').value.trim().toLowerCase();
  const st = $('#filtro-status').value;

  const rows = ordens
    .filter(o => !st || o.status === st)
    .filter(o => !q || [o.descricao, cliName(o.cliente_id), tecName(o.tecnico_id), String(o.ordem_servico_id)]
      .some(s => s.toLowerCase().includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data) || b.ordem_servico_id - a.ordem_servico_id);

  $('#tbody-ordens').innerHTML = rows.length ? rows.map(o => `
    <tr>
      <td>${o.ordem_servico_id}</td>
      <td>${fmtDate(o.data)}</td>
      <td>${esc(cliName(o.cliente_id))}</td>
      <td>${esc(tecName(o.tecnico_id))}</td>
      <td>${esc(o.descricao)}</td>
      <td><select class="status-select" data-id="${o.ordem_servico_id}">
        ${STATUS.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
      </select></td>
      <td class="row-actions"><button class="btn small" data-edit-os="${o.ordem_servico_id}">Editar</button></td>
    </tr>`).join('')
    : '<tr><td colspan="7" class="empty">Nenhuma ordem encontrada.</td></tr>';
}

function resetOrdemForm() {
  $('#form-ordem').reset();
  $('#os-id').value = '';
  $('#os-data').value = today();
  $('#form-ordem-title').textContent = 'Nova Ordem de Serviço';
  $('#os-submit').textContent = 'Registar';
  $('#os-cancel').hidden = true;
}

$('#form-ordem').addEventListener('submit', async e => {
  e.preventDefault();
  const row = {
    cliente_id: Number($('#os-cliente').value),
    tecnico_id: Number($('#os-tecnico').value),
    data: $('#os-data').value,
    status: $('#os-status').value,
    descricao: $('#os-descricao').value.trim(),
  };
  const id = Number($('#os-id').value);
  const ok = await run(async () => {
    if (id) {
      await DB.update('ordens_servico', id, row);
      return `Ordem #${id} atualizada`;
    }
    const r = await DB.insert('ordens_servico', row);
    return `Ordem #${r.ordem_servico_id} registada`;
  });
  if (ok) resetOrdemForm();
});

$('#os-cancel').addEventListener('click', resetOrdemForm);

$('#tbody-ordens').addEventListener('change', e => {
  if (!e.target.matches('.status-select')) return;
  const id = Number(e.target.dataset.id);
  run(() => DB.update('ordens_servico', id, { status: e.target.value }), `Status da ordem #${id} atualizado`);
});

$('#tbody-ordens').addEventListener('click', e => {
  const id = Number(e.target.dataset.editOs);
  if (!id) return;
  const o = state.ordens_servico.find(r => r.ordem_servico_id === id);
  $('#os-id').value = o.ordem_servico_id;
  $('#os-cliente').value = o.cliente_id;
  $('#os-tecnico').value = o.tecnico_id;
  $('#os-data').value = o.data;
  $('#os-status').value = o.status;
  $('#os-descricao').value = o.descricao;
  $('#form-ordem-title').textContent = `Editar Ordem #${id}`;
  $('#os-submit').textContent = 'Guardar alterações';
  $('#os-cancel').hidden = false;
  $('#form-ordem').scrollIntoView({ behavior: 'smooth' });
});

$('#filtro-texto').addEventListener('input', renderOrdens);
$('#filtro-status').addEventListener('change', renderOrdens);

/* ---------- Clientes e Técnicos (sem DELETE) ---------- */
function setupEntity({ table, pk, form, idInput, fields, tbody, cols, label }) {
  const formEl = $(form);
  const cancelBtn = formEl.querySelector('.cancel');
  const title = formEl.querySelector('h2');
  const reset = () => {
    formEl.reset();
    $(idInput).value = '';
    title.textContent = `Novo ${label}`;
    cancelBtn.hidden = true;
  };

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    const row = {};
    for (const [col, sel] of Object.entries(fields)) row[col] = $(sel).value.trim();
    const id = Number($(idInput).value);
    const ok = await run(
      () => id ? DB.update(table, id, row) : DB.insert(table, row),
      id ? `${label} atualizado` : `${label} registado`,
    );
    if (ok) reset();
  });

  cancelBtn.addEventListener('click', reset);

  $(tbody).addEventListener('click', e => {
    const id = Number(e.target.dataset.edit);
    if (!id) return;
    const r = state[table].find(x => x[pk] === id);
    $(idInput).value = id;
    for (const [col, sel] of Object.entries(fields)) $(sel).value = r[col];
    title.textContent = `Editar ${label} #${id}`;
    cancelBtn.hidden = false;
    formEl.scrollIntoView({ behavior: 'smooth' });
  });

  return () => {
    const rows = state[table];
    $(tbody).innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${r[pk]}</td>
        ${cols.map(fn => `<td>${esc(fn(r))}</td>`).join('')}
        <td class="row-actions"><button class="btn small" data-edit="${r[pk]}">Editar</button></td>
      </tr>`).join('')
      : `<tr><td colspan="${cols.length + 2}" class="empty">Sem registos.</td></tr>`;
  };
}

const renderClientes = setupEntity({
  table: 'clientes', pk: 'cliente_id', label: 'Cliente',
  form: '#form-cliente', idInput: '#cli-id', tbody: '#tbody-clientes',
  fields: { nome: '#cli-nome', cpf: '#cli-cpf' },
  cols: [r => r.nome, r => fmtCPF(r.cpf)],
});

const renderTecnicos = setupEntity({
  table: 'tecnicos', pk: 'tecnico_id', label: 'Técnico',
  form: '#form-tecnico', idInput: '#tec-id', tbody: '#tbody-tecnicos',
  fields: { nome: '#tec-nome', especialidade: '#tec-especialidade' },
  cols: [r => r.nome, r => r.especialidade],
});

function renderAll() {
  renderOrdens();
  renderClientes();
  renderTecnicos();
}

/* ---------- Arranque ---------- */
resetOrdemForm();
refresh().catch(e => toast(e.message, true));
