const STORAGE_KEY = 'bookhub_wallet_user';

function checkAuth() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) { window.location.href = '/login/login.html'; return null; }
  return JSON.parse(saved);
}

async function carregarPerfil() {
  const user = checkAuth();
  if (!user) return;

  document.getElementById('infoUsername').textContent = user.username || user.login || '-';
  document.getElementById('infoNome').textContent = user.nome || '-';
  document.getElementById('infoEmail').textContent = user.email || '-';
  document.getElementById('infoWallet').textContent = user.walletAddress || user.wallet_address || user.login || user.email || '-';
  document.getElementById('avatarDisplay').src = user.avatar || '/img/avatar1.png';

  carregarHistorico();
  carregarConquistasRanking(user.id);
}

async function carregarConquistasRanking(usuarioId) {
  const container = document.getElementById('rankingAchievements');
  if (!container || !usuarioId) {
    if (container) container.textContent = 'Conquistas ainda não disponíveis para esta conta.';
    return;
  }

  try {
    const res = await fetch(`/api/ranking/conquistas/${encodeURIComponent(usuarioId)}`);
    const dados = await res.json();
    if (!res.ok) throw new Error(dados.erro || 'Não foi possível carregar as conquistas.');
    const conquistas = [...dados.atuais, ...dados.historicas]
      .sort((a, b) => b.temporada.localeCompare(a.temporada) || a.posicao - b.posicao);
    container.replaceChildren();

    if (!conquistas.length) {
      const vazio = document.createElement('span');
      vazio.className = 'ranking-achievements-empty';
      vazio.textContent = 'Você ainda não conquistou uma posição no Top 3.';
      container.appendChild(vazio);
      return;
    }

    conquistas.forEach(conquista => {
      const mes = new Date(`${conquista.temporada}-01T00:00:00Z`).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      });
      const tag = document.createElement('span');
      tag.className = `ranking-achievement-tag top-${conquista.posicao}`;
      tag.textContent = `Top ${conquista.posicao} · ${mes}${conquista.em_andamento ? ' · Atual' : ''}`;
      tag.title = `${conquista.pontos} ponto(s) na temporada${conquista.em_andamento ? '; posição ainda pode mudar' : ''}`;
      container.appendChild(tag);
    });
  } catch (error) {
    console.error('Erro ao carregar conquistas do ranking:', error);
    container.textContent = 'Não foi possível carregar suas conquistas.';
  }
}

async function carregarHistorico() {
  try {
    const res = await fetch('/api/reservas/usuario');
    const reservas = await res.json();
    if (!res.ok) throw new Error(reservas.erro || 'Não foi possível carregar o histórico.');
    const tbody = document.getElementById('tabelaHistorico');
    tbody.replaceChildren();
    if (reservas.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.textContent = 'Nenhum livro reservado.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }
    reservas.forEach(r => {
      const tr = document.createElement('tr');
      const data = new Date(r.data_pedido).toLocaleDateString('pt-BR');
      let cor = r.status === 'Aprovado' ? '#10b981' : (r.status === 'Rejeitado' ? '#e50914' : '#f59e0b');
      const titulo = document.createElement('td');
      titulo.textContent = r.titulo;
      const status = document.createElement('td');
      status.textContent = r.status;
      status.style.color = cor;
      status.style.fontWeight = '700';
      const dataCell = document.createElement('td');
      dataCell.textContent = data;
      tr.append(titulo, status, dataCell);
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar histórico de reservas:', err);
    const tbody = document.getElementById('tabelaHistorico');
    tbody.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'Não foi possível carregar o histórico de reservas.';
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

function configurarAbas() {
  const btnGeral = document.getElementById('tabVisaoGeral');
  const btnHist = document.getElementById('tabHistorico');
  const pGeral = document.getElementById('painelVisaoGeral');
  const pHist = document.getElementById('painelHistorico');

  btnGeral.addEventListener('click', () => { btnGeral.classList.add('ativo'); btnHist.classList.remove('ativo'); pGeral.style.display = 'block'; pHist.style.display = 'none'; });
  btnHist.addEventListener('click', () => { btnHist.classList.add('ativo'); btnGeral.classList.remove('ativo'); pHist.style.display = 'block'; pGeral.style.display = 'none'; });
}

function configurarEdicaoPerfil() {
  const modalEdicao = document.getElementById('modalEdicao');
  const formEditarPerfil = document.getElementById('formEditarPerfil');
  const editAvatarInput = document.getElementById('editAvatarInput');
  const avatarOptions = document.querySelectorAll('.avatar-option-modal');

  // Lógica de seleção visual do avatar
  avatarOptions.forEach(img => {
    img.addEventListener('click', () => {
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      img.classList.add('selected');
      editAvatarInput.value = img.getAttribute('data-src');
    });
  });

  document.getElementById('btnAbrirEdicao').addEventListener('click', () => {
    const user = checkAuth();
    if (!user) return;
    document.getElementById('editWallet').value = user.walletAddress || user.wallet_address || user.login || user.email || '';
    document.getElementById('editNome').value = user.nome || '';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editEmail').value = user.email || '';
    // Marca o avatar atual como selecionado
    const avatarAtual = user.avatar || '/img/avatar1.png';
    editAvatarInput.value = avatarAtual;
    avatarOptions.forEach(opt => {
      opt.classList.remove('selected');
      if (opt.getAttribute('data-src') === avatarAtual) opt.classList.add('selected');
    });

    modalEdicao.style.display = 'flex';
  });

  document.getElementById('btnCancelarEdicao').addEventListener('click', () => modalEdicao.style.display = 'none');

  formEditarPerfil.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      wallet: document.getElementById('editWallet').value,
      nome: document.getElementById('editNome').value,
      username: document.getElementById('editUsername').value,
      email: document.getElementById('editEmail').value,
      senha: document.getElementById('editSenha').value,
      avatar: editAvatarInput.value // Envia a URL do avatar
    };

    try {
      const res = await fetch('/api/auth/perfil', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) {
        alert('Perfil atualizado!');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...checkAuth(), ...data.usuario }));
        carregarPerfil(); 
        modalEdicao.style.display = 'none';
      } else { alert(data.erro); }
    } catch (err) { alert('Erro de conexão ao salvar.'); }
  });
}

document.getElementById('btnDesconectar').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Não foi possível encerrar a sessão.');
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = '/';
  } catch (error) {
    console.error('Erro ao encerrar sessão:', error);
    alert(error.message || 'Não foi possível encerrar a sessão no servidor.');
  }
});
document.addEventListener('DOMContentLoaded', () => { carregarPerfil(); configurarAbas(); configurarEdicaoPerfil(); });