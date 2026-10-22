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
  document.getElementById('infoWallet').textContent = user.walletAddress || user.wallet_address || '-';
  document.getElementById('avatarDisplay').src = user.avatar || '/img/avatar1.png';

  carregarHistorico(user.walletAddress || user.wallet_address);
}

async function carregarHistorico(wallet) {
  try {
    const res = await fetch(`/api/reservas/usuario?wallet=${wallet}`);
    const reservas = await res.json();
    const tbody = document.getElementById('tabelaHistorico');
    tbody.innerHTML = '';
    if (reservas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">Nenhum livro reservado.</td></tr>'; return;
    }
    reservas.forEach(r => {
      const tr = document.createElement('tr');
      const data = new Date(r.data_pedido).toLocaleDateString('pt-BR');
      let cor = r.status === 'Aprovado' ? '#10b981' : (r.status === 'Rejeitado' ? '#e50914' : '#f59e0b');
      tr.innerHTML = `<td>${r.titulo}</td><td style="color: ${cor}; font-weight: 700;">${r.status}</td><td>${data}</td>`;
      tbody.appendChild(tr);
    });
  } catch (err) {}
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
    document.getElementById('editWallet').value = user.walletAddress || user.wallet_address;
    document.getElementById('editNome').value = user.nome || '';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editSenha').value = ''; 
    
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

document.getElementById('btnDesconectar').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); window.location.href = '/'; });
document.addEventListener('DOMContentLoaded', () => { carregarPerfil(); configurarAbas(); configurarEdicaoPerfil(); });