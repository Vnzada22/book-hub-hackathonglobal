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


// --- CARREGAMENTO DO RANKING REAL DO BANCO DE DADOS ---
async function carregarRanking() {
  try {
    const res = await fetch('/api/ranking');
    if (!res.ok) {
      throw new Error('Ranking indisponível no momento.');
    }

    const ranking = await res.json();
    let rankingArray = Array.isArray(ranking) ? ranking : [];

    rankingArray = rankingArray
      .map((usuario) => ({
        nome: usuario.nome || usuario.username || usuario.login || 'Usuário',
        total: Number(usuario.pontos || usuario.livros_lidos || 0),
        avatar: usuario.avatar || '/img/avatar1.png'
      }))
      .filter((usuario) => usuario.nome && usuario.nome !== 'Usuário')
      .sort((a, b) => b.total - a.total);

    if (rankingArray.length === 0) {
      const emptyMessage = document.getElementById('emptyRankingState');
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
      document.getElementById('podiumSection').innerHTML = '';
      document.getElementById('rankingTableBody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #737373; padding: 20px;">Nenhum usuário cadastrado no ranking ainda.</td></tr>';
      return;
    }

    renderizarPodium(rankingArray.slice(0, 3));
    renderizarTabela(rankingArray.slice(3));

  } catch (err) {
    console.error('Erro ao carregar dados do ranking:', err);
  }
}

function renderizarPodium(top3) {
  const podiumSection = document.getElementById('podiumSection');
  podiumSection.innerHTML = '';

  if (top3.length === 1) {
    const leitor = top3[0];
    const card = document.createElement('div');
    card.className = 'podium-card first';
    card.innerHTML = `
      <div class="podium-badge">1º</div>
      <img src="${leitor.avatar}" class="podium-avatar" alt="Avatar">
      <div class="podium-name" title="${leitor.nome}">${leitor.nome}</div>
      <div class="podium-score"><b>${leitor.total}</b> pontos</div>
    `;
    podiumSection.appendChild(card);
    return;
  }

  // Ordem visual elegante para o pódio: 2º lugar, 1º lugar, 3º lugar
  const ordemVisual = [top3[1] ?? top3[0], top3[0], top3[2] ?? null].filter(Boolean);
  const classesPos = ['second', 'first', 'third'];
  const posNumeros = [2, 1, 3];

  ordemVisual.forEach((leitor, index) => {
    if (!leitor) return;
    const originalPos = posNumeros[index];
    const cardClass = classesPos[index];

    const card = document.createElement('div');
    card.className = `podium-card ${cardClass}`;
    card.innerHTML = `
      <div class="podium-badge">${originalPos}º</div>
      <img src="${leitor.avatar}" class="podium-avatar" alt="Avatar">
      <div class="podium-name" title="${leitor.nome}">${leitor.nome}</div>
      <div class="podium-score"><b>${leitor.total}</b> pontos</div>
    `;
    podiumSection.appendChild(card);
  });
}

function renderizarTabela(resto) {
  const tbody = document.getElementById('rankingTableBody');
  tbody.innerHTML = '';

  if (resto.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #737373; padding: 20px;">Nenhum outro leitor no ranking ainda.</td></tr>`;
    return;
  }

  resto.forEach((leitor, idx) => {
    const posicaoReal = idx + 4;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pos-number">${posicaoReal}º</span></td>
      <td>
        <div class="user-cell">
          <img src="${leitor.avatar}" alt="Avatar">
          <span>${leitor.nome}</span>
        </div>
      </td>
      <td><b>${leitor.total}</b> obras</td>
      <td><span style="color: #a1a1aa; font-size: 13px;">Leitor Dedicado</span></td>
    `;
    tbody.appendChild(tr);
  });
}

carregarRanking();