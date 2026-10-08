// ============================================
// LA VIE CASAMENTOS - SCRIPT COMPLETO
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
    createDefaultTasksForEvent,
    suggestSuppliersIA, saveSuggestedSupplier, getSavedSuppliers, deleteSavedSupplier,
    SUPPLIERS_DB
} from './firebase-config.js';

// ============================================
// STATE
// ============================================

let state = {
    user: null,
    events: [],
    guests: [],
    suppliers: [],
    tasks: [],
    savedSuppliers: [],
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
    charts: {},
    searchTerm: '',
    searchSupplierTerm: '',
    filterStatus: 'todos',
    sortBy: 'name',
    sortOrder: 'asc',
    currentPage: 1,
    itemsPerPage: 20,
    currentSupplierPage: 1,
    suppliersPerPage: 20,
    formDirty: false,
    searchTimeout: null,
    supplierSearchTimeout: null
};

// ============================================
// CONFIGURAÇÕES
// ============================================

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls'];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('pt-BR');
}

function detectSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (!localStorage.getItem('selectedTheme')) {
            applyTheme('dark');
        }
    }
}

function checkSessionError(error) {
    if (error?.includes('permission-denied') || 
        error?.includes('unauthenticated') ||
        error?.includes('auth/invalid-user-token')) {
        showNotification('Sua sessão expirou. Faça login novamente.', 'error');
        setTimeout(() => forceLogoutToLogin(), 2000);
        return true;
    }
    return false;
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem 1.5rem';
    notification.style.borderRadius = '50px';
    notification.style.backgroundColor = type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#e11d48';
    notification.style.color = 'white';
    notification.style.zIndex = '2000';
    notification.style.fontSize = '0.85rem';
    notification.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    notification.style.animation = 'slideInRight 0.3s ease';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    if (type === 'warning' && Notification.permission === 'granted') {
        new Notification('La Vie Casamentos', { body: message, icon: './assets/icon-192.png' });
    }
}

// ============================================
// LOADER
// ============================================

let loaderTimeout = null;

function showLoader(message = 'Carregando...') {
    hideLoader();
    const loader = document.createElement('div');
    loader.id = 'globalLoader';
    loader.className = 'loader-overlay';
    loader.innerHTML = `
        <div class="spinner-container">
            <div class="loader-logo">💛</div>
            <div class="spinner"></div>
            <p class="spinner-text">${message}</p>
            <div class="loader-progress">
                <div class="loader-progress-bar" id="loaderProgressBar"></div>
            </div>
        </div>
    `;
    document.body.appendChild(loader);
    
    setTimeout(() => {
        const progressBar = document.getElementById('loaderProgressBar');
        if (progressBar) {
            progressBar.style.width = '30%';
            setTimeout(() => { if (progressBar) progressBar.style.width = '70%'; }, 500);
        }
    }, 100);
    
    loaderTimeout = setTimeout(() => hideLoader(), 30000);
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => loader.remove(), 200);
    }
    if (loaderTimeout) { clearTimeout(loaderTimeout); loaderTimeout = null; }
}

function updateLoaderProgress(percent) {
    const progressBar = document.getElementById('loaderProgressBar');
    if (progressBar) progressBar.style.width = Math.min(100, Math.max(0, percent)) + '%';
}

function updateLoaderMessage(message) {
    const textElement = document.querySelector('#globalLoader .spinner-text');
    if (textElement) textElement.textContent = message;
}

// ============================================
// MODAL DE CONFIRMAÇÃO
// ============================================

function showConfirmModal(title, message, onConfirm, onCancel = null, isDanger = true) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <div class="modal-icon" style="font-size: 3rem; margin-bottom: 0.5rem;">${isDanger ? '⚠️' : '❓'}</div>
            <h3 style="color: #ffd700; margin-bottom: 0.5rem; font-size: 1.3rem;">${escapeHtml(title)}</h3>
            <p style="margin-bottom: 1.5rem; color: #ccc; line-height: 1.5;">${escapeHtml(message)}</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button class="btn" id="confirmYes" style="${isDanger ? 'background: #e11d48;' : 'background: #10b981;'}">Confirmar</button>
                <button class="btn-secondary" id="confirmNo">Cancelar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('confirmYes').onclick = () => { modal.remove(); if (onConfirm) onConfirm(); };
    document.getElementById('confirmNo').onclick = () => { modal.remove(); if (onCancel) onCancel(); };
}

function setFormDirty(dirty = true) { state.formDirty = dirty; }

window.addEventListener('beforeunload', (e) => {
    if (state.formDirty) { e.preventDefault(); e.returnValue = ''; return ''; }
});

// ============================================
// FUNÇÕES DE RENDERIZAÇÃO BÁSICAS
// ============================================

function renderAuth() {
    const isLogin = state.authMode === 'login';
    const app = document.getElementById('app');
    if (!app) return;
    
    app.innerHTML = `
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
                    ${isLogin ? `
                        <button id="googleLoginBtn" class="auth-btn google-btn"><i class="fab fa-google"></i> Entrar com Google</button>
                        <div class="divider"><span>ou</span></div>
                        <form id="loginForm">
                            <div class="form-group"><label>EMAIL</label><input type="email" id="loginEmail" required placeholder="seu@email.com"></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="loginPassword" required placeholder="••••••"></div>
                            <button type="submit" class="auth-btn">ENTRAR</button>
                            <div style="text-align: center; margin-top: 1rem;">
                                <a onclick="forgotPassword()" style="cursor: pointer; color: #ffd700;">Esqueceu sua senha?</a> | 
                                <a onclick="resendVerification()" style="cursor: pointer; color: #ffd700;">Reenviar verificação</a>
                            </div>
                        </form>
                    ` : `
                        <form id="registerForm">
                            <div class="form-group"><label>USUÁRIO</label><input type="text" id="regUsername" required placeholder="Como quer ser chamado?"></div>
                            <div class="form-group"><label>EMAIL</label><input type="email" id="regEmail" required placeholder="seu@email.com"></div>
                            <div class="form-group"><label>SENHA</label><input type="password" id="regPassword" required placeholder="mínimo 6 caracteres"></div>
                            <div class="form-group"><label>CONFIRMAR</label><input type="password" id="regConfirmPassword" required placeholder="digite novamente"></div>
                            <button type="submit" class="auth-btn">CADASTRAR</button>
                        </form>
                    `}
                </div>
            </div>
        </div>
    `;
    
    if (isLogin) {
        document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
            showLoader('Entrando...');
            const result = await loginWithGoogle();
            hideLoader();
            if (result.success) {
                state.user = result.user;
                await loadUserData(result.user);
            } else {
                showNotification(result.error, 'error');
            }
        });
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            showLoader('Entrando...');
            const result = await loginWithEmail(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            hideLoader();
            if (result.success) {
                state.user = result.user;
                await loadUserData(result.user);
            } else {
                showNotification(result.error === 'email-not-verified' ? result.message : result.error, 'error');
            }
        });
    } else {
        document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;
            if (pwd !== confirm) { showNotification('Senhas não coincidem', 'error'); return; }
            if (pwd.length < 6) { showNotification('Mínimo 6 caracteres', 'error'); return; }
            showLoader('Cadastrando...');
            const result = await registerWithEmail(document.getElementById('regEmail').value, pwd, document.getElementById('regUsername').value);
            hideLoader();
            if (result.success) {
                showNotification(`${result.message}. Verifique seu email!`, 'success');
                setTimeout(() => setAuthMode('login'), 4000);
            } else {
                showNotification(result.error, 'error');
            }
        });
    }
}

// ============================================
// LOGOUT
// ============================================

async function logout() {
    console.log("🔴 Iniciando logout...");
    showLoader('Saindo...');
    
    try {
        await logoutUser();
        
        state.user = null;
        state.events = [];
        state.selectedEvent = null;
        state.guests = [];
        state.suppliers = [];
        state.tasks = [];
        state.savedSuppliers = [];
        state.activeTab = 'dashboard';
        state.showEventForm = false;
        state.showGuestForm = false;
        state.showSupplierForm = false;
        state.showTaskForm = false;
        state.editingEvent = null;
        state.editingGuest = null;
        state.editingSupplier = null;
        state.editingTask = null;
        state.searchTerm = '';
        state.searchSupplierTerm = '';
        state.filterStatus = 'todos';
        state.currentPage = 1;
        state.currentSupplierPage = 1;
        
        if (state.charts) {
            if (state.charts.pizzaCategorias) {
                try { state.charts.pizzaCategorias.destroy(); } catch(e) {}
                state.charts.pizzaCategorias = null;
            }
            if (state.charts.pizzaStatus) {
                try { state.charts.pizzaStatus.destroy(); } catch(e) {}
                state.charts.pizzaStatus = null;
            }
        }
        if (typeof expenseChart !== 'undefined' && expenseChart) {
            try { expenseChart.destroy(); } catch(e) {}
            expenseChart = null;
        }
        
        document.querySelectorAll('.modal').forEach(modal => modal.remove());
        
        if (state.searchTimeout) clearTimeout(state.searchTimeout);
        if (state.supplierSearchTimeout) clearTimeout(state.supplierSearchTimeout);
        if (loaderTimeout) clearTimeout(loaderTimeout);
        
        hideLoader();
        
        renderAuth();
        state.authMode = 'login';
        
        showNotification('Você saiu do sistema', 'success');
        console.log("🔴 Logout concluído, tela de login exibida");
        
    } catch (error) {
        console.error('🔴 Erro no logout:', error);
        hideLoader();
        forceLogoutToLogin();
    }
}

function forceLogoutToLogin() {
    console.log("🚨 Forçando logout para tela de login...");
    
    state.user = null;
    state.events = [];
    state.selectedEvent = null;
    state.guests = [];
    state.suppliers = [];
    state.tasks = [];
    state.savedSuppliers = [];
    
    if (typeof logoutUser === 'function') {
        logoutUser().catch(() => {});
    }
    
    localStorage.removeItem('lastBackup');
    localStorage.removeItem('demoLoaded');
    localStorage.removeItem('restorePending');
    sessionStorage.clear();
    
    renderAuth();
    state.authMode = 'login';
    
    showNotification('Você saiu do sistema', 'success');
}

// ============================================
// CHECK AUTH STATE
// ============================================

async function checkAuthState() {
    console.log("🔍 Verificando estado de autenticação...");
    
    onAuthChange(async (user) => {
        console.log("🔄 onAuthChange disparado. User:", user ? "Logado" : "Deslogado");
        
        if (user) {
            console.log("✅ Usuário logado:", user.email);
            state.user = user;
            state.events = await getUserEvents(state.user.id);
            state.tasks = await getUserTasks(state.user.id);
            renderDashboard();
            autoBackup();
            loadDemoData();
            detectSystemTheme();
            requestNotificationPermission();
        } else {
            console.log("❌ Usuário deslogado - Mostrando tela de login");
            
            state.user = null;
            state.events = [];
            state.selectedEvent = null;
            state.guests = [];
            state.suppliers = [];
            state.tasks = [];
            state.savedSuppliers = [];
            
            document.querySelectorAll('.modal').forEach(modal => modal.remove());
            renderAuth();
            state.authMode = 'login';
        }
    });
}

// ============================================
// FUNÇÕES DE AUTENTICAÇÃO AUXILIARES
// ============================================

window.forgotPassword = async function() {
    const email = prompt('Digite seu e-mail para recuperar a senha:');
    if (!email || !email.includes('@')) { showNotification('Digite um e-mail válido', 'error'); return; }
    const result = await sendPasswordResetEmailFunction(email);
    showNotification(result.success ? 'Email de recuperação enviado!' : 'Usuário não encontrado', result.success ? 'success' : 'error');
};

window.resendVerification = async function() {
    const email = prompt('Digite seu e-mail para receber um novo link de verificação:');
    if (!email || !email.includes('@')) { showNotification('Digite um e-mail válido', 'error'); return; }
    const result = await loginWithEmail(email, 'dummy');
    if (result.error === 'email-not-verified') {
        const sendResult = await sendVerificationEmail();
        showNotification(sendResult.success ? 'Novo email enviado!' : 'Erro ao enviar', sendResult.success ? 'success' : 'error');
    } else {
        showNotification(result.success ? 'Email já verificado!' : 'Usuário não encontrado', 'error');
    }
};

async function loadUserData(user) {
    state.user = user;
    state.events = await getUserEvents(state.user.id);
    if (state.selectedEvent) {
        state.guests = await getEventGuests(state.selectedEvent);
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
        await loadSavedSuppliersList();
    } else {
        state.tasks = await getUserTasks(state.user.id);
    }
    renderDashboard();
}

// ============================================
// BACKUP E MODO DEMO
// ============================================

async function autoBackup() {
    const lastBackup = localStorage.getItem('lastBackup');
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    if (!lastBackup || lastBackup < weekAgo) {
        const backupData = {
            version: '1.0',
            date: new Date().toISOString(),
            events: state.events,
            guests: state.guests,
            suppliers: state.suppliers,
            tasks: state.tasks,
            savedSuppliers: state.savedSuppliers
        };
        const backupKey = `backup_${new Date().toISOString().slice(0, 10)}`;
        localStorage.setItem(backupKey, JSON.stringify(backupData));
        localStorage.setItem('lastBackup', Date.now());
        
        const backups = Object.keys(localStorage).filter(k => k.startsWith('backup_'));
        if (backups.length > 5) {
            backups.sort().reverse().slice(5).forEach(k => localStorage.removeItem(k));
        }
        console.log('✅ Backup automático realizado');
    }
}

async function loadDemoData() {
    if (state.events.length === 0 && !localStorage.getItem('demoLoaded')) {
        showConfirmModal('🎉 Modo Demonstração', 
            'Deseja carregar dados de exemplo para testar o sistema?', 
            async () => {
                await createDemoEvent();
                localStorage.setItem('demoLoaded', 'true');
                showNotification('Dados de demonstração carregados!', 'success');
                location.reload();
            }, null, false);
    }
}

async function createDemoEvent() {
    const demoEvent = {
        name: 'Casamento dos Sonhos',
        couple_names: 'Ana & João',
        event_type: 'Casamento',
        theme: 'classico',
        budget_total: 50000,
        event_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        event_time: '16:00',
        venue: 'Espaço Villa Serena'
    };
    
    const result = await createEvent(demoEvent, state.user.id);
    if (result.success) {
        const demoGuests = [
            { name: 'Maria Silva', group_name: 'Família Silva', status: 'confirmado', table_name: 'Mesa 01', phone: '(11) 99999-1111' },
            { name: 'Carlos Santos', group_name: 'Amigos', status: 'pendente', table_name: 'Mesa 05', phone: '(11) 99999-2222' },
            { name: 'Patrícia Oliveira', group_name: 'Família Oliveira', status: 'confirmado', table_name: 'Mesa 02', phone: '(11) 99999-3333' },
            { name: 'Roberto Almeida', group_name: 'Amigos', status: 'recusado', table_name: 'Mesa 05', phone: '(11) 99999-4444' },
            { name: 'Fernanda Costa', group_name: 'Colegas', status: 'pendente', table_name: 'Mesa 08', phone: '(11) 99999-5555' }
        ];
        for (const guest of demoGuests) { await createGuest(guest, result.id); }
        
        const demoSuppliers = [
            { name: 'Buffet Gourmet', category: 'Buffet', status: 'contratado', value: 15000, contact: 'contato@buffetgourmet.com' },
            { name: 'Fotografia Memórias', category: 'Fotografia', status: 'contratado', value: 5000, contact: '(11) 99999-6666' },
            { name: 'Decoração dos Sonhos', category: 'Decoração', status: 'negociacao', value: 8000, contact: '(11) 99999-7777' }
        ];
        for (const supplier of demoSuppliers) { await createSupplier(supplier, result.id); }
    }
}

// ============================================
// COMPARTILHAMENTO DO EVENTO
// ============================================

async function shareEvent(eventId) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;
    
    const shareLink = `https://la-vie-casamentos.web.app/evento/${eventId}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: event.name || event.couple_names || 'Evento',
                text: `Confira os detalhes do evento: ${event.couple_names || event.name}`,
                url: shareLink
            });
            showNotification('Compartilhado com sucesso!', 'success');
        } catch (err) {
            console.log('Erro ao compartilhar:', err);
        }
    } else {
        await navigator.clipboard.writeText(shareLink);
        showNotification('Link copiado! Compartilhe com os noivos.', 'success');
    }
}

// ============================================
// EXPORTAÇÃO EM PDF
// ============================================

async function exportToPDF() {
    showLoader('Gerando PDF...');
    
    try {
        if (typeof html2pdf === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        
        const element = document.querySelector('.tab-content.active');
        if (!element) throw new Error('Nenhum conteúdo para exportar');
        
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `relatorio_la_vie_${new Date().toISOString().slice(0, 19)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        
        await html2pdf().set(opt).from(element).save();
        showNotification('PDF gerado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showNotification('Erro ao gerar PDF', 'error');
    } finally {
        hideLoader();
    }
}

// ============================================
// GRÁFICO DE EVOLUÇÃO DE GASTOS
// ============================================

let expenseChart = null;

function createExpenseTimeline() {
    const canvas = document.getElementById('expenseTimeline');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const expensesByMonth = {};
    state.suppliers.forEach(supplier => {
        if (supplier.created_at && supplier.value) {
            const month = new Date(supplier.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
            expensesByMonth[month] = (expensesByMonth[month] || 0) + supplier.value;
        }
    });
    
    const months = Object.keys(expensesByMonth).sort((a, b) => {
        const [aMonth, aYear] = a.split(' ');
        const [bMonth, bYear] = b.split(' ');
        return aYear.localeCompare(bYear) || aMonth.localeCompare(bMonth);
    });
    
    const values = months.map(m => expensesByMonth[m]);
    let cumulative = 0;
    const cumulativeValues = values.map(v => cumulative += v);
    
    if (expenseChart) expenseChart.destroy();
    
    expenseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Gastos Acumulados',
                data: cumulativeValues,
                borderColor: '#ffd700',
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffd700',
                pointBorderColor: '#1a1a1a',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#fff' } },
                tooltip: { callbacks: { label: (ctx) => `Total: ${formatCurrency(ctx.raw)}` } }
            },
            scales: {
                y: { ticks: { color: '#fff', callback: (v) => formatCurrency(v) }, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });
}

// ============================================
// NOTIFICAÇÕES
// ============================================

async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notificações permitidas');
            checkUpcomingTasks();
        }
    }
}

function checkUpcomingTasks() {
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    state.tasks.forEach(task => {
        if (!task.completed && task.due_date) {
            const dueDate = new Date(task.due_date);
            if (dueDate <= threeDaysFromNow && dueDate >= today) {
                showNotification(`📋 Tarefa próxima: ${task.name}`, 'warning');
            }
        }
    });
}

// ============================================
// FUNÇÕES DE SUPORTE
// ============================================

function getTotalGasto() { return state.suppliers.reduce((s, i) => s + (i.value || 0), 0); }

function getGastosPorCategoria() {
    const cats = {};
    state.suppliers.forEach(s => { const cat = s.category || 'Outros'; cats[cat] = (cats[cat] || 0) + (s.value || 0); });
    return cats;
}

function getStatusConvidados() {
    const status = { confirmado: 0, pendente: 0, recusado: 0 };
    state.guests.forEach(g => { if (g.status === 'confirmado') status.confirmado++; else if (g.status === 'recusado') status.recusado++; else status.pendente++; });
    return status;
}

function getProgressoChecklist() {
    if (state.tasks.length === 0) return 0;
    return (state.tasks.filter(t => t.completed).length / state.tasks.length) * 100;
}

function validatePhone(phone) {
    if (!phone) return true;
    const numbers = phone.replace(/\D/g, '');
    return numbers.length === 10 || numbers.length === 11;
}

function validateCPF(cpf) {
    if (!cpf) return true;
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    
    let sum = 0, rest;
    for (let i = 1; i <= 9; i++) sum += parseInt(cpf.substring(i-1, i)) * (11 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cpf.substring(9, 10))) return false;
    
    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cpf.substring(i-1, i)) * (12 - i);
    rest = (sum * 10) % 11;
    if ((rest === 10) || (rest === 11)) rest = 0;
    if (rest !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

function formatPhone(input) {
    let numbers = input.replace(/\D/g, '');
    if (numbers.length === 11) return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    else if (numbers.length === 10) return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return input;
}

function getCountdown(eventDate) {
    if (!eventDate) return 'Data não definida';
    const diff = new Date(eventDate) - new Date();
    if (diff <= 0) return "🎉 Evento realizado! 🎉";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (days > 0) return `${days} dia${days !== 1 ? 's' : ''} e ${hours} hora${hours !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hora${hours !== 1 ? 's' : ''} e ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
}

function startCountdownTimer() {
    const countdownElement = document.getElementById('countdownTimer');
    if (!countdownElement) return;
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    if (!currentEvent || !currentEvent.event_date) {
        countdownElement.textContent = 'Data não definida';
        return;
    }
    const updateCountdown = () => { countdownElement.textContent = getCountdown(currentEvent.event_date); };
    updateCountdown();
    setInterval(updateCountdown, 60000);
}

// ============================================
// QR CODE - VERSÃO CORRIGIDA
// ============================================
// ============================================
// QR CODE - VERSÃO CORRIGIDA (com link correto)
// ============================================

function showQRCodeModal(guestId, guestName) {
    const baseUrl = window.location.origin;
    const confirmLink = `${baseUrl}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}`;
    const declineLink = `${baseUrl}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}&status=recusado`;
    const maybeLink = `${baseUrl}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}&status=talvez`;
    
    console.log("🔗 Links gerados:", { confirmLink, declineLink, maybeLink }); // Para debug
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 450px; text-align: center;">
            <div class="modal-header" style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="color: #ffd700; margin: 0;">🎫 QR Code de Confirmação</h2>
                <button class="close-modal" onclick="this.closest('.modal').remove()" style="background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer;">&times;</button>
            </div>
            <div style="margin-bottom: 1rem;">
                <strong style="color: #ffd700; font-size: 1.1rem;">${escapeHtml(guestName)}</strong>
                <p style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">Escaneie o QR Code ou use os links abaixo</p>
            </div>
            <div id="qrcodeContainer" style="display: flex; justify-content: center; margin: 1rem 0; min-height: 200px;"></div>
            <div style="display: flex; gap: 0.5rem; flex-direction: column; margin-top: 1rem;">
                <a href="${confirmLink}" target="_blank" class="btn" style="font-size: 0.8rem; text-decoration: none; display: inline-block;">
                    ✅ Confirmar Presença
                </a>
                <a href="${maybeLink}" target="_blank" class="btn-secondary" style="font-size: 0.8rem; text-decoration: none; display: inline-block;">
                    🤔 Talvez / Pendente
                </a>
                <a href="${declineLink}" target="_blank" class="btn-secondary" style="font-size: 0.8rem; text-decoration: none; display: inline-block; background: rgba(225,29,72,0.15); border-color: #e11d48; color: #e11d48;">
                    ❌ Não poderei comparecer
                </a>
            </div>
            <div style="margin-top: 1rem; font-size: 0.7rem; color: #888; border-top: 1px solid rgba(255,215,0,0.2); padding-top: 0.75rem;">
                📱 Escaneie o QR Code com seu celular para confirmar rapidamente
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const qrContainer = document.getElementById('qrcodeContainer');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        
        // Criar canvas para QR Code
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        canvas.style.borderRadius = '12px';
        qrContainer.appendChild(canvas);
        
        // Usar API de QR Code
        const img = document.createElement('img');
        img.style.width = '200px';
        img.style.height = '200px';
        img.style.borderRadius = '12px';
        img.style.backgroundColor = 'white';
        img.style.padding = '10px';
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(confirmLink)}`;
        
        img.onload = () => {
            canvas.style.display = 'none';
            qrContainer.appendChild(img);
        };
        
        img.onerror = () => {
            canvas.style.display = 'block';
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 200, 200);
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('LA VIE', 70, 95);
            ctx.font = '10px Arial';
            ctx.fillText('Escaneie o link', 55, 130);
            ctx.fillStyle = '#ffd700';
            ctx.font = '8px Arial';
            ctx.fillText(confirmLink.substring(0, 25) + '...', 25, 165);
        };
        
        qrContainer.appendChild(img);
    }
}

// ============================================
// FUNÇÕES DE WHATSAPP - CORRIGIDAS
// ============================================

window.sendWhatsAppInvite = async function(guestId, guestName, guestPhone) {
    if (!state.selectedEvent) { showNotification('Selecione um evento primeiro!', 'error'); return; }
    if (!guestPhone || guestPhone.trim() === '') { showNotification('Este convidado não possui telefone cadastrado!', 'error'); return; }
    
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventName = currentEvent?.name || currentEvent?.couple_names || 'Evento';
    const eventDate = currentEvent?.event_date ? formatDate(currentEvent.event_date) : 'Data a definir';
    const eventTime = currentEvent?.event_time ? ` às ${currentEvent.event_time.substring(0,5)}` : '';
    const eventVenue = currentEvent?.venue || 'Local a confirmar';
    
    const baseUrl = window.location.origin;
    const confirmLink = `${baseUrl}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}`;
    const declineLink = `${baseUrl}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}&status=recusado`;
    
    let phoneNumber = guestPhone.replace(/\D/g, '');
    if (phoneNumber.length === 11) phoneNumber = '55' + phoneNumber;
    else if (phoneNumber.length === 10) phoneNumber = '55' + phoneNumber.substring(0, 2) + '9' + phoneNumber.substring(2);
    
    let customMessage = localStorage.getItem('customInviteMessage');
    let message;
    if (customMessage) {
        message = customMessage.replace('{evento}', eventName).replace('{convidado}', guestName).replace('{data}', eventDate + eventTime).replace('{local}', eventVenue);
        message = encodeURIComponent(message);
        message += `%0a%0a✅ ${confirmLink}%0a❌ ${declineLink}`;
    } else {
        message = `*${eventName}*%0a%0aOlá ${guestName}!%0a%0a📅 Data: ${eventDate}${eventTime}%0a📍 Local: ${eventVenue}%0a%0aConfirme sua presença:%0a✅ ${confirmLink}%0a❌ ${declineLink}`;
    }
    
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
    showNotification(`Abrindo WhatsApp para ${guestName}`, 'success');
};

// ============================================
// FUNÇÕES DE EMAIL - CORRIGIDA
// ============================================

window.sendEmailInvite = async function(guestId, guestName, guestEmail) {
    if (!guestEmail) {
        showNotification('Este convidado não tem email cadastrado!', 'error');
        return;
    }
    
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    if (!currentEvent) {
        showNotification('Evento não encontrado!', 'error');
        return;
    }
    
    const confirmLink = `${window.location.origin}./confirmar-presenca.html?eventId=${state.selectedEvent}&guestId=${guestId}`;
    
    // Copiar link para área de transferência (já que EmailJS não está configurado)
    await navigator.clipboard.writeText(confirmLink);
    showNotification(`Link de confirmação copiado! Cole e envie para ${guestName}.`, 'success');
};

// ============================================
// FUNÇÕES DE CRUD
// ============================================

async function handleEventSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.budget_total = parseFloat(data.budget_total || 0);
    if (data.event_time === '') data.event_time = null;
    
    showLoader(state.editingEvent ? 'Atualizando evento...' : 'Criando evento...');
    const result = state.editingEvent ? await updateEvent(state.editingEvent.id, data) : await createEvent(data, state.user.id);
    hideLoader();
    
    if (result.success) {
        state.events = await getUserEvents(state.user.id);
        closeEventModal();
        showNotification('Evento salvo!', 'success');
        setFormDirty(false);
        renderDashboard();
        autoBackup();
    } else {
        if (checkSessionError(result.error)) return;
        showNotification('Erro ao salvar evento', 'error');
    }
}

async function handleGuestSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    
    if (data.phone && !validatePhone(data.phone)) {
        showNotification('Telefone inválido! Use 10 ou 11 dígitos', 'error');
        return;
    }
    
    showLoader(state.editingGuest ? 'Atualizando convidado...' : 'Adicionando convidado...');
    const result = state.editingGuest ? await updateGuest(state.editingGuest.id, data) : await createGuest(data, state.selectedEvent);
    hideLoader();
    
    if (result.success) {
        state.guests = await getEventGuests(state.selectedEvent);
        closeGuestModal();
        showNotification('Convidado salvo!', 'success');
        setFormDirty(false);
        renderGuestListWithSearch();
        renderDashboard();
    } else {
        if (checkSessionError(result.error)) return;
        showNotification('Erro ao salvar convidado', 'error');
    }
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    data.value = parseFloat(data.value || 0);
    
    showLoader(state.editingSupplier ? 'Atualizando fornecedor...' : 'Adicionando fornecedor...');
    const result = state.editingSupplier ? await updateSupplier(state.editingSupplier.id, data) : await createSupplier(data, state.selectedEvent);
    hideLoader();
    
    if (result.success) {
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        closeSupplierModal();
        showNotification('Fornecedor salvo!', 'success');
        setFormDirty(false);
        renderDashboard();
    } else {
        if (checkSessionError(result.error)) return;
        showNotification('Erro ao salvar fornecedor', 'error');
    }
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    
    showLoader(state.editingTask ? 'Atualizando tarefa...' : 'Adicionando tarefa...');
    const result = state.editingTask ? await updateTask(state.editingTask.id, data) : await createTask(data, state.user.id, state.selectedEvent || null);
    hideLoader();
    
    if (result.success) {
        state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id);
        closeTaskModal();
        showNotification('Tarefa salva!', 'success');
        setFormDirty(false);
        renderDashboard();
        checkUpcomingTasks();
    } else {
        if (checkSessionError(result.error)) return;
        showNotification('Erro ao salvar tarefa', 'error');
    }
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const profileData = Object.fromEntries(new FormData(e.target));
    
    if (profileData.phone && !validatePhone(profileData.phone)) {
        showNotification('Telefone inválido! Use 10 ou 11 dígitos', 'error');
        return;
    }
    if (profileData.cpf && !validateCPF(profileData.cpf)) {
        showNotification('CPF inválido!', 'error');
        return;
    }
    
    showLoader('Atualizando perfil...');
    const result = await updateUserProfile(state.user.id, profileData);
    hideLoader();
    
    if (result.success) {
        state.user.profile = (await getUserProfile(state.user.id))?.profile || {};
        showNotification('Perfil atualizado!', 'success');
        renderDashboard();
    } else {
        if (checkSessionError(result.error)) return;
        showNotification('Erro ao atualizar perfil', 'error');
    }
}

// ============================================
// FUNÇÕES DE EXCLUSÃO
// ============================================

window.deleteEventConfirm = (id) => {
    showConfirmModal('Excluir Evento', 'Tem certeza que deseja excluir este evento? Todas as informações serão perdidas!', async () => {
        const result = await deleteEvent(id);
        if (result.success) {
            state.events = await getUserEvents(state.user.id);
            if (state.selectedEvent === id) state.selectedEvent = null;
            renderDashboard();
            showNotification('Evento excluído!', 'success');
            autoBackup();
        } else {
            if (checkSessionError(result.error)) return;
            showNotification('Erro ao excluir evento', 'error');
        }
    });
};

window.deleteGuestConfirm = (id) => {
    showConfirmModal('Excluir Convidado', 'Tem certeza que deseja excluir este convidado?', async () => {
        const result = await deleteGuest(id);
        if (result.success) {
            state.guests = await getEventGuests(state.selectedEvent);
            renderGuestListWithSearch();
            showNotification('Convidado excluído!', 'success');
            autoBackup();
        } else {
            if (checkSessionError(result.error)) return;
            showNotification('Erro ao excluir convidado', 'error');
        }
    });
};

window.deleteSupplierConfirm = (id) => {
    showConfirmModal('Excluir Fornecedor', 'Tem certeza que deseja excluir este fornecedor?', async () => {
        const result = await deleteSupplier(id);
        if (result.success) {
            state.suppliers = await getEventSuppliers(state.selectedEvent);
            renderDashboard();
            showNotification('Fornecedor excluído!', 'success');
            autoBackup();
        } else {
            if (checkSessionError(result.error)) return;
            showNotification('Erro ao excluir fornecedor', 'error');
        }
    });
};

window.deleteTaskConfirm = (id) => {
    showConfirmModal('Excluir Tarefa', 'Tem certeza que deseja excluir esta tarefa?', async () => {
        const result = await deleteTask(id);
        if (result.success) {
            state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id);
            renderDashboard();
            showNotification('Tarefa excluída!', 'success');
            autoBackup();
        } else {
            if (checkSessionError(result.error)) return;
            showNotification('Erro ao excluir tarefa', 'error');
        }
    });
};

window.removeSavedSupplier = async (savedId) => {
    showConfirmModal('Remover Fornecedor', 'Deseja remover este fornecedor da sua lista?', async () => {
        const result = await deleteSavedSupplier(savedId);
        if (result.success) {
            await loadSavedSuppliersList();
            showNotification('Fornecedor removido!', 'success');
        } else {
            showNotification('Erro ao remover fornecedor', 'error');
        }
    });
};

// ============================================
// FUNÇÕES DE IMPORTAÇÃO
// ============================================

window.importGuestsFile = function() {
    if (!state.selectedEvent) { showNotification('Selecione um evento primeiro!', 'error'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > MAX_FILE_SIZE) { showNotification(`Arquivo muito grande! Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB`, 'error'); return; }
            const extension = file.name.split('.').pop().toLowerCase();
            if (!ALLOWED_EXTENSIONS.includes(extension)) { showNotification(`Formato não permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`, 'error'); return; }
            await processGuestFile(file);
        }
    };
    input.click();
};

async function processGuestFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    showLoader('Processando arquivo...');
    try {
        let data = [];
        if (extension === 'csv') {
            const text = await file.text();
            data = parseCSV(text);
        } else if (extension === 'xlsx' || extension === 'xls') {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(firstSheet);
        }
        
        updateLoaderMessage(`Importando ${data.length} convidados...`);
        updateLoaderProgress(50);
        const result = await importGuestsFromData(data);
        updateLoaderProgress(100);
        
        if (result.imported.length > 0) {
            showNotification(`${result.imported.length} convidados importados. ${result.errors.length} erros.`, 'success');
            state.guests = await getEventGuests(state.selectedEvent);
            renderGuestListWithSearch();
            autoBackup();
        } else {
            showNotification(`Nenhum convidado importado.\nErros: ${result.errors.slice(0, 3).join(', ')}`, 'error');
        }
    } catch (error) {
        showNotification('Erro ao processar o arquivo.', 'error');
    } finally {
        hideLoader();
    }
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/["']/g, ''));
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((header, index) => { row[header] = values[index] ? values[index].trim().replace(/["']/g, '') : ''; });
        result.push(row);
    }
    return result;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result;
}

async function importGuestsFromData(data) {
    const imported = [];
    const errors = [];
    const existingNames = new Set(state.guests.map(g => g.name.toLowerCase()));
    const columnMap = {
        name: ['nome', 'name', 'convidado', 'convidados', 'nome do convidado', 'fullname'],
        group: ['grupo', 'group', 'familia', 'family', 'grupo/familia'],
        status: ['status', 'situacao', 'confirmacao'],
        table: ['mesa', 'table', 'numero da mesa'],
        phone: ['telefone', 'phone', 'celular', 'whatsapp', 'contato']
    };
    const sampleRow = data[0] || {};
    const columns = {};
    for (const [field, possibleNames] of Object.entries(columnMap)) {
        for (const col of Object.keys(sampleRow)) {
            if (possibleNames.some(name => col.toLowerCase().includes(name))) {
                columns[field] = col;
                break;
            }
        }
    }
    if (!columns.name && Object.keys(sampleRow).length > 0) columns.name = Object.keys(sampleRow)[0];
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const name = columns.name ? row[columns.name] : '';
        const group = columns.group ? row[columns.group] : '';
        let status = columns.status ? row[columns.status] : '';
        const table = columns.table ? row[columns.table] : '';
        const phone = columns.phone ? row[columns.phone] : '';
        
        if (!name || name.toString().trim() === '') { errors.push(`Linha ${i + 2}: Nome obrigatório`); continue; }
        const guestName = name.toString().trim();
        if (existingNames.has(guestName.toLowerCase())) { errors.push(`Linha ${i + 2}: "${guestName}" já existe`); continue; }
        
        let normalizedStatus = 'pendente';
        const statusLower = status.toString().toLowerCase();
        if (statusLower === 'confirmado' || statusLower === 'confirm' || statusLower === 'yes') normalizedStatus = 'confirmado';
        else if (statusLower === 'recusado' || statusLower === 'declined' || statusLower === 'no') normalizedStatus = 'recusado';
        
        const formattedPhone = phone ? formatPhone(phone.toString()) : '';
        
        const guest = { name: guestName, group_name: group ? group.toString().trim() : '', status: normalizedStatus, table_name: table ? table.toString().trim() : '', phone: formattedPhone };
        const result = await createGuest(guest, state.selectedEvent);
        if (result.success) { imported.push(guest); existingNames.add(guestName.toLowerCase()); }
        else { errors.push(`Linha ${i + 2}: Erro ao salvar "${guestName}"`); }
    }
    return { imported, errors };
}

window.downloadGuestTemplate = function() {
    const dados = [
        ['Nome do Convidado', 'Grupo/Família', 'Status', 'Mesa', 'Telefone'],
        ['João Silva', 'Família Silva', 'confirmado', 'Mesa 01', '(11) 99999-9999'],
        ['Maria Oliveira', 'Família Oliveira', 'pendente', 'Mesa 02', '(11) 88888-8888'],
        ['Carlos Santos', 'Família Santos', 'recusado', 'Mesa 03', '(11) 77777-7777']
    ];
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, `modelo_convidados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showNotification('Modelo baixado!', 'success');
};

// ============================================
// FUNÇÕES DE FILTRO E PAGINAÇÃO
// ============================================

function sortGuests(guests) {
    return [...guests].sort((a, b) => {
        let valA = '', valB = '';
        if (state.sortBy === 'name') { valA = a.name || ''; valB = b.name || ''; }
        else if (state.sortBy === 'group') { valA = a.group_name || ''; valB = b.group_name || ''; }
        else if (state.sortBy === 'status') { valA = a.status || ''; valB = b.status || ''; }
        else if (state.sortBy === 'table') { valA = a.table_name || ''; valB = b.table_name || ''; }
        const comparison = valA.localeCompare(valB);
        return state.sortOrder === 'asc' ? comparison : -comparison;
    });
}

function filterGuests() {
    let filtered = [...state.guests];
    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        filtered = filtered.filter(g => g.name?.toLowerCase().includes(term) || g.group_name?.toLowerCase().includes(term));
    }
    if (state.filterStatus !== 'todos') {
        filtered = filtered.filter(g => g.status === state.filterStatus);
    }
    return sortGuests(filtered);
}

function getPaginatedGuests(guests) {
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    return guests.slice(start, end);
}

function renderPagination(totalItems, containerId) {
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let pagesHtml = '<div class="pagination">';
    pagesHtml += `<button class="page-btn" data-page="prev" ${state.currentPage === 1 ? 'disabled' : ''}>◀ Anterior</button>`;
    
    const maxVisible = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
    
    if (startPage > 1) {
        pagesHtml += `<button class="page-btn" data-page="1">1</button>`;
        if (startPage > 2) pagesHtml += `<span class="page-dots">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        pagesHtml += `<button class="page-btn ${state.currentPage === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagesHtml += `<span class="page-dots">...</span>`;
        pagesHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    pagesHtml += `<button class="page-btn" data-page="next" ${state.currentPage === totalPages ? 'disabled' : ''}>Próximo ▶</button>`;
    pagesHtml += '</div>';
    container.innerHTML = pagesHtml;
    
    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page === 'prev' && state.currentPage > 1) state.currentPage--;
            else if (page === 'next' && state.currentPage < totalPages) state.currentPage++;
            else if (page !== 'prev' && page !== 'next') state.currentPage = parseInt(page);
            renderGuestListWithSearch();
        });
    });
}

function filterSuppliers() {
    let filtered = [...state.suppliers];
    if (state.searchSupplierTerm) {
        const term = state.searchSupplierTerm.toLowerCase();
        filtered = filtered.filter(s => s.name?.toLowerCase().includes(term) || s.category?.toLowerCase().includes(term));
    }
    return filtered;
}

function getPaginatedSuppliers(suppliers) {
    const start = (state.currentSupplierPage - 1) * state.suppliersPerPage;
    const end = start + state.suppliersPerPage;
    return suppliers.slice(start, end);
}

function renderSupplierPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / state.suppliersPerPage);
    const container = document.getElementById('supplierPagination');
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let pagesHtml = '<div class="pagination">';
    pagesHtml += `<button class="page-btn" data-page="prev" ${state.currentSupplierPage === 1 ? 'disabled' : ''}>◀ Anterior</button>`;
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        pagesHtml += `<button class="page-btn ${state.currentSupplierPage === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    if (totalPages > 5) {
        pagesHtml += `<span class="page-dots">...</span>`;
        pagesHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
    }
    pagesHtml += `<button class="page-btn" data-page="next" ${state.currentSupplierPage === totalPages ? 'disabled' : ''}>Próximo ▶</button>`;
    pagesHtml += '</div>';
    container.innerHTML = pagesHtml;
    
    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            if (page === 'prev' && state.currentSupplierPage > 1) state.currentSupplierPage--;
            else if (page === 'next' && state.currentSupplierPage < totalPages) state.currentSupplierPage++;
            else if (page !== 'prev' && page !== 'next') state.currentSupplierPage = parseInt(page);
            renderSupplierListWithSearch();
        });
    });
}

function exportGuestsData(guests, filename) {
    if (guests.length === 0) { showNotification('Nenhum convidado para exportar!', 'error'); return; }
    
    const dados = [
        ['LA VIE CASAMENTOS - RELATÓRIO DE CONVIDADOS', '', '', '', ''],
        ['Data de Exportação:', new Date().toLocaleDateString('pt-BR'), '', '', ''],
        ['', '', '', '', ''],
        ['Nome do Convidado', 'Grupo/Família', 'Status', 'Mesa', 'Telefone', 'Data de Cadastro']
    ];
    
    for (const guest of guests) {
        dados.push([
            guest.name || '',
            guest.group_name || '',
            guest.status === 'confirmado' ? 'Confirmado' : guest.status === 'recusado' ? 'Recusado' : 'Pendente',
            guest.table_name || '',
            guest.phone || '',
            guest.created_at ? formatDate(guest.created_at) : ''
        ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Convidados');
    const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    XLSX.writeFile(wb, `${filename}_${dataAtual}.xlsx`);
    showNotification(`${guests.length} convidados exportados!`, 'success');
}

window.exportGuestsByStatus = function(status) {
    const filtered = state.guests.filter(g => g.status === status);
    const statusName = status === 'confirmado' ? 'Confirmados' : status === 'recusado' ? 'Recusados' : 'Pendentes';
    exportGuestsData(filtered, `convidados_${statusName}`);
};

window.exportGuestsToExcel = function() { exportGuestsData(state.guests, 'convidados_todos'); };

window.exportSuppliersToExcel = function() {
    if (!state.selectedEvent) { showNotification('Selecione um evento primeiro!', 'error'); return; }
    if (state.suppliers.length === 0) { showNotification('Nenhum fornecedor para exportar!', 'error'); return; }
    
    showLoader('Gerando arquivo Excel...');
    setTimeout(() => {
        const currentEvent = state.events.find(e => e.id === state.selectedEvent);
        const eventName = currentEvent?.name || currentEvent?.couple_names || 'Evento';
        const totalGasto = state.suppliers.reduce((sum, s) => sum + (s.value || 0), 0);
        
        const dados = [
            ['LA VIE CASAMENTOS - RELATÓRIO DE FORNECEDORES', '', '', '', ''],
            ['Evento:', eventName, '', '', ''],
            ['Data do Evento:', currentEvent?.event_date ? formatDate(currentEvent.event_date) : 'Não definida', '', '', ''],
            ['Horário:', currentEvent?.event_time ? currentEvent.event_time.substring(0,5) : 'Não definido', '', '', ''],
            ['Data de Exportação:', new Date().toLocaleDateString('pt-BR'), '', '', ''],
            ['', '', '', '', ''],
            ['RESUMO FINANCEIRO', '', '', '', ''],
            ['Total de Fornecedores:', state.suppliers.length, '', '', ''],
            ['Total Gasto:', formatCurrency(totalGasto), '', '', ''],
            ['', '', '', '', ''],
            ['Nome do Fornecedor', 'Categoria', 'Status', 'Valor (R$)', 'Contato', 'Data de Cadastro']
        ];
        
        for (const supplier of state.suppliers) {
            let statusTexto = supplier.status === 'contratado' ? 'Contratado' : supplier.status === 'negociacao' ? 'Negociação' : 'Cotado';
            dados.push([
                supplier.name || '',
                supplier.category || '',
                statusTexto,
                formatCurrency(supplier.value || 0),
                supplier.contact || '',
                supplier.created_at ? formatDate(supplier.created_at) : ''
            ]);
        }
        
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
        const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        XLSX.writeFile(wb, `fornecedores_${eventName.replace(/[^a-z0-9]/gi, '_')}_${dataAtual}.xlsx`);
        
        hideLoader();
        showNotification(`${state.suppliers.length} fornecedores exportados!`, 'success');
    }, 100);
};

// ============================================
// FUNÇÕES DE RENDERIZAÇÃO DAS LISTAS
// ============================================

function renderGuestListWithSearch() {
    const container = document.getElementById('guestListContainer');
    if (!container) return;
    
    const filteredGuests = filterGuests();
    const paginatedGuests = getPaginatedGuests(filteredGuests);
    const confirmados = filteredGuests.filter(g => g.status === 'confirmado').length;
    const pendentes = filteredGuests.filter(g => g.status === 'pendente').length;
    const recusados = filteredGuests.filter(g => g.status === 'recusado').length;
    
    container.innerHTML = `
        <div class="search-container">
            <div class="search-box">
                <i class="fas fa-search"></i>
                <input type="text" id="searchGuestInput" placeholder="Buscar por nome ou grupo..." value="${escapeHtml(state.searchTerm)}">
                <i class="fas fa-times" id="clearSearch" style="cursor: pointer; display: ${state.searchTerm ? 'block' : 'none'};"></i>
            </div>
            <div class="filter-buttons">
                <button class="filter-badge ${state.filterStatus === 'todos' ? 'active' : ''}" data-status="todos">Todos (${filteredGuests.length})</button>
                <button class="filter-badge ${state.filterStatus === 'pendente' ? 'active' : ''}" data-status="pendente">Pendentes (${pendentes})</button>
                <button class="filter-badge ${state.filterStatus === 'confirmado' ? 'active' : ''}" data-status="confirmado">Confirmados (${confirmados})</button>
                <button class="filter-badge ${state.filterStatus === 'recusado' ? 'active' : ''}" data-status="recusado">Recusados (${recusados})</button>
            </div>
            <div class="sort-buttons">
                <span style="color: #888; font-size: 0.75rem;">Ordenar por:</span>
                <button class="sort-btn ${state.sortBy === 'name' ? 'active' : ''}" data-sort="name">Nome ${state.sortBy === 'name' ? (state.sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
                <button class="sort-btn ${state.sortBy === 'group' ? 'active' : ''}" data-sort="group">Grupo ${state.sortBy === 'group' ? (state.sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
                <button class="sort-btn ${state.sortBy === 'status' ? 'active' : ''}" data-sort="status">Status ${state.sortBy === 'status' ? (state.sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
                <button class="sort-btn ${state.sortBy === 'table' ? 'active' : ''}" data-sort="table">Mesa ${state.sortBy === 'table' ? (state.sortOrder === 'asc' ? '↑' : '↓') : ''}</button>
            </div>
            <div class="search-stats">
                Mostrando ${paginatedGuests.length} de ${filteredGuests.length} convidados (Página ${state.currentPage} de ${Math.ceil(filteredGuests.length / state.itemsPerPage) || 1})
                <div class="export-buttons" style="margin-left: 1rem; display: inline-flex; gap: 0.5rem;">
                    <button class="btn-small" onclick="exportGuestsByStatus('confirmado')" style="background: #10b981;">Exportar Confirmados</button>
                    <button class="btn-small" onclick="exportGuestsByStatus('pendente')" style="background: #f59e0b;">Exportar Pendentes</button>
                    <button class="btn-small" onclick="exportGuestsByStatus('recusado')" style="background: #6b7280;">Exportar Recusados</button>
                </div>
            </div>
        </div>
        <div id="guestPaginationTop" class="pagination-container" style="margin-bottom: 1rem;"></div>
        ${paginatedGuests.length === 0 ? `
            <div class="empty-state">
                <i class="fas fa-user-slash"></i>
                <p>Nenhum convidado encontrado</p>
                <small>Tente outro termo de busca</small>
            </div>
        ` : `
            <div class="guest-list">
                ${paginatedGuests.map(g => `
                    <div class="guest-card">
                        <div>
                            <strong>${escapeHtml(g.name)}</strong>
                            <div style="font-size: 0.7rem; color: #888;">
                                ${g.status === 'confirmado' ? '✅ Confirmado' : g.status === 'recusado' ? '❌ Recusado' : '⏳ Pendente'}
                                ${g.table_name ? ` • Mesa ${escapeHtml(g.table_name)}` : ''}
                                ${g.group_name ? ` • ${escapeHtml(g.group_name)}` : ''}
                            </div>
                            ${g.phone ? `<div style="font-size: 0.7rem; color: #888;">📱 ${g.phone}</div>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end;">
                            ${g.phone && g.status === 'pendente' ? `<button class="btn-small" onclick="sendWhatsAppInvite('${g.id}', '${escapeHtml(g.name).replace(/'/g, "\\'")}', '${g.phone}')" style="background: #25D366; color: white;" title="WhatsApp"><i class="fab fa-whatsapp"></i></button>` : ''}
                            <button class="btn-small" onclick="showQRCodeModal('${g.id}', '${escapeHtml(g.name).replace(/'/g, "\\'")}')" style="background: #8b5cf6; color: white;" title="QR Code">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            <button class="btn-small" onclick="editGuest('${g.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-small" onclick="deleteGuestConfirm('${g.id}')" title="Excluir" style="background: #e11d48;"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
        <div id="guestPaginationBottom" class="pagination-container" style="margin-top: 1rem;"></div>
    `;
    
    const searchInput = document.getElementById('searchGuestInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (state.searchTimeout) clearTimeout(state.searchTimeout);
            state.searchTimeout = setTimeout(() => {
                state.searchTerm = e.target.value;
                state.currentPage = 1;
                renderGuestListWithSearch();
            }, 300);
        });
    }
    
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.searchTerm = '';
            state.currentPage = 1;
            if (searchInput) searchInput.value = '';
            renderGuestListWithSearch();
        });
    }
    
    document.querySelectorAll('.filter-badge').forEach(btn => {
        btn.addEventListener('click', () => {
            state.filterStatus = btn.dataset.status;
            state.currentPage = 1;
            renderGuestListWithSearch();
        });
    });
    
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sort = btn.dataset.sort;
            if (state.sortBy === sort) {
                state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = sort;
                state.sortOrder = 'asc';
            }
            renderGuestListWithSearch();
        });
    });
    
    renderPagination(filteredGuests.length, 'guestPaginationTop');
    renderPagination(filteredGuests.length, 'guestPaginationBottom');
}

function renderSupplierListWithSearch() {
    const container = document.getElementById('supplierListContainer');
    if (!container) return;
    
    const filteredSuppliers = filterSuppliers();
    const paginatedSuppliers = getPaginatedSuppliers(filteredSuppliers);
    
    container.innerHTML = `
        <div class="search-container" style="margin-bottom: 1rem;">
            <div class="search-box">
                <i class="fas fa-search"></i>
                <input type="text" id="searchSupplierInput" placeholder="Buscar fornecedor por nome ou categoria..." value="${escapeHtml(state.searchSupplierTerm)}">
                <i class="fas fa-times" id="clearSupplierSearch" style="cursor: pointer; display: ${state.searchSupplierTerm ? 'block' : 'none'};"></i>
            </div>
            <div class="search-stats">Mostrando ${paginatedSuppliers.length} de ${filteredSuppliers.length} fornecedores</div>
        </div>
        <div id="supplierPaginationTop" class="pagination-container" style="margin-bottom: 1rem;"></div>
        ${paginatedSuppliers.length === 0 ? `
            <div class="empty-state">
                <i class="fas fa-store-slash"></i>
                <p>Nenhum fornecedor encontrado</p>
                <small>Tente outro termo de busca</small>
            </div>
        ` : `
            <div class="supplier-list">
                ${paginatedSuppliers.map(s => `
                    <div class="supplier-card">
                        <div>
                            <strong>${escapeHtml(s.name)}</strong>
                            <div style="font-size: 0.7rem; color: #888;">
                                ${s.category} • ${formatCurrency(s.value)}
                                ${s.status === 'contratado' ? ' • Contratado' : s.status === 'negociacao' ? ' • Negociação' : ' • Cotado'}
                            </div>
                            ${s.contact ? `<div style="font-size: 0.7rem; color: #888;">📞 ${s.contact}</div>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn-small" onclick="editSupplier('${s.id}')">Editar</button>
                            <button class="btn-small" onclick="deleteSupplierConfirm('${s.id}')" style="background: #e11d48;">Excluir</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
        <div id="supplierPaginationBottom" class="pagination-container" style="margin-top: 1rem;"></div>
    `;
    
    const searchInput = document.getElementById('searchSupplierInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (state.supplierSearchTimeout) clearTimeout(state.supplierSearchTimeout);
            state.supplierSearchTimeout = setTimeout(() => {
                state.searchSupplierTerm = e.target.value;
                state.currentSupplierPage = 1;
                renderSupplierListWithSearch();
            }, 300);
        });
    }
    
    const clearBtn = document.getElementById('clearSupplierSearch');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            state.searchSupplierTerm = '';
            state.currentSupplierPage = 1;
            if (searchInput) searchInput.value = '';
            renderSupplierListWithSearch();
        });
    }
    
    renderSupplierPagination(filteredSuppliers.length);
}

// ============================================
// FUNÇÕES DE MODAIS E RENDERIZAÇÕES
// ============================================

function renderEventForm() {
    const event = state.editingEvent;
    const eventTime = event?.event_time ? event.event_time.substring(0, 5) : '';
    return `<div class="modal" id="eventModal"><div class="modal-content"><h2>${event ? 'Editar Evento' : 'Novo Evento'}</h2>
        <form id="eventForm">
            <div class="form-group"><label>Nome do Evento *</label><input type="text" name="name" value="${event?.name || ''}" required></div>
            <div class="form-group"><label>Nomes dos Noivos</label><input type="text" name="couple_names" value="${event?.couple_names || ''}"></div>
            <div class="form-group"><label>Tipo</label><select name="event_type"><option>Casamento</option><option>Corporativo</option><option>Aniversário</option><option>Festa</option></select></div>
            <div class="form-group"><label>Tema</label><select name="theme"><option>Clássico</option><option>Moderno</option><option>Rústico</option><option>Luxo</option><option>Romântico</option><option>Praia</option><option>Industrial</option><option>Vintage</option><option>Boho</option><option>Gótico</option></select></div>
            <div class="form-group"><label>Orçamento (R$)</label><input type="number" name="budget_total" value="${event?.budget_total || ''}" step="0.01"></div>
            <div class="form-row"><div class="form-group"><label>Data do Evento</label><input type="date" name="event_date" value="${event?.event_date || ''}"></div><div class="form-group"><label>Horário</label><input type="time" name="event_time" value="${eventTime}"></div></div>
            <div class="form-group"><label>Local</label><input type="text" name="venue" value="${event?.venue || ''}"></div>
            <div class="form-actions"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeEventModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderGuestForm() {
    const guest = state.editingGuest;
    return `<div class="modal" id="guestModal"><div class="modal-content"><h2>${guest ? 'Editar Convidado' : 'Novo Convidado'}</h2>
        <form id="guestForm">
            <div class="form-group"><label>Nome *</label><input type="text" name="name" value="${guest?.name || ''}" required></div>
            <div class="form-group"><label>Grupo/Família</label><input type="text" name="group_name" value="${guest?.group_name || ''}"></div>
            <div class="form-group"><label>Status</label><select name="status"><option>pendente</option><option>confirmado</option><option>recusado</option></select></div>
            <div class="form-group"><label>Mesa</label><input type="text" name="table_name" value="${guest?.table_name || ''}"></div>
            <div class="form-group"><label>Telefone</label><input type="tel" name="phone" value="${guest?.phone || ''}" placeholder="(00) 00000-0000"></div>
            <div class="form-actions"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeGuestModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderSupplierForm() {
    const supplier = state.editingSupplier;
    return `<div class="modal" id="supplierModal"><div class="modal-content"><h2>${supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
        <form id="supplierForm">
            <div class="form-group"><label>Nome *</label><input type="text" name="name" value="${supplier?.name || ''}" required></div>
            <div class="form-group"><label>Categoria</label><select name="category"><option>Buffet</option><option>Fotografia</option><option>Música</option><option>Decoração</option><option>Espaço</option><option>Vestuário</option><option>Outro</option></select></div>
            <div class="form-group"><label>Status</label><select name="status"><option>cotado</option><option>negociacao</option><option>contratado</option></select></div>
            <div class="form-group"><label>Valor (R$)</label><input type="number" name="value" value="${supplier?.value || 0}" step="0.01"></div>
            <div class="form-group"><label>Contato</label><input type="text" name="contact" value="${supplier?.contact || ''}" placeholder="Telefone ou email"></div>
            <div class="form-actions"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeSupplierModal()">Cancelar</button></div>
        </form></div></div>`;
}

function renderTaskForm() {
    const task = state.editingTask;
    return `<div class="modal" id="taskModal"><div class="modal-content"><h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
        <form id="taskForm">
            <div class="form-group"><label>Nome *</label><input type="text" name="name" value="${task?.name || ''}" required></div>
            <div class="form-group"><label>Categoria</label><select name="category"><option>12 meses</option><option>9 meses</option><option>6 meses</option><option>3 meses</option><option>1 mês</option><option>1 semana</option><option>Dia do Casamento</option></select></div>
            <div class="form-group"><label>Prioridade</label><select name="priority"><option>baixa</option><option>media</option><option>alta</option></select></div>
            <div class="form-group"><label>Data Limite</label><input type="date" name="due_date" value="${task?.due_date || ''}"></div>
            <div class="form-actions"><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeTaskModal()">Cancelar</button></div>
        </form></div></div>`;
}

function attachFormEvents() {
    document.getElementById('eventForm')?.addEventListener('submit', handleEventSubmit);
    document.getElementById('guestForm')?.addEventListener('submit', handleGuestSubmit);
    document.getElementById('supplierForm')?.addEventListener('submit', handleSupplierSubmit);
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskSubmit);
    document.getElementById('profileForm')?.addEventListener('submit', handleProfileSubmit);
    document.getElementById('changePhotoBtn')?.addEventListener('click', () => document.getElementById('photoUpload')?.click());
    document.getElementById('photoUpload')?.addEventListener('change', handlePhotoUpload);
    
    document.querySelectorAll('.modal-content form input, .modal-content form select, .modal-content form textarea').forEach(field => {
        field.addEventListener('input', () => setFormDirty(true));
    });
}

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) { showNotification('Por favor, selecione uma imagem válida', 'error'); return; }
        if (file.size > 5 * 1024 * 1024) { showNotification('A imagem deve ter no máximo 5MB', 'error'); return; }
        
        showLoader('Atualizando foto...');
        const reader = new FileReader();
        reader.onload = async (event) => {
            const result = await updateUserProfile(state.user.id, { photo: event.target.result });
            hideLoader();
            if (result.success) {
                state.user.profile = (await getUserProfile(state.user.id))?.profile || {};
                showNotification('Foto atualizada!', 'success');
                renderDashboard();
            } else {
                if (checkSessionError(result.error)) return;
                showNotification('Erro ao atualizar foto', 'error');
            }
        };
        reader.readAsDataURL(file);
    }
}

// ============================================
// FUNÇÕES DE IA E SUGESTÕES
// ============================================

window.showSupplierSuggestions = async function() {
    if (!state.selectedEvent) { showNotification('Selecione um evento primeiro!', 'error'); return; }
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventTheme = currentEvent?.theme || 'classico';
    const eventBudget = currentEvent?.budget_total || 50000;
    showNotification('Analisando tema e orçamento...', 'success');
    await new Promise(resolve => setTimeout(resolve, 1500));
    const suggestions = suggestSuppliersIA(eventTheme, eventBudget);
    const grouped = {};
    suggestions.forEach(s => { if (!grouped[s.category]) grouped[s.category] = []; grouped[s.category].push(s); });
    
    const modalHtml = `
        <div class="modal" id="suggestionsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div class="suggestions-header"><h2>🤖 IA - Sugestões de Fornecedores</h2><p>Baseado no tema <strong>${eventTheme}</strong> e orçamento <strong>${formatCurrency(eventBudget)}</strong></p><button class="close-btn" onclick="closeSuggestionsModal()">✕</button></div>
                <div class="suggestions-content">
                    ${Object.entries(grouped).map(([category, suppliers]) => `
                        <div class="suggestion-category">
                            <h3>${getCategoryIconSimple(category)} ${getCategoryNameFull(category)}</h3>
                            <div class="suggestion-cards">
                                ${suppliers.map(supplier => `
                                    <div class="suggestion-card">
                                        <div class="suggestion-header"><span class="suggestion-icon">${supplier.icon || getCategoryIconSimple(supplier.category)}</span><div><h4>${supplier.name}</h4><div class="suggestion-rating">⭐ ${supplier.rating}/5</div></div><div class="compatibility-badge" style="background: ${getCompatibilityColor(supplier.compatibility)}">${supplier.compatibility}% compatível</div></div>
                                        <div class="suggestion-details"><p><i class="fas fa-tag"></i> ${supplier.priceRange}</p><p><i class="fas fa-clock"></i> Disponibilidade: ${supplier.availability}%</p></div>
                                        <button class="btn-small" onclick="saveSuggestedSupplier('${supplier.id}', '${supplier.name.replace(/'/g, "\\'")}', '${supplier.category}', '${supplier.priceRange.replace(/'/g, "\\'")}', ${supplier.rating}, ${supplier.compatibility})" style="background: #10b981; color: white; width: 100%;">💾 Salvar na minha lista</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="suggestions-footer"><button class="btn" onclick="closeSuggestionsModal()">Fechar</button></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeSuggestionsModal = function() { document.getElementById('suggestionsModal')?.remove(); };

window.saveSuggestedSupplier = async function(supplierId, name, category, priceRange, rating, compatibility) {
    try {
        if (!state.user || !state.user.id) { showNotification('Usuário não identificado. Faça login novamente.', 'error'); return; }
        if (!state.selectedEvent) { showNotification('Selecione um evento primeiro!', 'error'); return; }
        
        const decodedName = name.replace(/\\'/g, "'");
        const decodedPriceRange = priceRange.replace(/\\'/g, "'");
        const result = await saveSuggestedSupplier(state.user.id, state.selectedEvent, {
            id: supplierId, name: decodedName, category: category, priceRange: decodedPriceRange, rating: rating, compatibility: compatibility
        });
        
        if (result.success) {
            await loadSavedSuppliersList();
            showNotification(`Fornecedor "${decodedName}" salvo na sua lista!`, 'success');
            closeSuggestionsModal();
            renderDashboard();
            autoBackup();
        } else { showNotification('Erro ao salvar fornecedor: ' + (result.error || 'Tente novamente'), 'error'); }
    } catch (error) { console.error('Erro:', error); showNotification('Erro ao salvar fornecedor. Tente novamente.', 'error'); }
};

window.showSupplierDetails = function(supplierId, name, category, priceRange, rating, tags, compatibility, icon) {
    const guestCount = state.guests.length;
    const estimatedValue = calculateSupplierValue(priceRange, guestCount, category);
    const modalHtml = `
        <div class="modal" id="supplierDetailsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="suggestions-header"><h2>Detalhes do Fornecedor</h2><button class="close-btn" onclick="closeSupplierDetailsModal()">✕</button></div>
                <div class="supplier-details-content">
                    <div style="text-align: center;"><div style="font-size: 3rem;">${icon || getCategoryIconSimple(category)}</div><h3>${name}</h3><div>⭐ ${rating}/5</div></div>
                    <div class="supplier-info-group"><div><strong>Categoria:</strong> ${getCategoryNameFull(category)}</div><div><strong>Faixa de Preço:</strong> ${priceRange}</div>${guestCount > 0 && estimatedValue > 0 ? `<div><strong>Valor Estimado:</strong> <span style="color:#ffd700">${formatCurrency(estimatedValue)}</span></div>` : ''}<div><strong>Compatibilidade:</strong> <span style="color: ${getCompatibilityColor(compatibility)}">${compatibility}%</span></div></div>
                    <div class="supplier-actions"><button class="btn" onclick="saveSuggestedSupplier('${supplierId}', '${name.replace(/'/g, "\\'")}', '${category}', '${priceRange.replace(/'/g, "\\'")}', ${rating}, ${compatibility})">Salvar na minha lista</button><button class="btn-secondary" onclick="closeSupplierDetailsModal()">Fechar</button></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeSupplierDetailsModal = function() { document.getElementById('supplierDetailsModal')?.remove(); };

window.showSavedSupplierDetails = function(savedId, name, category, priceRange, rating, compatibility) {
    const guestCount = state.guests.length;
    const categoryValue = getCategoryValueFromName(category);
    const estimatedValue = calculateSupplierValue(priceRange, guestCount, categoryValue);
    const modalHtml = `
        <div class="modal" id="supplierDetailsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="suggestions-header"><h2>Detalhes do Fornecedor</h2><button class="close-btn" onclick="closeSupplierDetailsModal()">✕</button></div>
                <div class="supplier-details-content">
                    <div style="text-align: center;"><div style="font-size: 3rem;">${getCategoryIconSimpleFromName(category)}</div><h3>${name}</h3><div>⭐ ${rating}/5</div></div>
                    <div class="supplier-info-group"><div><strong>Categoria:</strong> ${getCategoryNameFull(category)}</div><div><strong>Faixa de Preço:</strong> ${priceRange}</div>${guestCount > 0 && estimatedValue > 0 ? `<div><strong>Valor Estimado:</strong> <span style="color:#ffd700">${formatCurrency(estimatedValue)}</span></div>` : ''}<div><strong>Compatibilidade:</strong> <span style="color: ${getCompatibilityColor(compatibility)}">${compatibility}%</span></div></div>
                    <div class="supplier-actions"><button class="btn" onclick="addSavedSupplierToEvent('${savedId}', '${name.replace(/'/g, "\\'")}', '${category}', '${priceRange.replace(/'/g, "\\'")}')">Adicionar ao Evento</button><button class="btn-secondary" onclick="closeSupplierDetailsModal()">Fechar</button></div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

function getCategoryIconSimple(category) {
    const icons = { buffet: '🍽️', fotografia: '📷', decoracao: '🎨', musica: '🎵', espaco: '🏠' };
    return icons[category] || '📦';
}

function getCategoryNameFull(category) {
    const names = { buffet: 'Buffet', fotografia: 'Fotografia', decoracao: 'Decoração', musica: 'Música', espaco: 'Espaço' };
    return names[category] || category;
}

function getCategoryValueFromName(category) {
    const map = { Buffet: 'buffet', Fotografia: 'fotografia', Decoracao: 'decoracao', Musica: 'musica', Espaco: 'espaco' };
    return map[category] || category.toLowerCase();
}

function getCategoryIconSimpleFromName(category) {
    const icons = { buffet: '🍽️', fotografia: '📷', decoracao: '🎨', musica: '🎵', espaco: '🏠', Buffet: '🍽️', Fotografia: '📷', Decoracao: '🎨', Musica: '🎵', Espaco: '🏠' };
    return icons[category] || '📦';
}

function getCompatibilityColor(compatibility) {
    if (compatibility >= 80) return '#10b981';
    if (compatibility >= 60) return '#ffd700';
    return '#f59e0b';
}

function calculateSupplierValue(priceRange, guestCount, category) {
    if (!priceRange) return 0;
    const numbers = priceRange.match(/\d+/g);
    if (!numbers || numbers.length === 0) return 0;
    
    // REMOVIDA a lógica de "por pessoa"
    // Agora sempre calcula a média simples dos valores
    const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
    const averageValue = sum / numbers.length;
    
    return Math.round(averageValue);
}

// ============================================
// FUNÇÕES DE CARREGAMENTO
// ============================================

async function ensureEventHasTasks(eventId) {
    const tasks = await getUserTasks(state.user.id, eventId);
    if (tasks.length === 0) { await createDefaultTasksForEvent(state.user.id, eventId); return true; }
    return false;
}

async function loadEventData(id) {
    state.guests = await getEventGuests(id);
    state.suppliers = await getEventSuppliers(id);
    await ensureEventHasTasks(id);
    state.tasks = await getUserTasks(state.user.id, id);
    await loadSavedSuppliersList();
}

async function loadSavedSuppliersList() {
    if (!state.selectedEvent) return;
    try {
        const savedSuppliers = await getSavedSuppliers(state.selectedEvent);
        const container = document.getElementById('savedSuppliersContainer');
        if (container) {
            if (!savedSuppliers || savedSuppliers.length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhum fornecedor salvo. Use o botão "Sugerir Fornecedores" para recomendações personalizadas!</div>';
            } else {
                container.innerHTML = `
                    <div class="saved-suppliers-section">
                        <h3><i class="fas fa-bookmark"></i> Meus Fornecedores Salvos (${savedSuppliers.length})</h3>
                        <div class="saved-suppliers-list">
                            ${savedSuppliers.map(s => `
                                <div class="saved-supplier-card" onclick="showSavedSupplierDetails('${s.id}', '${(s.name || '').replace(/'/g, "\\'")}', '${s.category || ""}', '${(s.price_range || "").replace(/'/g, "\\'")}', ${s.rating || 0}, ${s.compatibility || 0})">
                                    <div><strong>${s.name || 'Sem nome'}</strong><div>${getCategoryNameFull(s.category || 'outros')} • ${s.price_range || 'Preço sob consulta'}</div><div>⭐ ${s.rating || 0}/5 • ${s.compatibility || 0}% compatível</div></div>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button class="btn-small" onclick="event.stopPropagation(); addSavedSupplierToEvent('${s.id}', '${(s.name || "").replace(/'/g, "\\'")}', '${s.category || ""}', '${(s.price_range || "").replace(/'/g, "\\'")}')">Adicionar</button>
                                        <button class="btn-small danger" onclick="event.stopPropagation(); removeSavedSupplier('${s.id}')">Remover</button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) { console.error("Erro ao carregar fornecedores salvos:", error); }
}

window.addSavedSupplierToEvent = async function(savedId, name, category, priceRange) {
    closeSupplierDetailsModal();
    const existingSupplier = state.suppliers.find(s => s.name === name);
    if (existingSupplier) { showNotification('Este fornecedor já foi adicionado ao evento!', 'error'); return; }
    
    const guestCount = state.guests.length;
    const categoryValue = getCategoryValueFromName(category);
    let estimatedValue = calculateSupplierValue(priceRange, guestCount, categoryValue);
    if (estimatedValue === 0) {
        const numbers = priceRange.match(/\d+/g);
        if (numbers) { const sum = numbers.reduce((a, b) => a + parseInt(b), 0); estimatedValue = Math.round(sum / numbers.length); }
    }
    
    showConfirmModal('Adicionar Fornecedor', `Adicionar "${name}" ao evento com valor estimado de ${formatCurrency(estimatedValue)}?`, async () => {
        const supplierData = { name: name, category: categoryValue, status: 'cotado', value: estimatedValue, contact: '' };
        const result = await createSupplier(supplierData, state.selectedEvent);
        if (result.success) {
            state.suppliers = await getEventSuppliers(state.selectedEvent);
            renderDashboard();
            showNotification(`Fornecedor "${name}" adicionado ao evento! Valor: ${formatCurrency(estimatedValue)}`, 'success');
            autoBackup();
        } else { showNotification('Erro ao adicionar fornecedor', 'error'); }
    });
};

function renderCalendario() {
    const primeiraSemana = new Date(state.calendarYear, state.calendarMonth, 1);
    const ultimoDia = new Date(state.calendarYear, state.calendarMonth + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const primeiroDiaSemana = primeiraSemana.getDay();
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    let dias = [];
    for (let i = 0; i < primeiroDiaSemana; i++) dias.push(null);
    for (let i = 1; i <= diasNoMes; i++) {
        const dataAtual = new Date(state.calendarYear, state.calendarMonth, i);
        const temEvento = state.events.some(event => {
            if (!event.event_date) return false;
            const eventDate = new Date(event.event_date);
            return eventDate.getDate() === dataAtual.getDate() && eventDate.getMonth() === dataAtual.getMonth() && eventDate.getFullYear() === dataAtual.getFullYear();
        });
        dias.push({ dia: i, temEvento, data: dataAtual });
    }
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `
        <div class="calendar-section">
            <div class="calendar-header">
                <h3>${monthNames[state.calendarMonth]} ${state.calendarYear}</h3>
                <div><button class="btn-secondary" onclick="mudarMes(-1)">◀ Anterior</button><button class="btn-secondary" onclick="mudarMes(1)">Próximo ▶</button></div>
            </div>
            <div class="calendar-grid">
                ${diasSemana.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
                ${dias.map(dia => dia === null ? '<div class="calendar-day empty"></div>' : `<div class="calendar-day ${dia.temEvento ? 'has-event' : ''}" onclick="selecionarDataCalendario('${dia.data.toISOString()}')">${dia.dia}</div>`).join('')}
            </div>
        </div>
    `;
}

window.selecionarDataCalendario = async (dataISO) => {
    const data = new Date(dataISO);
    const evento = state.events.find(event => {
        if (!event.event_date) return false;
        const eventDate = new Date(event.event_date);
        return eventDate.getDate() === data.getDate() && eventDate.getMonth() === data.getMonth() && eventDate.getFullYear() === data.getFullYear();
    });
    if (evento) {
        state.selectedEvent = evento.id;
        await loadEventData(evento.id);
        setActiveTab('dashboard');
        showNotification(`Evento: ${evento.name || evento.couple_names}`, 'success');
    } else { showNotification('Nenhum evento nesta data', 'error'); }
};

function renderPerfil() {
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || state.user?.photoURL || '';
    let memberSince = 'Data não disponível';
    if (state.user?.createdAt) { const date = new Date(state.user.createdAt); memberSince = date.toLocaleDateString('pt-BR'); }
    return `
        <div class="profile-section">
            <div class="profile-header">
                <div class="profile-avatar">
                    <div class="profile-avatar-large" id="profileAvatar">${photoUrl ? `<img src="${photoUrl}">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}</div>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                    <button class="btn-secondary" id="changePhotoBtn">Alterar Foto</button>
                </div>
                <div class="profile-info">
                    <h2>${escapeHtml(profile.fullName || state.user?.username || 'Usuário')}</h2>
                    <p>${state.user?.email || ''}</p>
                    <p>Membro desde ${memberSince}</p>
                </div>
            </div>
            <form id="profileForm">
                <div class="profile-form-grid">
                    <div class="form-group"><label>Nome Completo</label><input type="text" name="fullName" value="${escapeHtml(profile.fullName || '')}"></div>
                    <div class="form-group"><label>CPF</label><input type="text" name="cpf" value="${escapeHtml(profile.cpf || '')}" maxlength="14" placeholder="000.000.000-00"></div>
                    <div class="form-group"><label>Data de Nascimento</label><input type="date" name="birthDate" value="${profile.birthDate || ''}"></div>
                    <div class="form-group"><label>Telefone</label><input type="tel" name="phone" value="${escapeHtml(profile.phone || '')}" placeholder="(00) 00000-0000"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>Endereço</label><input type="text" name="address" value="${escapeHtml(profile.address || '')}"></div>
                    <div class="form-group"><label>Email</label><input type="email" value="${state.user?.email || ''}" disabled></div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn">Salvar Alterações</button>
                    <button type="button" class="btn-secondary" onclick="showBackupsList()">📦 Gerenciar Backups</button>
                    <button type="button" class="btn-secondary" onclick="customizeInviteMessage()">✏️ Personalizar Convite</button>
                </div>
            </form>
        </div>
    `;
}

function showBackupsList() {
    const backups = Object.keys(localStorage).filter(k => k.startsWith('backup_'));
    if (backups.length === 0) { showNotification('Nenhum backup encontrado', 'error'); return; }
    const modalHtml = `
        <div class="modal" id="backupsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <h2>Backups Disponíveis</h2>
                <div style="margin: 1rem 0;">
                    ${backups.map(backup => {
                        const data = JSON.parse(localStorage.getItem(backup));
                        return `
                            <div class="backup-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border-bottom: 1px solid rgba(255,215,0,0.2);">
                                <div><strong>${new Date(data.date).toLocaleDateString()}</strong><div style="font-size: 0.7rem;">${data.events?.length || 0} eventos • ${data.guests?.length || 0} convidados</div></div>
                                <div><button class="btn-small" onclick="restoreBackup('${backup}')">Restaurar</button><button class="btn-small danger" onclick="localStorage.removeItem('${backup}'); location.reload();">Excluir</button></div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="form-actions"><button class="btn-secondary" onclick="this.closest('.modal').remove()">Fechar</button></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function customizeInviteMessage() {
    const currentMessage = localStorage.getItem('customInviteMessage') || '';
    const modalHtml = `
        <div class="modal" id="customizeModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <h2>Personalizar Mensagem do Convite</h2>
                <p style="font-size: 0.8rem; color: #888;">Use as variáveis: {evento}, {convidado}, {data}, {local}</p>
                <textarea id="inviteMessage" rows="6" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,215,0,0.3); border-radius: 12px; color: #fff; margin-bottom: 1rem;">${currentMessage}</textarea>
                <div class="form-actions">
                    <button class="btn" onclick="saveInviteMessage()">Salvar</button>
                    <button class="btn-secondary" onclick="localStorage.removeItem('customInviteMessage'); this.closest('.modal').remove(); showNotification('Mensagem padrão restaurada', 'success');">Restaurar Padrão</button>
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function saveInviteMessage() {
    const message = document.getElementById('inviteMessage').value;
    if (message.trim()) { localStorage.setItem('customInviteMessage', message); showNotification('Mensagem personalizada salva!', 'success'); }
    else { localStorage.removeItem('customInviteMessage'); showNotification('Mensagem padrão restaurada', 'success'); }
    document.getElementById('customizeModal')?.remove();
}

window.restoreBackup = function(backupKey) { restoreBackup(backupKey); };

function renderChecklist() {
    let filteredTasks = state.tasks;
    if (state.taskFilter === 'pending') filteredTasks = filteredTasks.filter(t => !t.completed);
    else if (state.taskFilter === 'completed') filteredTasks = filteredTasks.filter(t => t.completed);
    const categories = {};
    filteredTasks.forEach(task => { if (!categories[task.category]) categories[task.category] = []; categories[task.category].push(task); });
    const categoryOrder = ['12 meses', '9 meses', '6 meses', '3 meses', '1 mês', '1 semana', 'Dia do Casamento'];
    const progress = getProgressoChecklist();
    
    return `
        <div class="checklist-section">
            <div class="checklist-header">
                <h2>Checklist do Casamento</h2>
                <div class="checklist-filters">
                    <button class="filter-btn ${state.taskFilter === 'all' ? 'active' : ''}" onclick="setTaskFilter('all')">Todas</button>
                    <button class="filter-btn ${state.taskFilter === 'pending' ? 'active' : ''}" onclick="setTaskFilter('pending')">Pendentes</button>
                    <button class="filter-btn ${state.taskFilter === 'completed' ? 'active' : ''}" onclick="setTaskFilter('completed')">Concluídas</button>
                    <button class="btn" onclick="openTaskModal()">Nova Tarefa</button>
                    <button class="btn-secondary" onclick="requestNotificationPermission()">🔔 Ativar Notificações</button>
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
                return `<div class="checklist-category">
                    <div class="category-title"><span>${cat}</span><span>${concluidas}/${tasks.length} concluídas</span></div>
                    ${tasks.map(task => `<div class="task-item">
                        <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete('${task.id}')">
                        <div class="task-content">
                            <div class="task-name">${task.name}<span class="task-priority priority-${task.priority}">${task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa'}</span></div>
                            ${task.due_date ? `<div class="task-due-date">Vence: ${formatDate(task.due_date)}</div>` : ''}
                        </div>
                        <div class="task-actions">
                            ${!task.completed ? `<button class="btn-small" onclick="completeTask('${task.id}')">Concluir</button>` : ''}
                            <button class="btn-small" onclick="editTask('${task.id}')">Editar</button>
                            <button class="btn-small" onclick="deleteTaskConfirm('${task.id}')">Excluir</button>
                        </div>
                    </div>`).join('')}
                </div>`;
            }).join('')}
            ${filteredTasks.length === 0 ? '<div class="empty-state">Nenhuma tarefa encontrada!</div>' : ''}
        </div>
    `;
}

function renderAbout() {
    return `
        <div class="about-section">
            <div class="about-header-horizontal">
                <div class="about-logo-horizontal"><img src="assets/logo3.png" class="about-logo-img-horizontal" onerror="this.style.display='none'"></div>
                <div class="about-text-horizontal">
                    <h1 class="about-logo-title">LA VIE</h1>
                    <div class="about-logo-subtitle">CASAMENTOS</div>
                    <p class="about-tagline">Realizando sonhos com tecnologia e inovação</p>
                </div>
            </div>
            <div class="about-card"><h2><i class="fas fa-bullseye"></i> Missão</h2><p>Oferecer uma plataforma completa e intuitiva que permita aos casais planejarem seu casamento com tranquilidade, economia e organização, conectando tecnologia e emoção em cada detalhe.</p></div>
            <div class="about-card"><h2><i class="fas fa-eye"></i> Visão</h2><p>Ser referência acadêmica e profissional em plataformas de planejamento de casamentos, reconhecida pela inovação tecnológica, confiabilidade e por transformar sonhos em realidade.</p></div>
            <div class="about-card"><h2><i class="fas fa-gem"></i> Valores</h2><ul class="about-values"><li><i class="fas fa-microchip"></i> Inovação tecnológica</li><li><i class="fas fa-trophy"></i> Compromisso com a excelência</li><li><i class="fas fa-shield-alt"></i> Transparência e confiança</li><li><i class="fas fa-heart"></i> Empatia com os sonhos dos casais</li><li><i class="fas fa-graduation-cap"></i> Aprendizado contínuo</li></ul></div>
            <div class="about-footer"><p>&copy; 2026 La Vie Casamentos - Trabalho Acadêmico</p><p>Desenvolvido por estudantes de Análise e Desenvolvimento de Sistemas</p><p class="academic-note">✨ Transformando sonhos em realidade ✨</p>
        </div>
    `;
}

// ============================================
// RENDERIZAÇÃO DO DASHBOARD
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
            data: { labels: Object.keys(gastos), datasets: [{ data: Object.values(gastos), backgroundColor: ['#ffd700', '#ffb347', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#ec489a'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } } } }
        });
    }
    const status = getStatusConvidados();
    if (ctxPie2 && state.guests.length > 0) {
        state.charts.pizzaStatus = new Chart(ctxPie2, {
            type: 'doughnut',
            data: { labels: [`Confirmados (${status.confirmado})`, `Pendentes (${status.pendente})`, `Recusados (${status.recusado})`], datasets: [{ data: [status.confirmado, status.pendente, status.recusado], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#fff' } } } }
        });
    }
    createExpenseTimeline();
}

async function renderDashboard() {
    const app = document.getElementById('app');
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const totalGasto = getTotalGasto();
    const orcamentoTotal = currentEvent?.budget_total || 0;
    const percentual = orcamentoTotal > 0 ? (totalGasto / orcamentoTotal) * 100 : 0;
    const progressoChecklist = getProgressoChecklist();
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || state.user?.photoURL || '';
    const countdown = getCountdown(currentEvent?.event_date);
    
    let modalHtml = '';
    if (state.showEventForm) modalHtml = renderEventForm();
    if (state.showGuestForm) modalHtml = renderGuestForm();
    if (state.showSupplierForm) modalHtml = renderSupplierForm();
    if (state.showTaskForm) modalHtml = renderTaskForm();
    
    app.innerHTML = `
        <div class="header">
            <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.3rem 1rem 0.3rem 0.5rem; border-radius: 60px;">
                <img src="./assets/logo3.svg" alt="La Vie" style="height: 100px; width: 100px; border-radius: 100%; object-fit: cover;">
            </div>
            <div class="tabs">
                <button class="tab ${state.activeTab === 'dashboard' ? 'active' : ''}" onclick="setActiveTab('dashboard')">Dashboard</button>
                <button class="tab ${state.activeTab === 'checklist' ? 'active' : ''}" onclick="setActiveTab('checklist')">Checklist</button>
                <button class="tab ${state.activeTab === 'events' ? 'active' : ''}" onclick="setActiveTab('events')">Eventos</button>
                <button class="tab ${state.activeTab === 'about' ? 'active' : ''}" onclick="setActiveTab('about')">Sobre Nós</button>
            </div>
            <div class="user-info">
                <button class="btn-calendar" onclick="setActiveTab('calendar')" style="background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); padding: 0.4rem 1rem; border-radius: 50px; cursor: pointer; color: #ffd700;">📅 Calendário</button>
                <div class="profile-pic" onclick="setActiveTab('profile')">
                    ${photoUrl ? `<img src="${photoUrl}" alt="Perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}
                </div>
                <span onclick="setActiveTab('profile')">${state.user?.username}</span>
                <button onclick="logout()" style="background: #e11d48; color: white; border: none; padding: 0.4rem 1rem; border-radius: 50px; cursor: pointer; font-weight: bold; margin-left: 0.5rem;">Sair</button>
            </div>
        </div>
        <div class="container">
            <div class="tab-content ${state.activeTab === 'dashboard' ? 'active' : ''}">
                ${state.selectedEvent && currentEvent ? `
                    <div class="countdown-card" style="background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,179,71,0.08)); border-radius: 16px; padding: 1rem; text-align: center; margin-bottom: 1.5rem;">
                        <i class="fas fa-hourglass-half" style="color: #ffd700;"></i>
                        <span id="countdownTimer" style="color: #ffd700; font-weight: bold;">${countdown}</span>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card"><h3>Eventos</h3><div class="stat-number">${state.events.length}</div></div>
                        <div class="stat-card"><h3>Convidados</h3><div class="stat-number">${state.guests.length}</div></div>
                        <div class="stat-card"><h3>Fornecedores</h3><div class="stat-number">${state.suppliers.length}</div></div>
                        <div class="stat-card"><h3>Tarefas</h3><div class="stat-number">${state.tasks.filter(t => t.completed).length}/${state.tasks.length}</div></div>
                    </div>
                    <div class="budget-grid">
                        <div class="budget-card used"><h3>Utilizado</h3><div class="budget-value">${formatCurrency(totalGasto)}</div><small>${percentual.toFixed(1)}% do total</small></div>
                        <div class="budget-card available"><h3>Disponível</h3><div class="budget-value">${formatCurrency(orcamentoTotal - totalGasto)}</div><small>${(100 - percentual).toFixed(1)}% restante</small></div>
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
                    <div class="chart-card" style="margin-top: 1rem;">
                        <h3>📈 Evolução de Gastos</h3>
                        <div class="chart-container" style="height: 300px;"><canvas id="expenseTimeline"></canvas></div>
                    </div>
                ` : `<div class="empty-state"><p>Selecione um evento para ver o dashboard!</p><button class="btn" onclick="setActiveTab('events')">Ver meus eventos</button></div>`}
            </div>
            <div class="tab-content ${state.activeTab === 'checklist' ? 'active' : ''}">${renderChecklist()}</div>
            <div class="tab-content ${state.activeTab === 'events' ? 'active' : ''}">
                <div class="section-header">
                    <h2>Meus Eventos</h2>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn" onclick="openEventModal()">Novo Evento</button>
                        <button class="btn-secondary" onclick="exportToPDF()">📄 Exportar PDF</button>
                    </div>
                </div>
                ${state.events.length === 0 ? '<div class="empty-state">Nenhum evento. Crie seu primeiro evento!</div>' : `<div class="events-grid">${state.events.map(event => {
                    const gastosEvento = state.suppliers.filter(s => s.event_id === event.id).reduce((s, i) => s + (i.value || 0), 0);
                    const perc = event.budget_total ? (gastosEvento / event.budget_total) * 100 : 0;
                    return `<div class="event-card ${state.selectedEvent === event.id ? 'selected' : ''}" onclick="selectEvent('${event.id}')">
                        <div class="event-card-header"><h4>${event.name || event.couple_names || 'Evento'}</h4></div>
                        <div class="event-card-body">
                            <p><strong>Tipo:</strong> ${event.event_type || 'Tipo'}</p>
                            <p><strong>Orçamento:</strong> ${formatCurrency(event.budget_total)}</p>
                            <p><strong>Gasto:</strong> ${formatCurrency(gastosEvento)} (${perc.toFixed(0)}%)</p>
                            <p><strong>Data/Horário:</strong> ${formatDate(event.event_date)} ${event.event_time ? `às ${event.event_time.substring(0,5)}` : ''}</p>
                        </div>
                        <div><button class="btn-secondary" onclick="event.stopPropagation(); editEvent('${event.id}')">Editar</button><button class="btn-secondary" onclick="event.stopPropagation(); deleteEventConfirm('${event.id}')">Excluir</button></div>
                    </div>`;
                }).join('')}</div>`}
                ${state.selectedEvent && currentEvent ? `
                    <div>
                        <div class="section-header"><h2>Gerenciando: ${currentEvent.name || currentEvent.couple_names || 'Evento'}</h2><button class="btn-secondary" onclick="selectEvent(null)">Trocar Evento</button></div>
                        <div style="margin-bottom: 1rem; padding: 0.5rem 1rem; background: rgba(255,215,0,0.1); border-radius: 12px;">
                            <i class="fas fa-calendar-alt"></i> ${formatDate(currentEvent.event_date)} 
                            ${currentEvent.event_time ? `<i class="fas fa-clock"></i> ${currentEvent.event_time.substring(0,5)}` : ''}
                            ${currentEvent.venue ? `<i class="fas fa-map-marker-alt"></i> ${currentEvent.venue}` : ''}
                            <button class="btn-small" onclick="shareEvent('${currentEvent.id}')" style="margin-left: 1rem; background: #8b5cf6;">🔗 Compartilhar</button>
                        </div>
                        <div class="section-header"><h2>Convidados</h2><div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn" onclick="openGuestModal()">Adicionar</button>
                            <button class="btn-secondary" onclick="importGuestsFile()">Importar Arquivo</button>
                            <button class="btn-secondary" onclick="downloadGuestTemplate()">Baixar Modelo</button>
                            <button class="btn-secondary" onclick="exportGuestsToExcel()">Exportar Todos</button>
                            <button class="btn-secondary" onclick="sendMassWhatsAppInvite()" style="background: #25D366; color: white;">Enviar Convites</button>
                        </div></div>
                        <div id="guestListContainer"></div>
                        <div class="section-header"><h2>Fornecedores</h2><div><button class="btn" onclick="openSupplierModal()">Adicionar</button><button class="btn-secondary" onclick="showSupplierSuggestions()" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">Sugerir Fornecedores</button><button class="btn-secondary" onclick="exportSuppliersToExcel()">Exportar Excel</button></div></div>
                        <div id="supplierListContainer"></div>
                        <div id="supplierPagination" class="pagination-container" style="margin-top: 1rem;"></div>
                        <div id="savedSuppliersContainer"></div>
                    </div>
                ` : state.events.length > 0 ? '<div class="empty-state">Clique em um evento para gerenciar</div>' : ''}
            </div>
            <div class="tab-content ${state.activeTab === 'calendar' ? 'active' : ''}">${renderCalendario()}</div>
            <div class="tab-content ${state.activeTab === 'about' ? 'active' : ''}">${renderAbout()}</div>
            <div class="tab-content ${state.activeTab === 'profile' ? 'active' : ''}">${renderPerfil()}</div>
        </div>
        ${modalHtml}
    `;
    
    criarGraficos();
    attachFormEvents();
    if (state.selectedEvent) {
        await loadSavedSuppliersList();
        renderGuestListWithSearch();
        renderSupplierListWithSearch();
        startCountdownTimer();
    }
    
    const restorePending = localStorage.getItem('restorePending');
    if (restorePending) {
        localStorage.removeItem('restorePending');
        showNotification('Backup restaurado! Recarregue a página.', 'success');
    }
}

// ============================================
// WINDOW FUNCTIONS (GLOBAIS)
// ============================================

window.setAuthMode = (m) => { state.authMode = m; renderAuth(); };
window.setActiveTab = (tab) => { state.activeTab = tab; renderDashboard(); };
window.setTaskFilter = (filter) => { state.taskFilter = filter; renderDashboard(); };
window.selectEvent = async (id) => { 
    if (id) {
        showLoader('Carregando evento...');
        state.selectedEvent = id; 
        await loadEventData(id);
        state.searchTerm = '';
        state.filterStatus = 'todos';
        state.sortBy = 'name';
        state.sortOrder = 'asc';
        state.currentPage = 1;
        renderGuestListWithSearch();
        renderSupplierListWithSearch();
        hideLoader();
    } else { state.selectedEvent = null; }
    renderDashboard(); 
};
window.mudarMes = (d) => { const nd = new Date(state.calendarYear, state.calendarMonth + d, 1); state.calendarYear = nd.getFullYear(); state.calendarMonth = nd.getMonth(); renderDashboard(); };
window.toggleTaskComplete = async (id) => { await toggleTaskComplete(id); state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id); renderDashboard(); autoBackup(); };
window.openEventModal = () => { state.editingEvent = null; state.showEventForm = true; setFormDirty(false); renderDashboard(); };
window.editEvent = (id) => { state.editingEvent = state.events.find(e => e.id === id); state.showEventForm = true; setFormDirty(false); renderDashboard(); };
window.closeEventModal = () => { state.showEventForm = false; state.editingEvent = null; setFormDirty(false); renderDashboard(); };
window.openGuestModal = () => { if (!state.selectedEvent) return showNotification('Selecione um evento primeiro!', 'error'); state.editingGuest = null; state.showGuestForm = true; setFormDirty(false); renderDashboard(); };
window.editGuest = (id) => { state.editingGuest = state.guests.find(g => g.id === id); state.showGuestForm = true; setFormDirty(false); renderDashboard(); };
window.closeGuestModal = () => { state.showGuestForm = false; state.editingGuest = null; setFormDirty(false); renderDashboard(); };
window.openSupplierModal = () => { if (!state.selectedEvent) return showNotification('Selecione um evento primeiro!', 'error'); state.editingSupplier = null; state.showSupplierForm = true; setFormDirty(false); renderDashboard(); };
window.editSupplier = (id) => { state.editingSupplier = state.suppliers.find(s => s.id === id); state.showSupplierForm = true; setFormDirty(false); renderDashboard(); };
window.closeSupplierModal = () => { state.showSupplierForm = false; state.editingSupplier = null; setFormDirty(false); renderDashboard(); };
window.openTaskModal = () => { state.editingTask = null; state.showTaskForm = true; setFormDirty(false); renderDashboard(); };
window.editTask = (id) => { state.editingTask = state.tasks.find(t => t.id === id); state.showTaskForm = true; setFormDirty(false); renderDashboard(); };
window.closeTaskModal = () => { state.showTaskForm = false; state.editingTask = null; setFormDirty(false); renderDashboard(); };
window.completeTask = async (id) => { await toggleTaskComplete(id); state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id); renderDashboard(); autoBackup(); };
window.showQRCodeModal = showQRCodeModal;
window.exportToPDF = exportToPDF;
window.shareEvent = shareEvent;
window.requestNotificationPermission = requestNotificationPermission;
window.saveInviteMessage = saveInviteMessage;
window.showBackupsList = showBackupsList;
window.logout = logout;
window.forceLogoutToLogin = forceLogoutToLogin;
// Adicione no final do script.js
window.addEventListener('openQRCode', (e) => {
    const { guestId, guestName } = e.detail;
    if (typeof showQRCodeModal === 'function') {
        showQRCodeModal(guestId, guestName);
    }
});
// ============================================
// FUNÇÕES DE TEMA FLUTUANTE
// ============================================

function createThemeUI() {
    const existingBtn = document.querySelector('.theme-toggle-btn');
    if (existingBtn) existingBtn.remove();
    const existingMenu = document.getElementById('themeMenu');
    if (existingMenu) existingMenu.remove();
    
    const themeBtn = document.createElement('div');
    themeBtn.className = 'theme-toggle-btn';
    themeBtn.innerHTML = '<span class="theme-icon">🎨</span>';
    themeBtn.style.cssText = 'position:fixed; bottom:20px; left:20px; width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg,#ffd700,#ffb347); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:9999; box-shadow:0 4px 15px rgba(0,0,0,0.3); transition:all 0.3s;';
    
    const themeMenu = document.createElement('div');
    themeMenu.id = 'themeMenu';
    themeMenu.style.cssText = 'position:fixed; bottom:80px; left:20px; background:#1a1a2e; border-radius:16px; padding:1rem; min-width:200px; z-index:10000; border:1px solid rgba(255,215,0,0.3); box-shadow:0 10px 30px rgba(0,0,0,0.4); display:none;';
    themeMenu.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,215,0,0.2);"><h3 style="color:#ffd700; margin:0;">Escolha um Tema</h3><button id="closeThemeMenu" style="background:none; border:none; color:#888; cursor:pointer; font-size:1.2rem;">&times;</button></div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <div class="theme-option" data-theme="gold"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#ffd700,#ffb347);"></div><span>Dourado</span></div>
            <div class="theme-option" data-theme="rose"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#ff69b4,#ff1493);"></div><span>Rosa</span></div>
            <div class="theme-option" data-theme="blue"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#00bfff,#1e90ff);"></div><span>Azul</span></div>
            <div class="theme-option" data-theme="green"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#32cd32,#228b22);"></div><span>Verde</span></div>
            <div class="theme-option" data-theme="purple"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#9370db,#8a2be2);"></div><span>Roxo</span></div>
            <div class="theme-option" data-theme="dark"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#2c3e50,#1a1a2e);"></div><span>Escuro</span></div>
        </div>
        <div style="margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,215,0,0.2);"><div class="theme-option" data-theme="auto"><div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#666,#888);"></div><span>🌓 Automático (Sistema)</span></div></div>
    `;
    
    document.body.appendChild(themeBtn);
    document.body.appendChild(themeMenu);
    
    themeBtn.addEventListener('click', (e) => { e.stopPropagation(); themeMenu.style.display = themeMenu.style.display === 'none' ? 'block' : 'none'; });
    document.getElementById('closeThemeMenu')?.addEventListener('click', () => { themeMenu.style.display = 'none'; });
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.dataset.theme;
            if (theme === 'auto') { localStorage.removeItem('selectedTheme'); detectSystemTheme(); }
            else { applyTheme(theme); }
            themeMenu.style.display = 'none';
        });
    });
    document.addEventListener('click', (e) => { if (!themeBtn.contains(e.target) && !themeMenu.contains(e.target)) { themeMenu.style.display = 'none'; } });
}

function applyTheme(theme) {
    document.body.classList.remove('theme-rose', 'theme-blue', 'theme-green', 'theme-purple', 'theme-dark');
    if (theme !== 'gold') { document.body.classList.add(`theme-${theme}`); }
    localStorage.setItem('selectedTheme', theme);
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selectedTheme');
    if (savedTheme && savedTheme !== 'gold') { document.body.classList.add(`theme-${savedTheme}`); }
}

// ============================================
// REGISTRO DO SERVICE WORKER (PWA)
// ============================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => console.log('✅ Service Worker registrado:', registration.scope))
            .catch(error => console.log('❌ Falha ao registrar Service Worker:', error));
    });
}
// ============================================
// FUNÇÕES CORRETIVAS E FALTANTES
// ============================================

// 1. Envio em massa de WhatsApp
window.sendMassWhatsAppInvite = async function() {
    if (!state.selectedEvent) {
        showNotification('Selecione um evento primeiro!', 'error');
        return;
    }
    
    const pendentes = state.guests.filter(g => g.status === 'pendente' && g.phone);
    if (pendentes.length === 0) {
        showNotification('Nenhum convidado pendente com telefone cadastrado!', 'warning');
        return;
    }
    
    showConfirmModal('📱 Envio em Massa', 
        `Você tem ${pendentes.length} convidados pendentes com telefone.\nDeseja abrir o WhatsApp para cada um?`, 
        async () => {
            showLoader('Preparando envios...');
            for (let i = 0; i < pendentes.length; i++) {
                const guest = pendentes[i];
                updateLoaderMessage(`Abrindo WhatsApp para ${guest.name} (${i+1}/${pendentes.length})`);
                updateLoaderProgress((i / pendentes.length) * 100);
                await new Promise(resolve => setTimeout(resolve, 800));
                window.sendWhatsAppInvite(guest.id, guest.name, guest.phone);
            }
            hideLoader();
            showNotification(`${pendentes.length} convites abertos! Envie um por um no WhatsApp.`, 'success');
        }, null, false);
};

// 2. Restaurar backup
window.restoreBackup = function(backupKey) {
    try {
        const backupData = localStorage.getItem(backupKey);
        if (!backupData) {
            showNotification('Backup não encontrado', 'error');
            return;
        }
        
        const data = JSON.parse(backupData);
        showConfirmModal('Restaurar Backup', 
            `Deseja restaurar o backup de ${new Date(data.date).toLocaleString()}?\nIsso substituirá todos os dados atuais.`, 
            async () => {
                localStorage.setItem('restorePending', 'true');
                
                // Salvar dados restaurados
                if (data.events) localStorage.setItem('restored_events', JSON.stringify(data.events));
                if (data.guests) localStorage.setItem('restored_guests', JSON.stringify(data.guests));
                if (data.suppliers) localStorage.setItem('restored_suppliers', JSON.stringify(data.suppliers));
                
                showNotification('Backup restaurado! Recarregando...', 'success');
                setTimeout(() => location.reload(), 1500);
            }, null, true);
    } catch(e) {
        console.error('Erro ao restaurar backup:', e);
        showNotification('Erro ao restaurar backup', 'error');
    }
};

// 3. Correção do getCountdown (substituir a função existente)
const originalGetCountdown = getCountdown;
window.getCountdown = function(eventDate) {
    if (!eventDate) return 'Data não definida';
    const event = new Date(eventDate);
    if (isNaN(event.getTime())) return 'Data inválida';
    return originalGetCountdown(eventDate);
};

// 4. Verificação do XLSX nas importações
const originalProcessGuestFile = processGuestFile;
window.safeProcessGuestFile = async function(file) {
    if (typeof XLSX === 'undefined') {
        showNotification('Biblioteca de Excel não carregada. Recarregue a página.', 'error');
        return;
    }
    return originalProcessGuestFile(file);
};

console.log('✅ Funções corretivas adicionadas com sucesso!');
// ============================================
// INICIALIZAÇÃO
// ============================================

loadSavedTheme();
createThemeUI();
checkAuthState();

// Adicionar animações CSS
const styleAnim = document.createElement('style');
styleAnim.textContent = `
    @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
    .theme-option { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem; border-radius: 12px; cursor: pointer; color: #fff; }
    .theme-option:hover { background: rgba(255,215,0,0.1); }
`;
document.head.appendChild(styleAnim);