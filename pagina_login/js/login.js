const STORAGE_KEY = 'bookhub_wallet_user';

const formLogin = document.getElementById('formLogin');
const formOtp = document.getElementById('formOtp');
const formRegister = document.getElementById('formRegister');
const authMessage = document.getElementById('authMessage');
const loginEmail = document.getElementById('loginEmail');
const otpCode = document.getElementById('otpCode');
const registerAvatarGrid = document.getElementById('registerAvatarGrid');
const regAvatarInput = document.getElementById('regAvatar');

let activeEmail = '';
let verificationTicket = '';
let pendingWallet = '';
let walletTicket = '';
let pendingOAuthTicket = '';
let resendTimer;
let resendSeconds = 0;

function showMessage(message, isError = true) {
  authMessage.textContent = message;
  authMessage.hidden = !message;
  authMessage.classList.toggle('is-error', isError);
  authMessage.classList.toggle('is-success', !isError);
}

function showForm(form) {
  [formLogin, formOtp, formRegister].forEach((item) => {
    item.hidden = item !== form;
  });
  showMessage('');
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.erro || 'Não foi possível concluir a solicitação.');
  return data;
}

function saveUser(usuario) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usuario));
  window.location.href = '/';
}

function startResendCountdown(seconds = 60) {
  clearInterval(resendTimer);
  resendSeconds = seconds;
  const button = document.getElementById('btnReenviarCodigo');
  const countdown = document.getElementById('resendCountdown');
  button.disabled = true;
  const tick = () => {
    countdown.textContent = resendSeconds > 0 ? ` (${resendSeconds}s)` : '';
    button.disabled = resendSeconds > 0;
    if (resendSeconds <= 0) {
      clearInterval(resendTimer);
      return;
    }
    resendSeconds -= 1;
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function sendVerificationCode() {
  const email = activeEmail;
  if (!email) return;

  try {
    await readResponse(await fetch('/api/auth/email/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }));
    showMessage('Enviamos um novo código para seu e-mail.', false);
    startResendCountdown();
  } catch (error) {
    showMessage(error.message);
  }
}

formLogin.addEventListener('submit', async (event) => {
  event.preventDefault();
  activeEmail = loginEmail.value.trim().toLowerCase();
  if (!activeEmail) return;

  const button = formLogin.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await readResponse(await fetch('/api/auth/email/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: activeEmail })
    }));
    document.getElementById('otpEmailLabel').textContent = activeEmail;
    showForm(formOtp);
    otpCode.focus();
    startResendCountdown();
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('btnVoltarEmail').addEventListener('click', () => {
  clearInterval(resendTimer);
  showForm(formLogin);
});

document.getElementById('btnReenviarCodigo').addEventListener('click', sendVerificationCode);

formOtp.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = formOtp.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const data = await readResponse(await fetch('/api/auth/email/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: activeEmail,
        code: otpCode.value.trim(),
        ...(pendingOAuthTicket ? { oauthTicket: pendingOAuthTicket } : {})
      })
    }));

    clearInterval(resendTimer);
    if (data.usuario) {
      saveUser(data.usuario);
      return;
    }

    verificationTicket = data.verificationTicket;
    pendingOAuthTicket = data.oauthTicket || pendingOAuthTicket;
    document.getElementById('registerEmailLabel').textContent = activeEmail;
    if (pendingOAuthTicket) {
      document.getElementById('regNome').value ||= 'Leitor BookHub';
    }
    showForm(formRegister);
    document.getElementById('regNome').focus();
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('btnVoltarCodigo').addEventListener('click', () => showForm(formOtp));

registerAvatarGrid.querySelectorAll('.avatar-option').forEach((avatar) => {
  avatar.addEventListener('click', () => {
    registerAvatarGrid.querySelectorAll('.avatar-option').forEach((item) => item.classList.remove('selected'));
    avatar.classList.add('selected');
    regAvatarInput.value = avatar.dataset.src;
  });
});

formRegister.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = formRegister.querySelector('[type="submit"]');
  button.disabled = true;
  const payload = {
    email: activeEmail,
    nome: document.getElementById('regNome').value.trim(),
    username: document.getElementById('regUsername').value.trim(),
    avatar: regAvatarInput.value,
    wallet: pendingWallet,
    verificationTicket,
    walletTicket,
    oauthTicket: pendingOAuthTicket
  };

  try {
    const data = await readResponse(await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    saveUser(data.usuario);
  } catch (error) {
    showMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('btnConectarMetaMask').addEventListener('click', async () => {
  if (!window.ethereum) {
    showMessage('MetaMask não encontrada. Instale a extensão ou escolha outra forma de entrar.');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error('Nenhuma conta MetaMask autorizada.');
    const wallet = accounts[0].toLowerCase();
    const challenge = await readResponse(await fetch('/api/auth/wallet/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet })
    }));
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [challenge.message, accounts[0]]
    });
    const data = await readResponse(await fetch('/api/auth/wallet/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, message: challenge.message, signature })
    }));

    if (data.usuario) {
      saveUser(data.usuario);
      return;
    }

    pendingWallet = wallet;
    walletTicket = data.walletTicket;
    if (!walletTicket) throw new Error('Não foi possível confirmar a carteira. Tente novamente.');
    showMessage('Carteira conectada. Informe seu e-mail para verificar e criar a conta.', false);
    loginEmail.focus();
  } catch (error) {
    showMessage(error.message || 'Não foi possível conectar à MetaMask.');
  }
});

async function completeOAuthLogin() {
  const params = new URLSearchParams(window.location.search);
  const oauthCode = params.get('oauth_code');
  const oauthError = params.get('oauth_error');
  if (oauthError) {
    showMessage(params.get('message') || 'Não foi possível entrar com esse provedor.');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }
  if (!oauthCode) return;

  try {
    const data = await readResponse(await fetch('/api/auth/oauth/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: oauthCode })
    }));
    window.history.replaceState({}, '', window.location.pathname);
    if (data.requiresEmailVerification) {
      pendingOAuthTicket = data.oauthTicket;
      formLogin.querySelector('h1').textContent = 'Confirme seu e-mail';
      formLogin.querySelector('.login-subtitle').textContent = 'Informe o e-mail que deseja vincular à sua conta do X. Enviaremos um código para confirmar que ele é seu.';
      showMessage('Conta do X confirmada. Falta verificar seu e-mail para concluir o acesso.', false);
      loginEmail.focus();
      return;
    }
    saveUser(data.usuario);
  } catch (error) {
    showMessage(error.message);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

completeOAuthLogin();
