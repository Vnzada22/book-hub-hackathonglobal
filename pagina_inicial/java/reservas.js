const tbodyReservas = document.querySelector('#tabelaReservas tbody');
const filtroStatus = document.getElementById('filtroStatus');
const filtroBusca = document.getElementById('filtroBusca');
const filtroDataInicio = document.getElementById('filtroDataInicio');
const filtroDataFim = document.getElementById('filtroDataFim');
const btnLimparFiltros = document.getElementById('btnLimparFiltros');
const badgePendentes = document.getElementById('badgePendentes');
const contadorPendentes = document.getElementById('contadorPendentes');

let todasReservas = [];

async function carregarReservas() {
  try {
    const res = await fetch('/api/reservas');
    const reservas = await res.json();
    if (!res.ok) throw new Error(reservas.erro || 'Não foi possível carregar as reservas.');
    
    todasReservas = reservas;
    atualizarBadgePendentes();
    aplicarFiltros();
  } catch (err) {
    console.error('Erro ao carregar reservas:', err);
    tbodyReservas.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.textAlign = 'center';
    td.style.color = 'var(--net-red)';
    td.textContent = err.message || 'Erro ao carregar reservas.';
    tr.appendChild(td);
    tbodyReservas.appendChild(tr);
  }
}

function atualizarBadgePendentes() {
  const pendentes = todasReservas.filter(r => r.status === 'Pendente').length;
  if (pendentes > 0) {
    contadorPendentes.textContent = pendentes;
    badgePendentes.hidden = false;
  } else {
    badgePendentes.hidden = true;
  }
}

function aplicarFiltros() {
  const status = filtroStatus.value;
  const busca = filtroBusca.value.toLowerCase().trim();
  const dataInicio = filtroDataInicio.value ? new Date(filtroDataInicio.value) : null;
  const dataFim = filtroDataFim.value ? new Date(filtroDataFim.value) : null;
  
  if (dataFim) dataFim.setHours(23, 59, 59, 999);
  
  let filtradas = todasReservas;
  
  if (status) {
    filtradas = filtradas.filter(r => r.status === status);
  }
  
  if (busca) {
    filtradas = filtradas.filter(r => 
      (r.titulo && r.titulo.toLowerCase().includes(busca)) ||
      (r.usuario_nome && r.usuario_nome.toLowerCase().includes(busca)) ||
      (r.usuario_email && r.usuario_email.toLowerCase().includes(busca))
    );
  }
  
  if (dataInicio) {
    filtradas = filtradas.filter(r => r.data_pedido && new Date(r.data_pedido) >= dataInicio);
  }
  
  if (dataFim) {
    filtradas = filtradas.filter(r => r.data_pedido && new Date(r.data_pedido) <= dataFim);
  }
  
  renderizarTabela(filtradas);
}

function renderizarTabela(reservas) {
  tbodyReservas.replaceChildren();
  
  if (reservas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.textAlign = 'center';
    td.style.color = 'var(--net-gray)';
    td.textContent = 'Nenhuma pré-reserva encontrada com os filtros atuais.';
    tr.appendChild(td);
    tbodyReservas.appendChild(tr);
    return;
  }
  
  reservas.forEach(r => {
    const tr = document.createElement('tr');
    
    let corStatus = '#f59e0b'; // Pendente
    if (r.status === 'Aprovado') corStatus = '#10b981';
    if (r.status === 'Rejeitado') corStatus = '#E50914';
    
    const dataFormatada = r.data_pedido ? new Date(r.data_pedido).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '-';
    
    // Criar células usando createElement e textContent (seguro contra XSS)
    const tdTitulo = document.createElement('td');
    const strongTitulo = document.createElement('strong');
    strongTitulo.textContent = r.titulo;
    tdTitulo.appendChild(strongTitulo);
    
    const tdUsuario = document.createElement('td');
    tdUsuario.textContent = r.usuario_nome;
    
    const tdData = document.createElement('td');
    tdData.style.color = 'var(--net-gray-light)';
    tdData.style.fontSize = '13px';
    tdData.textContent = dataFormatada;
    
    const tdStatus = document.createElement('td');
    const spanStatus = document.createElement('span');
    spanStatus.style.fontWeight = 'bold';
    spanStatus.style.color = corStatus;
    spanStatus.textContent = r.status;
    tdStatus.appendChild(spanStatus);
    
    const tdMotivo = document.createElement('td');
    tdMotivo.textContent = r.motivo || '-';
    
    const tdAcoes = document.createElement('td');
    
    if (r.status === 'Pendente') {
      const btnAprovar = document.createElement('button');
      btnAprovar.className = 'btn-aprovar';
      btnAprovar.textContent = 'Aprovar';
      btnAprovar.addEventListener('click', () => mudarStatus(r.id, 'Aprovado'));
      
      const btnRejeitar = document.createElement('button');
      btnRejeitar.className = 'btn-rejeitar';
      btnRejeitar.textContent = 'Rejeitar';
      btnRejeitar.addEventListener('click', () => pedirMotivoRejeicao(r.id));
      
      tdAcoes.append(btnAprovar, btnRejeitar);
    } else {
      const spanProcessado = document.createElement('span');
      spanProcessado.style.color = 'var(--net-gray)';
      spanProcessado.style.fontSize = '12px';
      spanProcessado.textContent = 'Processado';
      tdAcoes.appendChild(spanProcessado);
    }
    
    tr.append(tdTitulo, tdUsuario, tdData, tdStatus, tdMotivo, tdAcoes);
    tbodyReservas.appendChild(tr);
  });
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
      const data = await res.json();
      alert(data.erro || 'Erro ao atualizar status da reserva.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro de conexão com o servidor.');
  }
};

// Event listeners para filtros
filtroStatus.addEventListener('change', aplicarFiltros);
filtroBusca.addEventListener('input', () => {
  clearTimeout(filtroBusca.debounce);
  filtroBusca.debounce = setTimeout(aplicarFiltros, 300);
});
filtroDataInicio.addEventListener('change', aplicarFiltros);
filtroDataFim.addEventListener('change', aplicarFiltros);

btnLimparFiltros.addEventListener('click', () => {
  filtroStatus.value = '';
  filtroBusca.value = '';
  filtroDataInicio.value = '';
  filtroDataFim.value = '';
  aplicarFiltros();
});

carregarReservas();