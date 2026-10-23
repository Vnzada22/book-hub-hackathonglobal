// --- EFEITO INTERATIVO DO MOUSE NO CANVAS DE FUNDO ---
const canvas = document.getElementById('interactiveCanvas');
const ctx = canvas.getContext('2d');

let width, height;
let particles = [];
let mouse = { x: null, y: null, radius: 120 };

function resizeCanvas() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

window.addEventListener('mouseout', () => {
  mouse.x = null;
  mouse.y = null;
});

class Particle {
  constructor() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = Math.random() * 2 + 1;
    this.baseX = this.x;
    this.baseY = this.y;
    this.density = (Math.random() * 20) + 5;
    this.color = Math.random() > 0.5 ? 'rgba(229, 9, 20, 0.4)' : 'rgba(255, 255, 255, 0.15)';
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  update() {
    if (mouse.x !== null && mouse.y !== null) {
      let dx = mouse.x - this.x;
      let dy = mouse.y - this.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < mouse.radius) {
        let forceDirectionX = dx / distance;
        let forceDirectionY = dy / distance;
        let force = (mouse.radius - distance) / mouse.radius;
        let directionX = forceDirectionX * force * this.density;
        let directionY = forceDirectionY * force * this.density;
        this.x -= directionX;
        this.y -= directionY;
      } else {
        if (this.x !== this.baseX) {
          let dx = this.x - this.baseX;
          this.x -= dx / 15;
        }
        if (this.y !== this.baseY) {
          let dy = this.y - this.baseY;
          this.y -= dy / 15;
        }
      }
    }
  }
}

function initParticles() {
  particles = [];
  let numberOfParticles = (width * height) / 12000;
  for (let i = 0; i < numberOfParticles; i++) {
    particles.push(new Particle());
  }
}
initParticles();

function animateParticles() {
  ctx.clearRect(0, 0, width, height);
  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();


// --- RANKING MENSAL E ARQUIVO DE TEMPORADAS ---
const seasonSelector = document.getElementById('seasonSelector');
const seasonStatusText = document.getElementById('seasonStatusText');
const rankingProof = document.getElementById('rankingProof');
const rankingTitle = document.getElementById('rankingTitle');

async function carregarTemporadas() {
  try {
    const res = await fetch('/api/ranking/temporadas');
    if (!res.ok) throw new Error('Não foi possível carregar as temporadas.');
    const temporadas = await res.json();
    seasonSelector.replaceChildren();

    temporadas.forEach(temporada => {
      const option = document.createElement('option');
      option.value = temporada.season_key;
      option.textContent = `${temporada.season_key} · ${temporada.status === 'active' ? 'Em andamento' : 'Encerrada'}`;
      option.dataset.closedAt = temporada.closed_at || '';
      option.dataset.resultsHash = temporada.results_hash || '';
      seasonSelector.appendChild(option);
    });

    if (temporadas.length) {
      await carregarRanking(temporadas[0].season_key, temporadas[0]);
    } else {
      renderizarRanking([]);
    }
  } catch (err) {
    console.error('Erro ao carregar dados do ranking:', err);
    seasonStatusText.textContent = err.message;
  }
}

async function carregarRanking(seasonKey, seasonInfo) {
  try {
    const res = await fetch(`/api/ranking?temporada=${encodeURIComponent(seasonKey)}`);
    const ranking = await res.json();
    if (!res.ok) throw new Error(ranking.erro || 'Ranking indisponível no momento.');

    const rankingArray = ranking.map(usuario => ({
      usuarioId: Number(usuario.usuario_id),
      nome: usuario.nome || usuario.username || usuario.login || 'Usuário',
      pontos: Number(usuario.pontos || 0),
      posicao: Number(usuario.posicao),
      avatar: usuario.avatar || '/img/avatar1.png'
    }));
    renderizarRanking(rankingArray);
    rankingTitle.textContent = `Classificação de ${seasonKey}`;
    seasonStatusText.textContent = seasonInfo.status === 'active'
      ? 'Temporada em andamento. Os pontos são registrados no BookHub.'
      : `Temporada encerrada em ${new Date(seasonInfo.closed_at).toLocaleDateString('pt-BR')}.`;
    if (seasonInfo.status === 'closed' && seasonInfo.results_hash) {
      rankingProof.hidden = false;
      rankingProof.textContent = `Resumo de integridade SHA-256 Merkle: ${seasonInfo.results_hash} · Ainda não publicado em blockchain.`;
    } else {
      rankingProof.hidden = true;
      rankingProof.textContent = '';
    }
  } catch (err) {
    console.error('Erro ao carregar classificação:', err);
    seasonStatusText.textContent = err.message;
    renderizarRanking([]);
  }
}

function renderizarRanking(ranking) {
  if (ranking.length === 0) {
    renderizarPodium([]);
    const tbody = document.getElementById('rankingTableBody');
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Ainda não há pontos registrados nesta temporada.';
    row.appendChild(cell);
    tbody.replaceChildren(row);
    return;
  }
  renderizarPodium(ranking.filter(usuario => usuario.posicao <= 3));
  renderizarTabela(ranking.filter(usuario => usuario.posicao > 3));
}

function renderizarPodium(top3) {
  const podiumSection = document.getElementById('podiumSection');
  podiumSection.replaceChildren();
  const classes = { 1: 'first', 2: 'second', 3: 'third' };
  [2, 1, 3].forEach(posicao => {
    const leitor = top3.find(usuario => usuario.posicao === posicao);
    const card = document.createElement('div');
    card.className = `podium-card ${classes[posicao]}${leitor ? '' : ' podium-card-empty'}`;
    const badge = document.createElement('div');
    badge.className = 'podium-badge';
    badge.textContent = `${posicao}º`;
    card.appendChild(badge);
    if (!leitor) {
      const vazio = document.createElement('div');
      vazio.className = 'podium-empty-label';
      vazio.textContent = 'Aguardando leitor';
      card.appendChild(vazio);
      podiumSection.appendChild(card);
      return;
    }

    const avatar = document.createElement('img');
    avatar.src = leitor.avatar;
    avatar.className = 'podium-avatar';
    avatar.alt = `Avatar de ${leitor.nome}`;
    const nome = document.createElement('div');
    nome.className = 'podium-name';
    nome.title = leitor.nome;
    nome.textContent = leitor.nome;
    const pontuacao = document.createElement('div');
    pontuacao.className = 'podium-score';
    const pontos = document.createElement('b');
    pontos.textContent = String(leitor.pontos);
    pontuacao.append(pontos, ' pontos');
    card.append(avatar, nome, pontuacao);
    podiumSection.appendChild(card);
  });
}

function renderizarTabela(resto) {
  const tbody = document.getElementById('rankingTableBody');
  tbody.innerHTML = '';

  if (resto.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Nenhum outro leitor no ranking ainda.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  resto.forEach((leitor, idx) => {
    const posicaoReal = leitor.posicao || idx + 4;
    const tr = document.createElement('tr');
    const posicao = document.createElement('span');
    posicao.className = 'pos-number';
    posicao.textContent = `${posicaoReal}º`;
    const posicaoCell = document.createElement('td');
    posicaoCell.appendChild(posicao);

    const leitorCell = document.createElement('td');
    const userCell = document.createElement('div');
    userCell.className = 'user-cell';
    const avatar = document.createElement('img');
    avatar.src = leitor.avatar;
    avatar.alt = `Avatar de ${leitor.nome}`;
    const nome = document.createElement('span');
    nome.textContent = leitor.nome;
    userCell.append(avatar, nome);
    leitorCell.appendChild(userCell);

    const pontos = document.createElement('b');
    pontos.textContent = String(leitor.pontos);
    const pontosCell = document.createElement('td');
    pontosCell.append(pontos, ' pontos');
    const reconhecimento = document.createElement('td');
    reconhecimento.textContent = 'Leitor BookHub';
    tr.append(posicaoCell, leitorCell, pontosCell, reconhecimento);
    tbody.appendChild(tr);
  });
}

seasonSelector.addEventListener('change', () => {
  const selected = seasonSelector.selectedOptions[0];
  const status = selected?.textContent.includes('Encerrada') ? 'closed' : 'active';
  carregarRanking(seasonSelector.value, {
    status,
    closed_at: selected?.dataset.closedAt || null,
    results_hash: selected?.dataset.resultsHash || null
  });
});

carregarTemporadas();