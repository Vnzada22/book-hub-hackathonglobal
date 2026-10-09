const STORAGE_KEY = 'bookhub_wallet_user';

const formLogin = document.getElementById('formLogin');
const formRegister = document.getElementById('formRegister');
const linkIrCadastro = document.getElementById('linkIrCadastro');
const linkIrLogin = document.getElementById('linkIrLogin');
const btnConectarMetaMask = document.getElementById('btnConectarMetaMask');

const registerAvatarGrid = document.getElementById('registerAvatarGrid');
const avatarOptions = registerAvatarGrid.querySelectorAll('.avatar-option');
const regAvatarInput = document.getElementById('regAvatar');

// Alternar entre Telas
linkIrCadastro.addEventListener('click', async (e) => {
  e.preventDefault();
  await tentarDetectarCarteiraParaCadastro();
});

linkIrLogin.addEventListener('click', (e) => {
  e.preventDefault();
  formRegister.style.display = 'none';
  formLogin.style.display = 'block';
});

// Seleção de Avatar
avatarOptions.forEach(img => {
  img.addEventListener('click', () => {
    avatarOptions.forEach(opt => opt.classList.remove('selected'));
    img.classList.add('selected');
    regAvatarInput.value = img.getAttribute('data-src');
  });
});

// BOTÃO PRINCIPAL DE LOGIN: Conecta a carteira e verifica se já existe cadastro
btnConectarMetaMask.addEventListener('click', async () => {
  if (!window.ethereum) {
    alert('Extensão MetaMask não encontrada no navegador. Por favor, instale-a.');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      alert('Nenhuma conta MetaMask autorizada.');
      return;
    }

    const wallet = accounts[0].toLowerCase();

    // Envia ao servidor para verificar se o usuário já tem cadastro
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet })
    });
    
    const data = await res.json();
    
    if (data.novoUsuario) {
      // Se não tem cadastro, pula direto para a tela de registro com a carteira preenchida
      alert('Carteira reconhecida, mas você ainda não tem cadastro. Vamos criá-lo agora!');
      document.getElementById('regWallet').value = wallet;
      formLogin.style.display = 'none';
      formRegister.style.display = 'block';
    } else if (data.usuario) {
      // Se já tem cadastro, entra direto na vitrine
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.usuario));
      window.location.href = '/';
    } else {
      alert(data.erro || 'Erro ao validar carteira.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao conectar com a MetaMask.');
  }
});

async function tentarDetectarCarteiraParaCadastro() {
  if (!window.ethereum) {
    alert('MetaMask não encontrada.');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts && accounts.length > 0) {
      document.getElementById('regWallet').value = accounts[0].toLowerCase();
      formLogin.style.display = 'none';
      formRegister.style.display = 'block';
    }
  } catch (e) {
    alert('Permissão negada pela MetaMask.');
  }
}

// Envio do Cadastro
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    wallet: document.getElementById('regWallet').value.trim(),
    nome: document.getElementById('regNome').value.trim(),
    username: document.getElementById('regUsername').value.trim(),
    email: document.getElementById('regEmail').value.trim(),
    senha: document.getElementById('regSenha').value,
    avatar: regAvatarInput.value
  };

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (res.ok && data.usuario) {
      alert('Cadastro realizado com sucesso! Bem-vindo ao BookHub.');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.usuario));
      window.location.href = '/';
    } else {
      alert(data.erro || 'Erro ao realizar cadastro.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão com o servidor.');
  }
});