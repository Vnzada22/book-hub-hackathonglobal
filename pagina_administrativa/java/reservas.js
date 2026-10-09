// Executado ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  configurarTema();
  carregarReservas();
});

function configurarTema() {
  const toggleDark = document.getElementById('toggleDark');
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = savedTheme ? savedTheme === 'dark' : prefersDark;

  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  toggleDark.checked = dark;
  toggleDark.addEventListener('change', () => {
    const isDark = toggleDark.checked;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

// Busca a lista de reservas na API (Node.js)
async function carregarReservas() {
  try {
    const resposta = await fetch('/api/reservas');
    const reservas = await resposta.json();
    
    renderizarTabela(reservas);
  } catch (erro) {
    console.error('Erro ao buscar reservas:', erro);
  }
}

// Renderiza as linhas dinamicamente na tabela
function renderizarTabela(reservas) {
  const tbody = document.getElementById('tabela-reservas');
  tbody.innerHTML = '';

  if (reservas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Nenhuma reserva encontrada.</td></tr>';
    return;
  }

  reservas.forEach(reserva => {
    const tr = document.createElement('tr');

    // Define cor e texto da tag de status
    let statusClass = 'badge-pendente';
    if (reserva.status === 'Aceita') statusClass = 'badge-aceita';
    if (reserva.status === 'Recusada') statusClass = 'badge-recusada';

    tr.innerHTML = `
      <td>#${reserva.id}</td>
      <td>${reserva.nome_aluno}</td>
      <td>${reserva.titulo_livro}</td>
      <td>${reserva.data_reserva}</td>
      <td><span class="badge ${statusClass}">${reserva.status}</span></td>
      <td>
        ${reserva.status === 'Pendente' ? `
          <button class="btn-action btn-approve" onclick="alterarStatus(${reserva.id}, 'Aceita')">Aceitar</button>
          <button class="btn-action btn-reject" onclick="alterarStatus(${reserva.id}, 'Recusada')">Recusar</button>
        ` : '<em>Concluído</em>'}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// Envia a decisão (Aceitar/Recusar) para o servidor
async function alterarStatus(idReserva, novoStatus) {
  try {
    const resposta = await fetch(`/api/reservas/${idReserva}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus })
    });

    if (resposta.ok) {
      alert(`Reserva #${idReserva} atualizada para: ${novoStatus}`);
      carregarReservas(); // Recarrega a tabela na tela
    } else {
      alert('Erro ao atualizar o status da reserva.');
    }
  } catch (erro) {
    console.error('Erro na requisição:', erro);
  }
}

const tbodyReservas = document.querySelector('#tabelaReservas tbody');

async function carregarReservas() {
  try {
    const res = await fetch('/api/reservas');
    const reservas = await res.json();
    tbodyReservas.innerHTML = '';

    if (reservas.length === 0) {
      tbodyReservas.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #808080;">Nenhuma pré-reserva pendente.</td></tr>';
      return;
    }

    reservas.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.titulo}</td>
        <td>${r.usuario_nome}</td>
        <td><span style="font-weight: bold; color: ${r.status === 'Pendente' ? '#f59e0b' : '#10b981'};">${r.status}</span></td>
        <td>
          ${r.status === 'Pendente' ? `
            <button class="btn-editar" onclick="mudarStatus(${r.id}, 'Aprovado')">Aprovar</button>
            <button class="btn-excluir" onclick="mudarStatus(${r.id}, 'Rejeitado')">Rejeitar</button>
          ` : '<span>Finalizado</span>'}
        </td>
      `;
      tbodyReservas.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar reservas:', err);
  }
}

window.mudarStatus = async (id, status) => {
  try {
    const res = await fetch(`/api/reservas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      carregarReservas();
    } else {
      alert('Erro ao atualizar status da reserva.');
    }
  } catch (err) {
    console.error(err);
  }
};

carregarReservas();