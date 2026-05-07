// ============================================
// LA VIE CASAMENTOS - SCRIPT COMPLETO
// ============================================

// Banco de dados local
let USUARIOS = JSON.parse(localStorage.getItem('usuarios')) || {};
let globalEvents = JSON.parse(localStorage.getItem('globalEvents')) || [];
let globalGuests = JSON.parse(localStorage.getItem('globalGuests')) || [];
let globalSuppliers = JSON.parse(localStorage.getItem('globalSuppliers')) || [];
let globalTasks = JSON.parse(localStorage.getItem('globalTasks')) || [];
let nextIds = JSON.parse(localStorage.getItem('nextIds')) || { event: 1, guest: 1, supplier: 1, task: 1 };

// Criar admin automaticamente
if (!USUARIOS['admin']) {
    USUARIOS['admin'] = {
        id: 1,
        username: 'admin',
        password: 'admin123',
        email: 'admin@lavie.com',
        is_admin: true,
        profile: {
            fullName: 'Administrador',
            cpf: '000.000.000-00',
            birthDate: '1990-01-01',
            address: 'Rua Administrativa, 123',
            phone: '(11) 99999-9999',
            photo: null
        }
    };
    localStorage.setItem('usuarios', JSON.stringify(USUARIOS));
}

// Criar tarefas padrão se não existirem
if (globalTasks.length === 0) {
    const tarefasPadrao = [
        { name: "Definir orçamento do casamento", category: "12 meses", priority: "alta" },
        { name: "Escolher a data do casamento", category: "12 meses", priority: "alta" },
        { name: "Pesquisar e reservar o espaço", category: "12 meses", priority: "alta" },
        { name: "Contratar buffet", category: "9 meses", priority: "alta" },
        { name: "Escolher o vestido de noiva", category: "9 meses", priority: "alta" },
        { name: "Contratar fotógrafo e videografista", category: "6 meses", priority: "alta" },
        { name: "Contratar música/DJ", category: "6 meses", priority: "media" },
        { name: "Enviar os convites", category: "3 meses", priority: "alta" },
        { name: "Confirmar fornecedores", category: "3 meses", priority: "alta" },
        { name: "Confirmar lista de convidados final", category: "1 mês", priority: "alta" },
        { name: "Relaxar e aproveitar o grande dia!", category: "Dia do Casamento", priority: "alta" }
    ];

    tarefasPadrao.forEach((task) => {
        globalTasks.push({
            id: nextIds.task++,
            event_id: null,
            ...task,
            completed: false,
            due_date: "",
            created_at: new Date().toISOString()
        });
    });
    localStorage.setItem('globalTasks', JSON.stringify(globalTasks));
}

// Estado
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

function salvarDados() {
    localStorage.setItem('usuarios', JSON.stringify(USUARIOS));
    localStorage.setItem('globalEvents', JSON.stringify(globalEvents));
    localStorage.setItem('globalGuests', JSON.stringify(globalGuests));
    localStorage.setItem('globalSuppliers', JSON.stringify(globalSuppliers));
    localStorage.setItem('globalTasks', JSON.stringify(globalTasks));
    localStorage.setItem('nextIds', JSON.stringify(nextIds));
}

// ============================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================

function register(username, password, email) {
    if (USUARIOS[username]) return { success: false, error: 'Usuário já existe!' };
    const emailExistente = Object.values(USUARIOS).some(u => u.email === email);
    if (emailExistente) return { success: false, error: 'Email já cadastrado!' };

    USUARIOS[username] = {
        id: Object.keys(USUARIOS).length + 1,
        username, password, email,
        is_admin: false,
        profile: {
            fullName: '',
            cpf: '',
            birthDate: '',
            address: '',
            phone: '',
            photo: null
        }
    };
    salvarDados();
    return { success: true };
}

function login(username, password) {
    const user = USUARIOS[username];
    if (user && user.password === password) {
        state.user = { ...user };
        state.events = globalEvents.filter(e => e.user_id === user.id);
        state.tasks = globalTasks.filter(t => !t.event_id || t.event_id === null);
        state.selectedEvent = null;
        state.guests = [];
        state.suppliers = [];
        state.activeTab = 'dashboard';
        return true;
    }
    return false;
}

function logout() {
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
// FUNÇÕES DE PERFIL
// ============================================

function updateProfile(profileData) {
    if (state.user) {
        USUARIOS[state.user.username].profile = { ...USUARIOS[state.user.username].profile, ...profileData };
        state.user.profile = { ...state.user.profile, ...profileData };
        salvarDados();
        renderDashboard();
        showNotification('Perfil atualizado com sucesso!', 'success');
        return true;
    }
    return false;
}

function updateProfilePhoto(photoBase64) {
    if (state.user) {
        USUARIOS[state.user.username].profile.photo = photoBase64;
        state.user.profile.photo = photoBase64;
        salvarDados();
        renderDashboard();
        showNotification('Foto de perfil atualizada!', 'success');
        return true;
    }
    return false;
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem';
    notification.style.borderRadius = '8px';
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#e11d48';
    notification.style.color = 'white';
    notification.style.zIndex = '2000';
    notification.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// ============================================
// FUNÇÃO DE VALIDAÇÃO DE DATA DUPLICADA
// ============================================

function isDateDuplicate(date, excludeEventId = null) {
    return state.events.some(event => {
        if (excludeEventId && event.id === excludeEventId) return false;
        return event.event_date === date;
    });
}

// ============================================
// CRUD EVENTOS
// ============================================

function createEvent(data) {
    // Verificar se a data já existe
    if (data.event_date && isDateDuplicate(data.event_date)) {
        alert('Data já selecionada! Por favor, escolha outra data.');
        return false;
    }
    
    const newEvent = { id: nextIds.event++, user_id: state.user.id, ...data };
    globalEvents.push(newEvent);
    state.events.push(newEvent);
    salvarDados();
    return true;
}

function updateEvent(id, data) {
    // Verificar se a data já existe (excluindo o próprio evento)
    if (data.event_date && isDateDuplicate(data.event_date, id)) {
        alert('Data já selecionada! Por favor, escolha outra data.');
        return false;
    }
    
    const index = globalEvents.findIndex(e => e.id === id);
    if (index !== -1) {
        globalEvents[index] = { ...globalEvents[index], ...data };
        const ui = state.events.findIndex(e => e.id === id);
        if (ui !== -1) state.events[ui] = { ...state.events[ui], ...data };
        salvarDados();
        return true;
    }
    return false;
}

function deleteEvent(id) {
    globalEvents = globalEvents.filter(e => e.id !== id);
    state.events = state.events.filter(e => e.id !== id);
    globalGuests = globalGuests.filter(g => g.event_id !== id);
    globalSuppliers = globalSuppliers.filter(s => s.event_id !== id);
    globalTasks = globalTasks.filter(t => t.event_id !== id);
    if (state.selectedEvent === id) {
        state.selectedEvent = null;
        state.guests = [];
        state.suppliers = [];
        state.tasks = globalTasks.filter(t => !t.event_id);
    }
    salvarDados();
    return true;
}

// ============================================
// CRUD CONVIDADOS
// ============================================

function createGuest(data) {
    const newGuest = { id: nextIds.guest++, ...data };
    globalGuests.push(newGuest);
    if (newGuest.event_id === state.selectedEvent) state.guests.push(newGuest);
    salvarDados();
    return true;
}

function updateGuest(id, data) {
    const index = globalGuests.findIndex(g => g.id === id);
    if (index !== -1) {
        globalGuests[index] = { ...globalGuests[index], ...data };
        const ui = state.guests.findIndex(g => g.id === id);
        if (ui !== -1) state.guests[ui] = { ...state.guests[ui], ...data };
        salvarDados();
        return true;
    }
    return false;
}

function deleteGuest(id) {
    globalGuests = globalGuests.filter(g => g.id !== id);
    state.guests = state.guests.filter(g => g.id !== id);
    salvarDados();
    return true;
}

// ============================================
// CRUD FORNECEDORES
// ============================================

function createSupplier(data) {
    const newSupplier = { id: nextIds.supplier++, ...data, created_at: new Date().toISOString() };
    globalSuppliers.push(newSupplier);
    if (newSupplier.event_id === state.selectedEvent) state.suppliers.push(newSupplier);
    salvarDados();
    return true;
}

function updateSupplier(id, data) {
    const index = globalSuppliers.findIndex(s => s.id === id);
    if (index !== -1) {
        globalSuppliers[index] = { ...globalSuppliers[index], ...data };
        const ui = state.suppliers.findIndex(s => s.id === id);
        if (ui !== -1) state.suppliers[ui] = { ...state.suppliers[ui], ...data };
        salvarDados();
        return true;
    }
    return false;
}

function deleteSupplier(id) {
    globalSuppliers = globalSuppliers.filter(s => s.id !== id);
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    salvarDados();
    return true;
}

// ============================================
// CRUD TAREFAS
// ============================================

function createTask(data) {
    const newTask = { id: nextIds.task++, ...data, completed: false, created_at: new Date().toISOString() };
    globalTasks.push(newTask);
    state.tasks.push(newTask);
    salvarDados();
    return true;
}

function updateTask(id, data) {
    const index = globalTasks.findIndex(t => t.id === id);
    if (index !== -1) {
        globalTasks[index] = { ...globalTasks[index], ...data };
        const ui = state.tasks.findIndex(t => t.id === id);
        if (ui !== -1) state.tasks[ui] = { ...state.tasks[ui], ...data };
        salvarDados();
        return true;
    }
    return false;
}

function deleteTask(id) {
    globalTasks = globalTasks.filter(t => t.id !== id);
    state.tasks = state.tasks.filter(t => t.id !== id);
    salvarDados();
    return true;
}

function toggleTaskComplete(id) {
    const task = globalTasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        const uiTask = state.tasks.find(t => t.id === id);
        if (uiTask) uiTask.completed = task.completed;
        salvarDados();
        renderDashboard();
    }
}

function loadEventData(id) {
    state.guests = globalGuests.filter(g => g.event_id === id);
    state.suppliers = globalSuppliers.filter(s => s.event_id === id);
    state.tasks = globalTasks.filter(t => t.event_id === id || !t.event_id);
}

// ============================================
// UTILITÁRIOS
// ============================================

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR');
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
    const tarefasEvento = state.tasks;
    if (tarefasEvento.length === 0) return 0;
    const concluidas = tarefasEvento.filter(t => t.completed).length;
    return (concluidas / tarefasEvento.length) * 100;
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

    // Gráfico de pizza - Gastos por Categoria
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

    // Gráfico de pizza - Status dos Convidados
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
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} convidados (${((ctx.raw / state.guests.length) * 100).toFixed(1)}%)` } }
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
    const photoUrl = profile.photo || '';

    return `
        <div class="profile-section">
            <div class="profile-header">
                <div class="profile-avatar">
                    <div class="profile-avatar-large" id="profileAvatar">
                        ${photoUrl ? `<img src="${photoUrl}" alt="Foto de perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}
                    </div>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                    <button class="btn-secondary" onclick="document.getElementById('photoUpload').click()">Alterar Foto</button>
                </div>
                <div class="profile-info">
                    <h2>${profile.fullName || state.user?.username || 'Usuário'}</h2>
                    <p>${state.user?.email || ''}</p>
                    <p>Membro desde ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
            </div>

            <form id="profileForm">
                <div class="profile-form-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <div class="form-group"><label>Nome Completo</label><input type="text" name="fullName" value="${profile.fullName || ''}" placeholder="Seu nome completo"></div>
                    <div class="form-group"><label>CPF</label><input type="text" name="cpf" value="${profile.cpf || ''}" placeholder="000.000.000-00" maxlength="14"></div>
                    <div class="form-group"><label>Data de Nascimento</label><input type="date" name="birthDate" value="${profile.birthDate || ''}"></div>
                    <div class="form-group"><label>Telefone</label><input type="tel" name="phone" value="${profile.phone || ''}" placeholder="(11) 99999-9999"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>Endereço</label><input type="text" name="address" value="${profile.address || ''}" placeholder="Rua, número, bairro, cidade"></div>
                    <div class="form-group"><label>Email</label><input type="email" value="${state.user?.email || ''}" disabled style="background: #333;"></div>
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
    const totalTasks = state.tasks.length;
    const completedTasks = state.tasks.filter(t => t.completed).length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return `
        <div class="checklist-section">
            <div class="checklist-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
                <h2>Checklist do Casamento</h2>
                <div class="checklist-filters">
                    <button class="filter-btn ${state.taskFilter === 'all' ? 'active' : ''}" onclick="setTaskFilter('all')">Todas</button>
                    <button class="filter-btn ${state.taskFilter === 'pending' ? 'active' : ''}" onclick="setTaskFilter('pending')">Pendentes</button>
                    <button class="filter-btn ${state.taskFilter === 'completed' ? 'active' : ''}" onclick="setTaskFilter('completed')">Concluídas</button>
                    <button class="btn" onclick="openTaskModal()">Nova Tarefa</button>
                </div>
            </div>

            <div class="progress-section" style="margin-bottom: 1rem;">
                <h3>Progresso: ${progress.toFixed(0)}% concluído</h3>
                <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%">${progress.toFixed(0)}%</div></div>
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
                                <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete(${task.id})">
                                <div class="task-content">
                                    <div class="task-name">${task.name}<span class="task-priority priority-${task.priority}">${task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa'}</span></div>
                                    ${task.due_date ? `<div class="task-due-date">Vence: ${formatDate(task.due_date)}</div>` : ''}
                                </div>
                                <div class="task-actions">
                                    <button class="btn-icon" onclick="editTask(${task.id})">✏️</button>
                                    <button class="btn-icon" onclick="deleteTaskConfirm(${task.id})">🗑️</button>
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
        const temEvento = state.events.some(event => new Date(event.event_date).toDateString() === dataAtual.toDateString());
        dias.push({ dia: i, temEvento, data: dataAtual });
    }

    return `
        <div class="calendar-section">
            <div class="calendar-header"><h3>${primeiraSemana.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
            <div><button class="btn-secondary" onclick="mudarMes(-1)">◀</button><button class="btn-secondary" onclick="mudarMes(1)">▶</button></div></div>
            <div class="calendar-grid">
                ${diasSemana.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
                ${dias.map(dia => dia === null ? '<div class="calendar-day"></div>' : `<div class="calendar-day ${dia.temEvento ? 'has-event' : ''}" onclick="selecionarDataCalendario('${dia.data.toISOString()}')">${dia.dia}${dia.temEvento ? '🎉' : ''}</div>`).join('')}
            </div>
        </div>
    `;
}

// ============================================
// RENDERIZAÇÃO DO DASHBOARD
// ============================================

function renderDashboard() {
    const app = document.getElementById('app');
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const totalGasto = getTotalGasto();
    const orcamentoTotal = currentEvent?.budget_total || 0;
    const percentual = orcamentoTotal > 0 ? (totalGasto / orcamentoTotal) * 100 : 0;
    const progressoChecklist = getProgressoChecklist();
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || '';

    let modalHtml = '';
    if (state.showEventForm) modalHtml = renderEventForm();
    if (state.showGuestForm) modalHtml = renderGuestForm();
    if (state.showSupplierForm) modalHtml = renderSupplierForm();
    if (state.showTaskForm) modalHtml = renderTaskForm();

    app.innerHTML = `
        <div class="header">
            <div class="tabs">
                <button class="tab ${state.activeTab === 'dashboard' ? 'active' : ''}" onclick="setActiveTab('dashboard')">Dashboard</button>
                <button class="tab ${state.activeTab === 'checklist' ? 'active' : ''}" onclick="setActiveTab('checklist')">Checklist</button>
                <button class="tab ${state.activeTab === 'events' ? 'active' : ''}" onclick="setActiveTab('events')">Eventos</button>
                <button class="tab ${state.activeTab === 'calendar' ? 'active' : ''}" onclick="setActiveTab('calendar')">Calendário</button>
            </div>
            <div class="user-info" onclick="setActiveTab('profile')">
                <div class="profile-pic">${photoUrl ? `<img src="${photoUrl}" alt="Perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}</div>
                <span>${state.user?.username}</span>
                <button class="btn-logout" onclick="event.stopPropagation(); logout()">Sair</button>
            </div>
        </div>
        <div class="container">
            <div class="tab-content ${state.activeTab === 'dashboard' ? 'active' : ''}">
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
                ` : `<div class="empty-state"><p>Selecione um evento para ver o dashboard!</p><button class="btn" onclick="setActiveTab('events')">Ver meus eventos</button></div>`}
            </div>

            <div class="tab-content ${state.activeTab === 'checklist' ? 'active' : ''}">${renderChecklist()}</div>

            <div class="tab-content ${state.activeTab === 'events' ? 'active' : ''}">
                <div class="section-header"><h2>Meus Eventos</h2><button class="btn" onclick="openEventModal()">Novo Evento</button></div>
                ${state.events.length === 0 ? '<div class="empty-state">Nenhum evento. Crie seu primeiro evento!</div>' : `
                    <div class="events-grid">${state.events.map(event => {
                        const gastosEvento = globalSuppliers.filter(s => s.event_id === event.id).reduce((s, i) => s + (i.value || 0), 0);
                        const perc = event.budget_total ? (gastosEvento / event.budget_total) * 100 : 0;
                        return `<div class="event-card ${state.selectedEvent === event.id ? 'selected' : ''}" onclick="selectEvent(${event.id})">
                            <div class="event-card-header"><h4>${event.name || event.couple_names || 'Evento'}</h4></div>
                            <div class="event-card-body">
                                <p><strong>Tipo:</strong> ${event.event_type || 'Tipo'}</p>
                                <p><strong>Orçamento:</strong> ${formatCurrency(event.budget_total)}</p>
                                <p><strong>Gasto:</strong> ${formatCurrency(gastosEvento)} (${perc.toFixed(0)}%)</p>
                                <p><strong>Data:</strong> ${formatDate(event.event_date)}</p>
                            </div>
                            <div style="padding:0.75rem; display:flex; gap:0.5rem;">
                                <button class="btn-secondary" style="flex:1" onclick="event.stopPropagation(); editEvent(${event.id})">Editar</button>
                                <button class="btn-secondary" style="flex:1" onclick="event.stopPropagation(); deleteEventConfirm(${event.id})">Excluir</button>
                            </div>
                        </div>`;
                    }).join('')}</div>
                `}
                ${state.selectedEvent && currentEvent ? `
                    <div><div class="section-header"><h2>Gerenciando: ${currentEvent.name || currentEvent.couple_names || 'Evento'}</h2><button class="btn-secondary" onclick="selectEvent(null)">Trocar Evento</button></div>
                    <div class="section-header"><h2>Convidados</h2><button class="btn" onclick="openGuestModal()">Adicionar</button></div>
                    <div class="guest-list">${state.guests.map(g => `<div class="guest-card"><div><strong>${g.name}</strong><div style="font-size:0.7rem; color:#888;">${g.status === 'confirmado' ? 'Confirmado' : g.status === 'recusado' ? 'Recusado' : 'Pendente'}${g.table_name ? ` • Mesa ${g.table_name}` : ''}</div></div><div><button class="btn-icon" onclick="editGuest(${g.id})">✏️</button><button class="btn-icon" onclick="deleteGuestConfirm(${g.id})">🗑️</button></div></div>`).join('')}${state.guests.length === 0 ? '<div class="empty-state">Nenhum convidado</div>' : ''}</div>
                    <div class="section-header"><h2>Fornecedores</h2><button class="btn" onclick="openSupplierModal()">Adicionar</button></div>
                    <div class="supplier-list">${state.suppliers.map(s => `<div class="supplier-card"><div><strong>${s.name}</strong><div style="font-size:0.7rem; color:#888;">${s.category} • ${formatCurrency(s.value)}<br>${s.status === 'contratado' ? 'Contratado' : s.status === 'negociacao' ? 'Negociação' : 'Cotado'}</div></div><div><button class="btn-icon" onclick="editSupplier(${s.id})">✏️</button><button class="btn-icon" onclick="deleteSupplierConfirm(${s.id})">🗑️</button></div></div>`).join('')}${state.suppliers.length === 0 ? '<div class="empty-state">Nenhum fornecedor</div>' : ''}</div></div>
                ` : state.events.length > 0 ? '<div class="empty-state">Clique em um evento para gerenciar</div>' : ''}
            </div>

            <div class="tab-content ${state.activeTab === 'calendar' ? 'active' : ''}">${renderCalendario()}</div>
            <div class="tab-content ${state.activeTab === 'profile' ? 'active' : ''}">${renderPerfil()}</div>
        </div>
        ${modalHtml}
    `;
    criarGraficos();

    const profileForm = document.getElementById('profileForm');
    if (profileForm) profileForm.addEventListener('submit', (e) => { e.preventDefault(); updateProfile(Object.fromEntries(new FormData(e.target))); });
    const photoUpload = document.getElementById('photoUpload');
    if (photoUpload) photoUpload.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => updateProfilePhoto(event.target.result); reader.readAsDataURL(file); } });
    if (state.showEventForm) document.getElementById('eventForm')?.addEventListener('submit', handleEventSubmit);
    if (state.showGuestForm) document.getElementById('guestForm')?.addEventListener('submit', handleGuestSubmit);
    if (state.showSupplierForm) document.getElementById('supplierForm')?.addEventListener('submit', handleSupplierSubmit);
    if (state.showTaskForm) document.getElementById('taskForm')?.addEventListener('submit', handleTaskSubmit);
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
            <div style="display:flex; gap:1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeEventModal()">Cancelar</button></div>
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
            <div style="display:flex; gap:1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeGuestModal()">Cancelar</button></div>
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
            <div style="display:flex; gap:1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeSupplierModal()">Cancelar</button></div>
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
            <div style="display:flex; gap:1rem;"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeTaskModal()">Cancelar</button></div>
        </form></div></div>`;
}

// ============================================
// FUNÇÕES DE RECUPERAÇÃO DE SENHA
// ============================================

function showForgotPassword() {
    document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-box">
                <div class="auth-logo">
                    <h1>LA VIE</h1>
                    <div class="subtitle">CASAMENTOS</div>
                    <div class="tagline">Recuperar acesso</div>
                </div>
                <div class="auth-card">
                    <h2 style="color:#ffd700; text-align:center; margin-bottom:1rem;">Esqueceu a senha?</h2>
                    <p style="color:#888; text-align:center; margin-bottom:1.5rem; font-size:0.8rem;">
                        Digite seu email e enviaremos um link para redefinir sua senha.
                    </p>
                    <div id="forgotMessage" class="error-message" style="display:none"></div>
                    <form id="forgotForm" class="auth-form">
                        <div class="form-group"><label>EMAIL CADASTRADO</label><input type="email" id="forgotEmail" placeholder="seuemail@exemplo.com" required></div>
                        <button type="submit" class="auth-btn">ENVIAR LINK DE RECUPERAÇÃO</button>
                        <div class="back-to-login">
                            <a onclick="renderAuth()">← Voltar para o login</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('forgotForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('forgotEmail').value;
        const msgDiv = document.getElementById('forgotMessage');
        
        const usuario = Object.values(USUARIOS).find(u => u.email === email);
        
        if (usuario) {
            const resetToken = Math.random().toString(36).substring(2, 15);
            localStorage.setItem(`reset_${email}`, resetToken);
            
            msgDiv.style.display = 'block';
            msgDiv.className = 'success-message';
            msgDiv.innerHTML = `Link de recuperação enviado para ${email}!<br><small>Token: ${resetToken}</small><br><br>`;
            
            const buttonDiv = document.createElement('div');
            buttonDiv.style.marginTop = '1rem';
            buttonDiv.innerHTML = `<button class="auth-btn" onclick="showResetPassword('${email}', '${resetToken}')">REDEFINIR SENHA</button>`;
            msgDiv.appendChild(buttonDiv);
        } else {
            msgDiv.style.display = 'block';
            msgDiv.className = 'error-message';
            msgDiv.textContent = 'Email não encontrado! Verifique se você está cadastrado.';
        }
    });
}

function showResetPassword(email, token) {
    document.getElementById('app').innerHTML = `
        <div class="auth-container">
            <div class="auth-box">
                <div class="auth-logo">
                    <h1>LA VIE</h1>
                    <div class="subtitle">CASAMENTOS</div>
                    <div class="tagline">Redefinir senha</div>
                </div>
                <div class="auth-card">
                    <h2 style="color:#ffd700; text-align:center; margin-bottom:1rem;">Redefinir senha</h2>
                    <p style="color:#888; text-align:center; margin-bottom:1.5rem; font-size:0.8rem;">
                        Digite sua nova senha para o email: <strong style="color:#ffd700;">${email}</strong>
                    </p>
                    <div id="resetMessage" class="error-message" style="display:none"></div>
                    <form id="resetForm" class="auth-form">
                        <div class="form-group"><label>NOVA SENHA</label><input type="password" id="newPassword" placeholder="Mínimo 4 caracteres" required></div>
                        <div class="form-group"><label>CONFIRMAR NOVA SENHA</label><input type="password" id="confirmNewPassword" placeholder="Digite novamente" required></div>
                        <button type="submit" class="auth-btn">SALVAR NOVA SENHA</button>
                        <div class="back-to-login">
                            <a onclick="renderAuth()">← Voltar para o login</a>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('resetForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const msgDiv = document.getElementById('resetMessage');
        
        if (newPassword !== confirmPassword) {
            msgDiv.style.display = 'block';
            msgDiv.className = 'error-message';
            msgDiv.textContent = 'As senhas não coincidem!';
            return;
        }
        
        if (newPassword.length < 4) {
            msgDiv.style.display = 'block';
            msgDiv.className = 'error-message';
            msgDiv.textContent = 'A senha deve ter pelo menos 4 caracteres!';
            return;
        }
        
        const usuario = Object.values(USUARIOS).find(u => u.email === email);
        if (usuario) {
            const username = usuario.username;
            USUARIOS[username].password = newPassword;
            salvarDados();
            
            msgDiv.style.display = 'block';
            msgDiv.className = 'success-message';
            msgDiv.innerHTML = 'Senha alterada com sucesso! Redirecionando para o login...';
            
            localStorage.removeItem(`reset_${email}`);
            
            setTimeout(() => {
                state.authMode = 'login';
                renderAuth();
            }, 2000);
        }
    });
}

// ============================================
// TELA DE LOGIN
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
                        <button class="auth-tab ${isLogin ? 'active' : ''}" onclick="setAuthMode('login')">Login</button>
                        <button class="auth-tab ${!isLogin ? 'active' : ''}" onclick="setAuthMode('register')">Cadastrar</button>
                    </div>
                    <div id="authMessage" class="error-message" style="display:none"></div>
                    ${isLogin ? `
                        <form id="loginForm" class="auth-form">
                            <div class="form-group"><label>USUÁRIO</label><input type="text" id="loginUsername" placeholder="Digite seu usuário" required></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="loginPassword" placeholder="Digite sua senha" required></div>
                            <button type="submit" class="auth-btn">ENTRAR</button>
                            <div class="forgot-password-link">
                                <a onclick="showForgotPassword()">Esqueceu sua senha?</a>
                            </div>
                        </form>
                    ` : `
                        <form id="registerForm" class="auth-form">
                            <div class="form-group"><label>USUÁRIO</label><input type="text" id="regUsername" placeholder="Escolha um usuário" required></div>
                            <div class="form-group"><label>EMAIL</label><input type="email" id="regEmail" placeholder="Seu melhor email" required></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="regPassword" placeholder="Mínimo 4 caracteres" required></div>
                            <div class="form-group"><label>CONFIRMAR SENHA</label><input type="password" id="regConfirmPassword" placeholder="Digite novamente" required></div>
                            <button type="submit" class="auth-btn">CADASTRAR</button>
                        </form>
                    `}
                </div>
            </div>
        </div>
    `;

    if (isLogin) {
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            if (login(username, password)) renderDashboard();
            else { const msg = document.getElementById('authMessage'); msg.style.display = 'block'; msg.textContent = 'Usuário ou senha inválidos!'; }
        });
    } else {
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;
            const msg = document.getElementById('authMessage');
            if (password !== confirm) { msg.style.display = 'block'; msg.textContent = 'Senhas não coincidem!'; return; }
            if (password.length < 4) { msg.style.display = 'block'; msg.textContent = 'Mínimo 4 caracteres!'; return; }
            const result = register(username, password, email);
            if (result.success) {
                msg.style.display = 'block'; msg.className = 'success-message'; msg.textContent = 'Cadastro realizado! Faça login.';
                setTimeout(() => { state.authMode = 'login'; renderAuth(); }, 2000);
            } else { msg.style.display = 'block'; msg.textContent = result.error; }
        });
    }
}

// ============================================
// HANDLERS
// ============================================

async function handleEventSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.budget_total = parseFloat(data.budget_total || 0);
    (state.editingEvent ? updateEvent(state.editingEvent.id, data) : createEvent(data)) ? (closeEventModal(), renderDashboard()) : alert('Erro ao salvar evento');
}

async function handleGuestSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    (state.editingGuest ? updateGuest(state.editingGuest.id, data) : createGuest(data)) ? (closeGuestModal(), renderDashboard()) : alert('Erro ao salvar convidado');
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    data.value = parseFloat(data.value || 0);
    (state.editingSupplier ? updateSupplier(state.editingSupplier.id, data) : createSupplier(data)) ? (closeSupplierModal(), renderDashboard()) : alert('Erro ao salvar fornecedor');
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (state.editingTask) updateTask(state.editingTask.id, data);
    else createTask({ ...data, event_id: state.selectedEvent || null });
    closeTaskModal();
    renderDashboard();
}

// ============================================
// FUNÇÕES GLOBAIS
// ============================================

window.setAuthMode = (m) => { state.authMode = m; renderAuth(); };
window.setActiveTab = (tab) => { state.activeTab = tab; renderDashboard(); };
window.setTaskFilter = (filter) => { state.taskFilter = filter; renderDashboard(); };
window.selectEvent = (id) => { state.selectedEvent = id; loadEventData(id); renderDashboard(); };
window.mudarMes = (d) => { const nd = new Date(state.calendarYear, state.calendarMonth + d, 1); state.calendarYear = nd.getFullYear(); state.calendarMonth = nd.getMonth(); renderDashboard(); };
window.selecionarDataCalendario = (dataISO) => {
    const data = new Date(dataISO);
    const evento = state.events.find(e => new Date(e.event_date).toDateString() === data.toDateString());
    if (evento) { state.selectedEvent = evento.id; loadEventData(evento.id); setActiveTab('dashboard'); }
    else alert(`Nenhum evento em ${data.toLocaleDateString('pt-BR')}`);
};
window.toggleTaskComplete = (id) => { toggleTaskComplete(id); renderDashboard(); };
window.showForgotPassword = showForgotPassword;
window.showResetPassword = showResetPassword;
window.openEventModal = () => { state.editingEvent = null; state.showEventForm = true; renderDashboard(); };
window.editEvent = (id) => { state.editingEvent = state.events.find(e => e.id === id); state.showEventForm = true; renderDashboard(); };
window.closeEventModal = () => { state.showEventForm = false; state.editingEvent = null; renderDashboard(); };
window.deleteEventConfirm = (id) => { if (confirm('Excluir evento?')) deleteEvent(id) && renderDashboard(); };
window.openGuestModal = () => { if (!state.selectedEvent) { alert('Selecione um evento primeiro!'); return; } state.editingGuest = null; state.showGuestForm = true; renderDashboard(); };
window.editGuest = (id) => { state.editingGuest = state.guests.find(g => g.id === id); state.showGuestForm = true; renderDashboard(); };
window.closeGuestModal = () => { state.showGuestForm = false; state.editingGuest = null; renderDashboard(); };
window.deleteGuestConfirm = (id) => { if (confirm('Excluir convidado?')) deleteGuest(id) && renderDashboard(); };
window.openSupplierModal = () => { if (!state.selectedEvent) { alert('Selecione um evento primeiro!'); return; } state.editingSupplier = null; state.showSupplierForm = true; renderDashboard(); };
window.editSupplier = (id) => { state.editingSupplier = state.suppliers.find(s => s.id === id); state.showSupplierForm = true; renderDashboard(); };
window.closeSupplierModal = () => { state.showSupplierForm = false; state.editingSupplier = null; renderDashboard(); };
window.deleteSupplierConfirm = (id) => { if (confirm('Excluir fornecedor?')) deleteSupplier(id) && renderDashboard(); };
window.openTaskModal = () => { state.editingTask = null; state.showTaskForm = true; renderDashboard(); };
window.editTask = (id) => { state.editingTask = state.tasks.find(t => t.id === id); state.showTaskForm = true; renderDashboard(); };
window.closeTaskModal = () => { state.showTaskForm = false; state.editingTask = null; renderDashboard(); };
window.deleteTaskConfirm = (id) => { if (confirm('Excluir tarefa?')) deleteTask(id) && renderDashboard(); };
window.logout = logout;

function init() { renderAuth(); }
init();
