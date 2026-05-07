// ============================================
// LA VIE CASAMENTOS - SCRIPT COMPLETO COM FIREBASE
// ============================================

import { 
    auth,
    loginWithGoogle, loginWithEmail, registerWithEmail, logoutUser,
    createEvent, getUserEvents, updateEvent, deleteEvent,
    createGuest, getEventGuests, updateGuest, deleteGuest,
    createSupplier, getEventSuppliers, updateSupplier, deleteSupplier,
    createTask, getUserTasks, updateTask, deleteTask, toggleTaskComplete,
    updateUserProfile, getUserProfile, onAuthChange,
    sendPasswordResetEmailFunction, sendVerificationEmail,
    createDefaultTasksForEvent
} from './firebase-config.js';

// ============================================
// ESTADO GLOBAL
// ============================================
let state = {
    user: null,
    events: [],
    guests: [],
    suppliers: [],
    tasks: [],
    selectedEvent: null,
    showEventForm: false,
    showGuestForm: false,
    showSupplierForm: false,
    showTaskForm: false,
    editingEvent: null,
    editingGuest: null,
    editingSupplier: null,
    editingTask: null,
    authMode: 'login',
    activeTab: 'dashboard',
    taskFilter: 'all',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    charts: {}
};

// ============================================
// FUNÇÃO AUXILIAR PARA ESCAPAR HTML
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// FUNÇÃO DE RECUPERAÇÃO DE SENHA
// ============================================

window.forgotPassword = async function() {
    const email = prompt('Digite seu e-mail para recuperar a senha:');
    if (!email || !email.includes('@')) {
        alert('Por favor, digite um e-mail válido');
        return;
    }
    const result = await sendPasswordResetEmailFunction(email);
    if (result.success) {
        alert('Email de recuperação enviado! Verifique sua caixa de entrada.');
    } else {
        alert(result.error === 'auth/user-not-found' ? 'Usuário não encontrado' : 'Erro ao enviar email');
    }
};

// ============================================
// FUNÇÃO PARA REENVIAR VERIFICAÇÃO DE EMAIL
// ============================================

window.resendVerification = async function() {
    const email = prompt('Digite seu e-mail para receber um novo link de verificação:');
    if (!email || !email.includes('@')) {
        alert('Por favor, digite um e-mail válido');
        return;
    }
    const result = await loginWithEmail(email, 'dummy');
    if (result.error === 'email-not-verified') {
        const sendResult = await sendVerificationEmail();
        alert(sendResult.success ? 'Novo email enviado!' : 'Erro ao enviar');
    } else {
        alert(result.success ? 'Email já verificado!' : 'Usuário não encontrado');
    }
};

// ============================================
// VERIFICAR E CRIAR TAREFAS PADRÃO
// ============================================

async function ensureEventHasTasks(eventId) {
    const tasks = await getUserTasks(state.user.id, eventId);
    if (tasks.length === 0) {
        await createDefaultTasksForEvent(state.user.id, eventId);
        return true;
    }
    return false;
}

// ============================================
// EXPORTAÇÃO DE CONVIDADOS PARA EXCEL
// ============================================

window.exportGuestsToExcel = function() {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    if (state.guests.length === 0) {
        alert('Nenhum convidado para exportar!');
        return;
    }
    
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventName = currentEvent?.name || currentEvent?.couple_names || 'Evento';
    const confirmados = state.guests.filter(g => g.status === 'confirmado').length;
    const pendentes = state.guests.filter(g => g.status === 'pendente').length;
    const recusados = state.guests.filter(g => g.status === 'recusado').length;
    
    const headers = ['Nome do Convidado', 'Grupo/Família', 'Status', 'Mesa', 'Telefone', 'Data de Cadastro'];
    const csvRows = [headers.join(',')];
    
    for (const guest of state.guests) {
        csvRows.push([
            `"${guest.name || ''}"`,
            `"${guest.group_name || ''}"`,
            guest.status === 'confirmado' ? 'Confirmado' : guest.status === 'recusado' ? 'Recusado' : 'Pendente',
            `"${guest.table_name || ''}"`,
            `"${guest.phone || ''}"`,
            new Date(guest.created_at || Date.now()).toLocaleDateString('pt-BR')
        ].join(','));
    }
    
    csvRows.push('');
    csvRows.push('"RESUMO DO EVENTO"');
    csvRows.push(`"Evento:","${eventName}"`);
    csvRows.push(`"Total de Convidados:","${state.guests.length}"`);
    csvRows.push(`"Confirmados:","${confirmados}"`);
    csvRows.push(`"Pendentes:","${pendentes}"`);
    csvRows.push(`"Recusados:","${recusados}"`);
    csvRows.push(`"Taxa de Confirmação:","${((confirmados / state.guests.length) * 100).toFixed(1)}%"`);
    
    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `convidados_${eventName.replace(/[^a-z0-9]/gi, '_')}_${dataAtual}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    showNotification(`${state.guests.length} convidados exportados!`, 'success');
};

// ============================================
// EXPORTAÇÃO DE FORNECEDORES PARA EXCEL
// ============================================

window.exportSuppliersToExcel = function() {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    if (state.suppliers.length === 0) {
        alert('Nenhum fornecedor para exportar!');
        return;
    }
    
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventName = currentEvent?.name || currentEvent?.couple_names || 'Evento';
    const totalGasto = state.suppliers.reduce((sum, s) => sum + (s.value || 0), 0);
    
    const categorias = {};
    state.suppliers.forEach(s => {
        const cat = s.category || 'Outros';
        categorias[cat] = (categorias[cat] || 0) + (s.value || 0);
    });
    
    const headers = ['Nome do Fornecedor', 'Categoria', 'Status', 'Valor (R$)', 'Contato', 'Data de Cadastro'];
    const csvRows = [headers.join(',')];
    
    for (const supplier of state.suppliers) {
        csvRows.push([
            `"${supplier.name || ''}"`,
            `"${supplier.category || ''}"`,
            supplier.status === 'contratado' ? 'Contratado' : supplier.status === 'negociacao' ? 'Negociação' : 'Cotado',
            supplier.value || 0,
            `"${supplier.contact || ''}"`,
            new Date(supplier.created_at || Date.now()).toLocaleDateString('pt-BR')
        ].join(','));
    }
    
    csvRows.push('');
    csvRows.push('"RESUMO FINANCEIRO"');
    csvRows.push(`"Total Gasto:","${totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}"`);
    
    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `fornecedores_${eventName.replace(/[^a-z0-9]/gi, '_')}_${dataAtual}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    showNotification(`${state.suppliers.length} fornecedores exportados!`, 'success');
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem 1.5rem';
    notification.style.borderRadius = '50px';
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#e11d48';
    notification.style.color = 'white';
    notification.style.zIndex = '2000';
    notification.style.boxShadow = '0 5px 20px rgba(0,0,0,0.3)';
    notification.style.animation = 'slideIn 0.3s ease';
    notification.style.fontSize = '0.85rem';
    notification.style.fontWeight = '500';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function getTotalGasto() {
    return state.suppliers.reduce((s, i) => s + (i.value || 0), 0);
}

function getGastosPorCategoria() {
    const cats = {};
    state.suppliers.forEach(s => {
        const cat = s.category || 'Outros';
        cats[cat] = (cats[cat] || 0) + (s.value || 0);
    });
    return cats;
}

function getStatusConvidados() {
    const status = { confirmado: 0, pendente: 0, recusado: 0 };
    state.guests.forEach(g => {
        if (g.status === 'confirmado') status.confirmado++;
        else if (g.status === 'recusado') status.recusado++;
        else status.pendente++;
    });
    return status;
}

function getProgressoChecklist() {
    if (state.tasks.length === 0) return 0;
    const concluidas = state.tasks.filter(t => t.completed).length;
    return (concluidas / state.tasks.length) * 100;
}

async function loadEventData(id) {
    state.guests = await getEventGuests(id);
    state.suppliers = await getEventSuppliers(id);
    await ensureEventHasTasks(id);
    state.tasks = await getUserTasks(state.user.id, id);
}

// ============================================
// GRÁFICOS
// ============================================

function criarGraficos() {
    if (!state.selectedEvent) return;

    const ctxPie1 = document.getElementById('graficoPizzaCategorias')?.getContext('2d');
    const ctxPie2 = document.getElementById('graficoPizzaStatus')?.getContext('2d');

    if (ctxPie1 && state.charts.pizzaCategorias) state.charts.pizzaCategorias.destroy();
    if (ctxPie2 && state.charts.pizzaStatus) state.charts.pizzaStatus.destroy();

    const gastos = getGastosPorCategoria();
    if (ctxPie1 && Object.keys(gastos).length > 0) {
        state.charts.pizzaCategorias = new Chart(ctxPie1, {
            type: 'doughnut',
            data: {
                labels: Object.keys(gastos),
                datasets: [{
                    data: Object.values(gastos),
                    backgroundColor: ['#ffd700', '#ffb347', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#ec489a']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#fff' } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
                }
            }
        });
    }

    const status = getStatusConvidados();
    if (ctxPie2 && state.guests.length > 0) {
        state.charts.pizzaStatus = new Chart(ctxPie2, {
            type: 'doughnut',
            data: {
                labels: [`Confirmados (${status.confirmado})`, `Pendentes (${status.pendente})`, `Recusados (${status.recusado})`],
                datasets: [{
                    data: [status.confirmado, status.pendente, status.recusado],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#fff' } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} convidados` } }
                }
            }
        });
    }
}

// ============================================
// RENDERIZAÇÃO DO PERFIL
// ============================================

function renderPerfil() {
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || state.user?.photoURL || '';

    return `
        <div class="profile-section">
            <div class="profile-header">
                <div class="profile-avatar">
                    <div class="profile-avatar-large" id="profileAvatar">
                        ${photoUrl ? `<img src="${photoUrl}" alt="Foto de perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}
                    </div>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                    <button class="btn-secondary" id="changePhotoBtn">Alterar Foto</button>
                </div>
                <div class="profile-info">
                    <h2>${escapeHtml(profile.fullName || state.user?.username || 'Usuário')}</h2>
                    <p>${state.user?.email || ''}</p>
                    <p>Membro desde ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
            </div>

            <form id="profileForm">
                <div class="profile-form-grid">
                    <div class="form-group">
                        <label>Nome Completo</label>
                        <input type="text" name="fullName" value="${escapeHtml(profile.fullName || '')}" placeholder="Seu nome completo">
                    </div>
                    <div class="form-group">
                        <label>CPF</label>
                        <input type="text" name="cpf" value="${escapeHtml(profile.cpf || '')}" placeholder="000.000.000-00" maxlength="14">
                    </div>
                    <div class="form-group">
                        <label>Data de Nascimento</label>
                        <input type="date" name="birthDate" value="${profile.birthDate || ''}">
                    </div>
                    <div class="form-group">
                        <label>Telefone</label>
                        <input type="tel" name="phone" value="${escapeHtml(profile.phone || '')}" placeholder="(11) 99999-9999">
                    </div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Endereço</label>
                        <input type="text" name="address" value="${escapeHtml(profile.address || '')}" placeholder="Rua, número, bairro, cidade">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" value="${state.user?.email || ''}" disabled>
                    </div>
                </div>
                <button type="submit" class="btn">Salvar Alterações</button>
            </form>
        </div>
    `;
}

// ============================================
// RENDERIZAÇÃO DO CHECKLIST
// ============================================

function renderChecklist() {
    let filteredTasks = state.tasks;
    if (state.taskFilter === 'pending') filteredTasks = filteredTasks.filter(t => !t.completed);
    else if (state.taskFilter === 'completed') filteredTasks = filteredTasks.filter(t => t.completed);

    const categories = {};
    filteredTasks.forEach(task => {
        if (!categories[task.category]) categories[task.category] = [];
        categories[task.category].push(task);
    });

    const categoryOrder = ['12 meses', '9 meses', '6 meses', '3 meses', '1 mês', '1 semana', 'Dia do Casamento'];
    const progress = getProgressoChecklist();

    return `
        <div class="checklist-section">
            <div class="checklist-header">
                <h2>Checklist do Casamento</h2>
                <div class="checklist-filters">
                    <button class="filter-btn ${state.taskFilter === 'all' ? 'active' : ''}" onclick="window.setTaskFilter('all')">Todas</button>
                    <button class="filter-btn ${state.taskFilter === 'pending' ? 'active' : ''}" onclick="window.setTaskFilter('pending')">Pendentes</button>
                    <button class="filter-btn ${state.taskFilter === 'completed' ? 'active' : ''}" onclick="window.setTaskFilter('completed')">Concluídas</button>
                    <button class="btn" onclick="window.openTaskModal()">Nova Tarefa</button>
                </div>
            </div>

            <div class="progress-section">
                <h3>Progresso: ${progress.toFixed(0)}% concluído</h3>
                <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
            </div>

            ${categoryOrder.map(cat => {
                const tasks = categories[cat] || [];
                if (tasks.length === 0) return '';
                const concluidas = tasks.filter(t => t.completed).length;
                return `
                    <div class="checklist-category">
                        <div class="category-title"><span>${cat}</span><span>${concluidas}/${tasks.length} concluídas</span></div>
                        ${tasks.map(task => `
                            <div class="task-item">
                                <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''} onchange="window.toggleTaskComplete('${task.id}')">
                                <div class="task-content">
                                    <div class="task-name">${task.name}<span class="task-priority priority-${task.priority}">${task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa'}</span></div>
                                    ${task.due_date ? `<div class="task-due-date">Vence: ${formatDate(task.due_date)}</div>` : ''}
                                </div>
                                <div class="task-actions">
                                    ${!task.completed ? `<button class="btn-small" onclick="window.completeTask('${task.id}')">Concluir</button>` : ''}
                                    <button class="btn-small" onclick="window.editTask('${task.id}')">Editar</button>
                                    <button class="btn-small" onclick="window.deleteTaskConfirm('${task.id}')">Excluir</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }).join('')}
            ${filteredTasks.length === 0 ? '<div class="empty-state">Nenhuma tarefa encontrada!</div>' : ''}
        </div>
    `;
}

// ============================================
// RENDERIZAÇÃO DO CALENDÁRIO
// ============================================

function renderCalendario() {
    const primeiraSemana = new Date(state.calendarYear, state.calendarMonth, 1);
    const ultimoDia = new Date(state.calendarYear, state.calendarMonth + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const primeiroDiaSemana = primeiraSemana.getDay();
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let dias = [];

    for (let i = 0; i < primeiroDiaSemana; i++) dias.push(null);
    for (let i = 1; i <= diasNoMes; i++) {
        const dataAtual = new Date(state.calendarYear, state.calendarMonth, i);
        const temEvento = state.events.some(event => {
            if (!event.event_date) return false;
            const eventDate = new Date(event.event_date);
            return eventDate.getDate() === dataAtual.getDate() &&
                   eventDate.getMonth() === dataAtual.getMonth() &&
                   eventDate.getFullYear() === dataAtual.getFullYear();
        });
        dias.push({ dia: i, temEvento, data: dataAtual });
    }

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    return `
        <div class="calendar-section">
            <div class="calendar-header">
                <h3>${monthNames[state.calendarMonth]} ${state.calendarYear}</h3>
                <div>
                    <button class="btn-secondary" onclick="window.mudarMes(-1)">◀ Anterior</button>
                    <button class="btn-secondary" onclick="window.mudarMes(1)">Próximo ▶</button>
                </div>
            </div>
            <div class="calendar-grid">
                ${diasSemana.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
                ${dias.map(dia => {
                    if (dia === null) {
                        return '<div class="calendar-day empty"></div>';
                    }
                    return `<div class="calendar-day ${dia.temEvento ? 'has-event' : ''}" 
                                   data-date="${dia.data.toISOString()}" 
                                   onclick="window.selecionarDataCalendario('${dia.data.toISOString()}')">
                        ${dia.dia}
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================
// FUNÇÃO PARA SELECIONAR DATA NO CALENDÁRIO
// ============================================

window.selecionarDataCalendario = async (dataISO) => {
    const data = new Date(dataISO);
    const evento = state.events.find(event => {
        if (!event.event_date) return false;
        const eventDate = new Date(event.event_date);
        return eventDate.getDate() === data.getDate() &&
               eventDate.getMonth() === data.getMonth() &&
               eventDate.getFullYear() === data.getFullYear();
    });
    
    if (evento) { 
        state.selectedEvent = evento.id; 
        await loadEventData(evento.id);
        window.setActiveTab('dashboard');
        showNotification(`Evento: ${evento.name || evento.couple_names}`, 'success');
    } else {
        showNotification('Nenhum evento nesta data', 'error');
    }
};

// ============================================
// RENDERIZAÇÃO SOBRE NÓS
// ============================================

function renderAbout() {
    return `
        <div class="about-section">
            <div class="about-header-horizontal">
                <div class="about-logo-horizontal">
                    <img src="assets/LOGO3.png" alt="La Vie Casamentos Logo" class="about-logo-img-horizontal">
                </div>
                <div class="about-text-horizontal">
                    <h1 class="about-logo-title">LA VIE</h1>
                    <div class="about-logo-subtitle">CASAMENTOS</div>
                    <p class="about-tagline">Realizando sonhos há mais de 10 anos</p>
                </div>
            </div>

                <div class="about-card">
                    <h2><i class="fas fa-bullseye"></i> Missão</h2>
                    <p>Oferecer uma plataforma completa e intuitiva que permita aos casais planejarem seu casamento com tranquilidade, economia e organização, conectando-os aos melhores fornecedores e inspirando cada detalhe do grande dia.</p>
                </div>

                <div class="about-card">
                    <h2><i class="fas fa-eye"></i> Visão</h2>
                    <p>Ser referência nacional em plataformas de planejamento de casamentos, reconhecida pela inovação, confiabilidade e por transformar sonhos em realidade.</p>
                </div>

                <div class="about-card">
                    <h2><i class="fas fa-gem"></i> Valores</h2>
                    <ul class="about-values">
                        <li><i class="fas fa-check-circle"></i> Amor pelo que fazemos</li>
                        <li><i class="fas fa-check-circle"></i> Compromisso com a excelência</li>
                        <li><i class="fas fa-check-circle"></i> Transparência e confiança</li>
                        <li><i class="fas fa-check-circle"></i> Inovação constante</li>
                        <li><i class="fas fa-check-circle"></i> Respeito aos sonhos de cada casal</li>
                    </ul>
                </div>
            </div>

            <div class="about-footer">
                <p>&copy; 2026 La Vie Casamentos. Todos os direitos reservados.</p>
                <p>Transformando sonhos em realidade</p>
            </div>
        </div>
    `;
}

// ============================================
// FUNÇÕES DE TEMAS
// ============================================

window.toggleThemeMenu = function() {
    const menu = document.getElementById('themeMenu');
    if (menu) {
        if (menu.style.display === 'none' || getComputedStyle(menu).display === 'none') {
            menu.style.display = 'block';
        } else {
            menu.style.display = 'none';
        }
    }
};

window.applyTheme = function(theme) {
    document.body.classList.remove('theme-rose', 'theme-blue', 'theme-green', 'theme-purple', 'theme-dark');
    if (theme !== 'gold') {
        document.body.classList.add(`theme-${theme}`);
    }
    localStorage.setItem('selectedTheme', theme);
    const menu = document.getElementById('themeMenu');
    if (menu) menu.style.display = 'none';
};

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selectedTheme');
    if (savedTheme && savedTheme !== 'gold') {
        document.body.classList.add(`theme-${savedTheme}`);
    }
}

// ============================================
// RENDERIZAÇÃO DO DASHBOARD PRINCIPAL
// ============================================

async function renderDashboard() {
    const app = document.getElementById('app');
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const totalGasto = getTotalGasto();
    const orcamentoTotal = currentEvent?.budget_total || 0;
    const percentual = orcamentoTotal > 0 ? (totalGasto / orcamentoTotal) * 100 : 0;
    const progressoChecklist = getProgressoChecklist();
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || state.user?.photoURL || '';

    let modalHtml = '';
    if (state.showEventForm) modalHtml = renderEventForm();
    if (state.showGuestForm) modalHtml = renderGuestForm();
    if (state.showSupplierForm) modalHtml = renderSupplierForm();
    if (state.showTaskForm) modalHtml = renderTaskForm();

    app.innerHTML = `
        <div class="header">
            <div class="tabs">
                <button class="tab ${state.activeTab === 'dashboard' ? 'active' : ''}" onclick="window.setActiveTab('dashboard')">Dashboard</button>
                <button class="tab ${state.activeTab === 'checklist' ? 'active' : ''}" onclick="window.setActiveTab('checklist')">Checklist</button>
                <button class="tab ${state.activeTab === 'events' ? 'active' : ''}" onclick="window.setActiveTab('events')">Eventos</button>
                <button class="tab ${state.activeTab === 'calendar' ? 'active' : ''}" onclick="window.setActiveTab('calendar')">Calendário</button>
                <button class="tab ${state.activeTab === 'about' ? 'active' : ''}" onclick="window.setActiveTab('about')">Sobre Nós</button>
            </div>
            <div class="user-info" onclick="window.setActiveTab('profile')">
                <div class="profile-pic">${photoUrl ? `<img src="${photoUrl}" alt="Perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}</div>
                <span>${state.user?.username}</span>
                <button class="btn-logout" onclick="event.stopPropagation(); window.logout()">Sair</button>
            </div>
        </div>
        <div class="container">
            <div class="tab-content ${state.activeTab === 'dashboard' ? 'active' : ''}" style="${state.activeTab !== 'dashboard' ? 'display: none;' : ''}">
                ${state.selectedEvent && currentEvent ? `
                    <div class="stats-grid">
                        <div class="stat-card"><h3>Eventos</h3><div class="stat-number">${state.events.length}</div></div>
                        <div class="stat-card"><h3>Convidados</h3><div class="stat-number">${state.guests.length}</div></div>
                        <div class="stat-card"><h3>Fornecedores</h3><div class="stat-number">${state.suppliers.length}</div></div>
                        <div class="stat-card"><h3>Tarefas</h3><div class="stat-number">${state.tasks.filter(t => t.completed).length}/${state.tasks.length}</div></div>
                    </div>
                    <div class="budget-grid">
                        <div class="budget-card used">
                            <h3>Utilizado</h3>
                            <div class="budget-value">${formatCurrency(totalGasto)}</div>
                            <small>${percentual.toFixed(1)}% do total</small>
                        </div>
                        <div class="budget-card available">
                            <h3>Disponível</h3>
                            <div class="budget-value">${formatCurrency(orcamentoTotal - totalGasto)}</div>
                            <small>${(100 - percentual).toFixed(1)}% restante</small>
                        </div>
                    </div>
                    <div class="progress-section">
                        <h3>Progresso do Orçamento: ${percentual.toFixed(1)}%</h3>
                        <div class="progress-bar"><div class="progress-fill" style="width: ${percentual}%"></div></div>
                        <h3>Checklist: ${progressoChecklist.toFixed(0)}%</h3>
                        <div class="progress-bar"><div class="progress-fill" style="width: ${progressoChecklist}%"></div></div>
                    </div>
                    <div class="charts-grid">
                        <div class="chart-card"><h3>Gastos por Categoria</h3><div class="chart-container"><canvas id="graficoPizzaCategorias"></canvas></div></div>
                        <div class="chart-card"><h3>Status dos Convidados</h3><div class="chart-container"><canvas id="graficoPizzaStatus"></canvas></div></div>
                    </div>
                ` : `<div class="empty-state"><p>Selecione um evento para ver o dashboard!</p><button class="btn" onclick="window.setActiveTab('events')">Ver meus eventos</button></div>`}
            </div>

            <div class="tab-content ${state.activeTab === 'checklist' ? 'active' : ''}" style="${state.activeTab !== 'checklist' ? 'display: none;' : ''}">
                ${renderChecklist()}
            </div>

            <div class="tab-content ${state.activeTab === 'events' ? 'active' : ''}" style="${state.activeTab !== 'events' ? 'display: none;' : ''}">
                <div class="section-header"><h2>Meus Eventos</h2><button class="btn" onclick="window.openEventModal()">Novo Evento</button></div>
                ${state.events.length === 0 ? '<div class="empty-state">Nenhum evento. Crie seu primeiro evento!</div>' : `
                    <div class="events-grid">${state.events.map(event => {
                        const gastosEvento = state.suppliers.filter(s => s.event_id === event.id).reduce((s, i) => s + (i.value || 0), 0);
                        const perc = event.budget_total ? (gastosEvento / event.budget_total) * 100 : 0;
                        return `<div class="event-card ${state.selectedEvent === event.id ? 'selected' : ''}" onclick="window.selectEvent('${event.id}')">
                            <div class="event-card-header"><h4>${event.name || event.couple_names || 'Evento'}</h4></div>
                            <div class="event-card-body">
                                <p><strong>Tipo:</strong> ${event.event_type || 'Tipo'}</p>
                                <p><strong>Orçamento:</strong> ${formatCurrency(event.budget_total)}</p>
                                <p><strong>Gasto:</strong> ${formatCurrency(gastosEvento)} (${perc.toFixed(0)}%)</p>
                                <p><strong>Data:</strong> ${formatDate(event.event_date)}</p>
                            </div>
                            <div style="padding:0.75rem; display:flex; gap:0.5rem;">
                                <button class="btn-secondary" style="flex:1" onclick="event.stopPropagation(); window.editEvent('${event.id}')">Editar</button>
                                <button class="btn-secondary" style="flex:1" onclick="event.stopPropagation(); window.deleteEventConfirm('${event.id}')">Excluir</button>
                            </div>
                        </div>`;
                    }).join('')}</div>
                `}
                ${state.selectedEvent && currentEvent ? `
                    <div style="margin-top: 2rem;">
                        <div class="section-header"><h2>Gerenciando: ${currentEvent.name || currentEvent.couple_names || 'Evento'}</h2><button class="btn-secondary" onclick="window.selectEvent(null)">Trocar Evento</button></div>
                        
                        <div class="section-header">
                            <h2>Convidados</h2>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn" onclick="window.openGuestModal()">Adicionar</button>
                                <button class="btn-secondary" onclick="window.exportGuestsToExcel()">Exportar Excel</button>
                            </div>
                        </div>
                        <div class="guest-list">${state.guests.map(g => `<div class="guest-card"><div><strong>${g.name}</strong><div style="font-size:0.7rem; color:#888;">${g.status === 'confirmado' ? 'Confirmado' : g.status === 'recusado' ? 'Recusado' : 'Pendente'}${g.table_name ? ` • Mesa ${g.table_name}` : ''}</div></div><div style="display: flex; gap: 0.5rem;"><button class="btn-small" onclick="window.editGuest('${g.id}')">Editar</button><button class="btn-small" onclick="window.deleteGuestConfirm('${g.id}')">Excluir</button></div></div>`).join('')}${state.guests.length === 0 ? '<div class="empty-state">Nenhum convidado</div>' : ''}</div>
                        
                        <div class="section-header">
                            <h2>Fornecedores</h2>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn" onclick="window.openSupplierModal()">Adicionar</button>
                                <button class="btn-secondary" onclick="window.exportSuppliersToExcel()">Exportar Excel</button>
                            </div>
                        </div>
                        <div class="supplier-list">${state.suppliers.map(s => `<div class="supplier-card"><div><strong>${s.name}</strong><div style="font-size:0.7rem; color:#888;">${s.category} • ${formatCurrency(s.value)}<br>${s.status === 'contratado' ? 'Contratado' : s.status === 'negociacao' ? 'Negociação' : 'Cotado'}</div></div><div style="display: flex; gap: 0.5rem;"><button class="btn-small" onclick="window.editSupplier('${s.id}')">Editar</button><button class="btn-small" onclick="window.deleteSupplierConfirm('${s.id}')">Excluir</button></div></div>`).join('')}${state.suppliers.length === 0 ? '<div class="empty-state">Nenhum fornecedor</div>' : ''}</div>
                    </div>
                ` : state.events.length > 0 ? '<div class="empty-state">Clique em um evento para gerenciar</div>' : ''}
            </div>

            <div class="tab-content ${state.activeTab === 'calendar' ? 'active' : ''}" style="${state.activeTab !== 'calendar' ? 'display: none;' : ''}">
                ${renderCalendario()}
            </div>

            <div class="tab-content ${state.activeTab === 'about' ? 'active' : ''}" style="${state.activeTab !== 'about' ? 'display: none;' : ''}">
                ${renderAbout()}
            </div>

            <div class="tab-content ${state.activeTab === 'profile' ? 'active' : ''}" style="${state.activeTab !== 'profile' ? 'display: none;' : ''}">
                ${renderPerfil()}
            </div>
        </div>
        ${modalHtml}
    `;
    
    criarGraficos();
    attachFormEvents();
}

// ============================================
// FORMULÁRIOS
// ============================================

function renderEventForm() {
    const event = state.editingEvent;
    return `<div class="modal" id="eventModal"><div class="modal-content"><h2>${event ? 'Editar Evento' : 'Novo Evento'}</h2>
        <form id="eventForm">
            <div class="form-group"><label>Nome do Evento</label><input type="text" name="name" value="${event?.name || ''}" placeholder="Ex: Casamento Ana e João"></div>
            <div class="form-group"><label>Nomes dos Noivos</label><input type="text" name="couple_names" value="${event?.couple_names || ''}" placeholder="Ana & João"></div>
            <div class="form-group"><label>Tipo</label><select name="event_type"><option>Casamento</option><option>Corporativo</option><option>Aniversário</option><option>Festa</option></select></div>
            <div class="form-group"><label>Tema</label><select name="theme"><option>Clássico</option><option>Moderno</option><option>Rústico</option><option>Luxo</option></select></div>
            <div class="form-group"><label>Orçamento (R$)</label><input type="number" name="budget_total" value="${event?.budget_total || ''}" placeholder="0,00"></div>
            <div class="form-group"><label>Data do Evento</label><input type="date" name="event_date" value="${event?.event_date || ''}"></div>
            <div class="form-group"><label>Local</label><input type="text" name="venue" value="${event?.venue || ''}" placeholder="Local do evento"></div>
            <div style="display:flex; gap:1rem; margin-top: 1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="window.closeEventModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderGuestForm() {
    const guest = state.editingGuest;
    return `<div class="modal" id="guestModal"><div class="modal-content"><h2>${guest ? 'Editar Convidado' : 'Novo Convidado'}</h2>
        <form id="guestForm">
            <div class="form-group"><label>Nome do Convidado</label><input type="text" name="name" value="${guest?.name || ''}" required placeholder="Nome completo"></div>
            <div class="form-group"><label>Grupo/Família</label><input type="text" name="group_name" value="${guest?.group_name || ''}" placeholder="Ex: Família Silva"></div>
            <div class="form-group"><label>Status</label><select name="status"><option>pendente</option><option>confirmado</option><option>recusado</option></select></div>
            <div class="form-group"><label>Número da Mesa</label><input type="text" name="table_name" value="${guest?.table_name || ''}" placeholder="Mesa 01"></div>
            <div class="form-group"><label>Telefone</label><input type="text" name="phone" value="${guest?.phone || ''}" placeholder="(11) 99999-9999"></div>
            <div style="display:flex; gap:1rem; margin-top: 1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="window.closeGuestModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderSupplierForm() {
    const supplier = state.editingSupplier;
    return `<div class="modal" id="supplierModal"><div class="modal-content"><h2>${supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
        <form id="supplierForm">
            <div class="form-group"><label>Nome do Fornecedor</label><input type="text" name="name" value="${supplier?.name || ''}" required placeholder="Nome do fornecedor"></div>
            <div class="form-group"><label>Categoria</label><select name="category"><option>Buffet</option><option>Fotografia</option><option>Música</option><option>Decoração</option><option>Espaço</option><option>Vestuário</option><option>Outro</option></select></div>
            <div class="form-group"><label>Status</label><select name="status"><option>cotado</option><option>negociacao</option><option>contratado</option></select></div>
            <div class="form-group"><label>Valor (R$)</label><input type="number" name="value" value="${supplier?.value || 0}" placeholder="0,00"></div>
            <div class="form-group"><label>Contato</label><input type="text" name="contact" value="${supplier?.contact || ''}" placeholder="Telefone ou email"></div>
            <div style="display:flex; gap:1rem; margin-top: 1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="window.closeSupplierModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderTaskForm() {
    const task = state.editingTask;
    return `<div class="modal" id="taskModal"><div class="modal-content"><h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
        <form id="taskForm">
            <div class="form-group"><label>Nome da Tarefa</label><input type="text" name="name" value="${task?.name || ''}" required placeholder="Ex: Contratar buffet"></div>
            <div class="form-group"><label>Categoria</label><select name="category"><option>12 meses</option><option>9 meses</option><option>6 meses</option><option>3 meses</option><option>1 mês</option><option>1 semana</option><option>Dia do Casamento</option></select></div>
            <div class="form-group"><label>Prioridade</label><select name="priority"><option>baixa</option><option>media</option><option>alta</option></select></div>
            <div class="form-group"><label>Data Limite</label><input type="date" name="due_date" value="${task?.due_date || ''}"></div>
            <div style="display:flex; gap:1rem; margin-top: 1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="window.closeTaskModal()">Cancelar</button></div>
        </form></div></div>`;
}

// ============================================
// HANDLERS DOS FORMULÁRIOS
// ============================================

function attachFormEvents() {
    const eventForm = document.getElementById('eventForm');
    if (eventForm) eventForm.addEventListener('submit', handleEventSubmit);
    
    const guestForm = document.getElementById('guestForm');
    if (guestForm) guestForm.addEventListener('submit', handleGuestSubmit);
    
    const supplierForm = document.getElementById('supplierForm');
    if (supplierForm) supplierForm.addEventListener('submit', handleSupplierSubmit);
    
    const taskForm = document.getElementById('taskForm');
    if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);
    
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.removeEventListener('submit', handleProfileSubmit);
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    if (changePhotoBtn) {
        changePhotoBtn.removeEventListener('click', () => {});
        changePhotoBtn.addEventListener('click', () => {
            const photoUpload = document.getElementById('photoUpload');
            if (photoUpload) photoUpload.click();
        });
    }
    
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload) {
        photoUpload.removeEventListener('change', handlePhotoUpload);
        photoUpload.addEventListener('change', handlePhotoUpload);
    }
}

async function handleEventSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.budget_total = parseFloat(data.budget_total || 0);
    
    let result;
    if (state.editingEvent) {
        result = await updateEvent(state.editingEvent.id, data);
    } else {
        result = await createEvent(data, state.user.id);
    }
    
    if (result.success) {
        state.events = await getUserEvents(state.user.id);
        closeEventModal();
        showNotification('Evento salvo com sucesso!', 'success');
        renderDashboard();
    } else {
        showNotification('Erro ao salvar evento: ' + result.error, 'error');
    }
}

async function handleGuestSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    
    let result;
    if (state.editingGuest) {
        result = await updateGuest(state.editingGuest.id, data);
    } else {
        result = await createGuest(data, state.selectedEvent);
    }
    
    if (result.success) {
        state.guests = await getEventGuests(state.selectedEvent);
        closeGuestModal();
        showNotification('Convidado salvo com sucesso!', 'success');
        renderDashboard();
    } else {
        showNotification('Erro ao salvar convidado: ' + result.error, 'error');
    }
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    data.value = parseFloat(data.value || 0);
    
    let result;
    if (state.editingSupplier) {
        result = await updateSupplier(state.editingSupplier.id, data);
    } else {
        result = await createSupplier(data, state.selectedEvent);
    }
    
    if (result.success) {
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        closeSupplierModal();
        showNotification('Fornecedor salvo com sucesso!', 'success');
        renderDashboard();
    } else {
        showNotification('Erro ao salvar fornecedor: ' + result.error, 'error');
    }
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    
    let result;
    if (state.editingTask) {
        result = await updateTask(state.editingTask.id, data);
    } else {
        result = await createTask(data, state.user.id, state.selectedEvent || null);
    }
    
    if (result.success) {
        if (state.selectedEvent) {
            state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
        } else {
            state.tasks = await getUserTasks(state.user.id);
        }
        closeTaskModal();
        showNotification('Tarefa salva com sucesso!', 'success');
        renderDashboard();
    } else {
        showNotification('Erro ao salvar tarefa: ' + result.error, 'error');
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const profileData = Object.fromEntries(new FormData(e.target));
    
    const userData = await getUserProfile(state.user.id);
    const currentPhoto = state.user.profile?.photo || userData?.profile?.photo || null;
    
    const result = await updateUserProfile(state.user.id, {
        fullName: profileData.fullName || '',
        cpf: profileData.cpf || '',
        birthDate: profileData.birthDate || '',
        address: profileData.address || '',
        phone: profileData.phone || '',
        photo: currentPhoto
    });
    
    if (result.success) {
        const updatedUserData = await getUserProfile(state.user.id);
        state.user.profile = updatedUserData?.profile || {};
        showNotification('Perfil atualizado com sucesso!', 'success');
        renderDashboard();
    } else {
        showNotification('Erro ao atualizar perfil: ' + result.error, 'error');
    }
}

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const userData = await getUserProfile(state.user.id);
            const currentProfile = userData?.profile || {};
            
            const result = await updateUserProfile(state.user.id, {
                photo: event.target.result,
                fullName: currentProfile.fullName || '',
                cpf: currentProfile.cpf || '',
                birthDate: currentProfile.birthDate || '',
                address: currentProfile.address || '',
                phone: currentProfile.phone || ''
            });
            
            if (result.success) {
                const updatedUserData = await getUserProfile(state.user.id);
                state.user.profile = updatedUserData?.profile || {};
                showNotification('Foto atualizada!', 'success');
                renderDashboard();
            } else {
                showNotification('Erro ao atualizar foto', 'error');
            }
        };
        reader.readAsDataURL(file);
    }
}

// ============================================
// FUNÇÕES DE AUTENTICAÇÃO (TELA DE LOGIN)
// ============================================

function renderAuth() {
    const isLogin = state.authMode === 'login';
    
    document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-box">
                <div class="auth-logo">
                    <h1>LA VIE</h1>
                    <div class="subtitle">CASAMENTOS</div>
                    <div class="tagline">Seu sonho feito por especialistas</div>
                </div>
                <div class="auth-card">
                    <div class="auth-tabs">
                        <button class="auth-tab ${isLogin ? 'active' : ''}" onclick="window.setAuthMode('login')">Login</button>
                        <button class="auth-tab ${!isLogin ? 'active' : ''}" onclick="window.setAuthMode('register')">Cadastrar</button>
                    </div>
                    <div id="authMessage" class="error-message" style="display:none"></div>
                    
                    ${isLogin ? `
                        <button id="googleLoginBtn" class="auth-btn google-btn">
                            <svg style="width:20px;height:20px;margin-right:10px;" viewBox="0 0 24 24">
                                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Entrar com Google
                        </button>
                        <div class="divider"><span>ou</span></div>
                        <form id="loginForm" class="auth-form">
                            <div class="form-group"><label>EMAIL</label><input type="email" id="loginEmail" placeholder="seuemail@exemplo.com" required></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="loginPassword" placeholder="Digite sua senha" required></div>
                            <button type="submit" class="auth-btn">ENTRAR</button>
                            <div class="forgot-links">
                                <a onclick="window.forgotPassword()">Esqueceu sua senha?</a>
                                <a onclick="window.resendVerification()">Não recebeu o email de verificação?</a>
                            </div>
                        </form>
                    ` : `
                        <form id="registerForm" class="auth-form">
                            <div class="form-group"><label>NOME DE USUÁRIO</label><input type="text" id="regUsername" placeholder="Como quer ser chamado" required></div>
                            <div class="form-group"><label>EMAIL</label><input type="email" id="regEmail" placeholder="seuemail@exemplo.com" required></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="regPassword" placeholder="Mínimo 6 caracteres" required></div>
                            <div class="form-group"><label>CONFIRMAR SENHA</label><input type="password" id="regConfirmPassword" placeholder="Digite novamente" required></div>
                            <button type="submit" class="auth-btn">CADASTRAR</button>
                        </form>
                    `}
                </div>
            </div>
        </div>
    `;

    if (isLogin) {
        const googleBtn = document.getElementById('googleLoginBtn');
        if (googleBtn) {
            googleBtn.addEventListener('click', async () => {
                const result = await loginWithGoogle();
                if (result.success) {
                    await loadUserData(result.user);
                } else {
                    const msgDiv = document.getElementById('authMessage');
                    msgDiv.style.display = 'block';
                    msgDiv.textContent = result.error;
                }
            });
        }
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const result = await loginWithEmail(email, password);
            
            if (result.success) {
                await loadUserData(result.user);
            } else {
                const msgDiv = document.getElementById('authMessage');
                msgDiv.style.display = 'block';
                if (result.error === 'email-not-verified') {
                    msgDiv.innerHTML = result.message + '<br><br><a onclick="window.resendVerification()" style="color: #ffd700; cursor: pointer;">Clique aqui para reenviar o link de verificação</a>';
                } else {
                    msgDiv.textContent = result.error;
                }
            }
        });
    } else {
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;
            const msgDiv = document.getElementById('authMessage');
            
            if (password !== confirm) {
                msgDiv.style.display = 'block';
                msgDiv.textContent = 'Senhas não coincidem!';
                return;
            }
            if (password.length < 6) {
                msgDiv.style.display = 'block';
                msgDiv.textContent = 'A senha deve ter pelo menos 6 caracteres!';
                return;
            }
            
            const result = await registerWithEmail(email, password, username);
            
            if (result.success) {
                msgDiv.style.display = 'block';
                msgDiv.className = 'success-message';
                msgDiv.innerHTML = result.message + '<br><br>Enviamos um link de verificação para <strong>' + email + '</strong><br>Verifique seu email (e a pasta SPAM) antes de fazer login.';
                setTimeout(() => {
                    state.authMode = 'login';
                    renderAuth();
                }, 5000);
            } else {
                msgDiv.style.display = 'block';
                msgDiv.textContent = result.error;
            }
        });
    }
}

// ============================================
// VERIFICAR SESSÃO AO CARREGAR A PÁGINA
// ============================================

async function checkAuthState() {
    return new Promise((resolve) => {
        onAuthChange(async (user) => {
            if (user) {
                console.log('Usuário encontrado na sessão:', user.email);
                state.user = user;
                state.events = await getUserEvents(state.user.id);
                state.tasks = await getUserTasks(state.user.id);
                renderDashboard();
                resolve(true);
            } else {
                console.log('Nenhum usuário logado');
                renderAuth();
                resolve(false);
            }
        });
    });
}

async function loadUserData(user) {
    state.user = user;
    state.events = await getUserEvents(state.user.id);
    if (state.selectedEvent) {
        state.guests = await getEventGuests(state.selectedEvent);
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
    } else {
        state.tasks = await getUserTasks(state.user.id);
    }
    renderDashboard();
}

// ============================================
// FUNÇÃO PARA MARCAR TAREFA COMO CONCLUÍDA
// ============================================

window.completeTask = async function(id) {
    await toggleTaskComplete(id);
    if (state.selectedEvent) {
        state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
    } else {
        state.tasks = await getUserTasks(state.user.id);
    }
    renderDashboard();
};

// ============================================
// FUNÇÕES DE LOGOUT
// ============================================

async function logout() {
    await logoutUser();
    state.user = null;
    state.events = [];
    state.selectedEvent = null;
    state.guests = [];
    state.suppliers = [];
    state.tasks = [];
    Object.values(state.charts).forEach(c => c?.destroy());
    renderAuth();
}

// ============================================
// FUNÇÕES GLOBAIS EXPORTADAS
// ============================================

window.setAuthMode = (m) => { state.authMode = m; renderAuth(); };
window.setActiveTab = (tab) => { state.activeTab = tab; renderDashboard(); };
window.setTaskFilter = (filter) => { state.taskFilter = filter; renderDashboard(); };
window.selectEvent = async (id) => { 
    state.selectedEvent = id; 
    if (id) {
        await loadEventData(id);
    }
    renderDashboard(); 
};
window.mudarMes = (d) => { 
    const nd = new Date(state.calendarYear, state.calendarMonth + d, 1); 
    state.calendarYear = nd.getFullYear(); 
    state.calendarMonth = nd.getMonth(); 
    renderDashboard(); 
};
window.toggleTaskComplete = async (id) => { 
    await toggleTaskComplete(id);
    if (state.selectedEvent) {
        state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
    } else {
        state.tasks = await getUserTasks(state.user.id);
    }
    renderDashboard(); 
};
window.openEventModal = () => { state.editingEvent = null; state.showEventForm = true; renderDashboard(); };
window.editEvent = (id) => { state.editingEvent = state.events.find(e => e.id === id); state.showEventForm = true; renderDashboard(); };
window.closeEventModal = () => { state.showEventForm = false; state.editingEvent = null; renderDashboard(); };
window.deleteEventConfirm = async (id) => { if (confirm('Excluir evento?')) { await deleteEvent(id); state.events = await getUserEvents(state.user.id); if (state.selectedEvent === id) state.selectedEvent = null; renderDashboard(); } };
window.openGuestModal = () => { if (!state.selectedEvent) { alert('Selecione um evento primeiro!'); return; } state.editingGuest = null; state.showGuestForm = true; renderDashboard(); };
window.editGuest = (id) => { state.editingGuest = state.guests.find(g => g.id === id); state.showGuestForm = true; renderDashboard(); };
window.closeGuestModal = () => { state.showGuestForm = false; state.editingGuest = null; renderDashboard(); };
window.deleteGuestConfirm = async (id) => { if (confirm('Excluir convidado?')) { await deleteGuest(id); state.guests = await getEventGuests(state.selectedEvent); renderDashboard(); } };
window.openSupplierModal = () => { if (!state.selectedEvent) { alert('Selecione um evento primeiro!'); return; } state.editingSupplier = null; state.showSupplierForm = true; renderDashboard(); };
window.editSupplier = (id) => { state.editingSupplier = state.suppliers.find(s => s.id === id); state.showSupplierForm = true; renderDashboard(); };
window.closeSupplierModal = () => { state.showSupplierForm = false; state.editingSupplier = null; renderDashboard(); };
window.deleteSupplierConfirm = async (id) => { if (confirm('Excluir fornecedor?')) { await deleteSupplier(id); state.suppliers = await getEventSuppliers(state.selectedEvent); renderDashboard(); } };
window.openTaskModal = () => { state.editingTask = null; state.showTaskForm = true; renderDashboard(); };
window.editTask = (id) => { state.editingTask = state.tasks.find(t => t.id === id); state.showTaskForm = true; renderDashboard(); };
window.closeTaskModal = () => { state.showTaskForm = false; state.editingTask = null; renderDashboard(); };
window.deleteTaskConfirm = async (id) => { if (confirm('Excluir tarefa?')) { await deleteTask(id); if (state.selectedEvent) { state.tasks = await getUserTasks(state.user.id, state.selectedEvent); } else { state.tasks = await getUserTasks(state.user.id); } renderDashboard(); } };
window.logout = logout;

// ============================================
// INICIALIZAÇÃO
// ============================================

loadSavedTheme();
checkAuthState();