const tbodyReservas = document.querySelector('#tabelaReservas tbody');

async function carregarReservas() {
  try {
    const res = await fetch('/api/reservas');
    const reservas = await res.json();
    tbodyReservas.innerHTML = '';

    if (reservas.length === 0) {
      tbodyReservas.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--net-gray);">Nenhuma pré-reserva encontrada.</td></tr>';
      return;
    }

    reservas.forEach(r => {
      const tr = document.createElement('tr');
      
      let corStatus = '#f59e0b'; // Pendente
      if (r.status === 'Aprovado') corStatus = '#10b981';
      if (r.status === 'Rejeitado') corStatus = '#E50914';

      // Formata a data se existir
      const dataFormatada = r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '-';

      tr.innerHTML = `
        <td><strong>${r.titulo}</strong></td>
        <td>${r.usuario_nome}</td>
        <td style="color: var(--net-gray-light); font-size: 13px;">${dataFormatada}</td>
        <td><span style="font-weight: bold; color: ${corStatus};">${r.status}</span></td>
        <td>${r.motivo || '-'}</td>
        <td>
          ${r.status === 'Pendente' ? `
            <button class="btn-aprovar" onclick="mudarStatus(${r.id}, 'Aprovado')">Aprovar</button>
            <button class="btn-rejeitar" onclick="pedirMotivoRejeicao(${r.id})">Rejeitar</button>
          ` : '<span style="color: var(--net-gray); font-size: 12px;">Processado</span>'}
        </td>
      `;
      tbodyReservas.appendChild(tr);
    });
  } catch (err) {
    console.error('Erro ao carregar reservas:', err);
  }
}

window.pedirMotivoRejeicao = async (idReserva) => {
  const motivo = prompt('Informe o motivo de não aceitar a reserva:');
  if (motivo === null) return; 

  await mudarStatus(idReserva, 'Rejeitado', motivo || 'Não informado');
};

window.mudarStatus = async (id, status, motivo = '') => {
  try {
    const res = await fetch(`/api/reservas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, motivo })
    });

    if (res.ok) {
      carregarReservas();
    } else {
      alert('Erro ao atualizar status da reserva.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão com o servidor.');
  }
};

carregarReservas();