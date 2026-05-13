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
    charts: {}
};

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.forgotPassword = async function() {
    const email = prompt('Digite seu e-mail para recuperar a senha:');
    if (!email || !email.includes('@')) {
        alert('Digite um e-mail valido');
        return;
    }
    const result = await sendPasswordResetEmailFunction(email);
    if (result.success) {
        alert('Email de recuperacao enviado! Verifique sua caixa de entrada.');
    } else {
        alert(result.error === 'auth/user-not-found' ? 'Usuario nao encontrado' : 'Erro ao enviar email');
    }
};

window.resendVerification = async function() {
    const email = prompt('Digite seu e-mail para receber um novo link de verificacao:');
    if (!email || !email.includes('@')) {
        alert('Digite um e-mail valido');
        return;
    }
    const result = await loginWithEmail(email, 'dummy');
    if (result.error === 'email-not-verified') {
        const sendResult = await sendVerificationEmail();
        alert(sendResult.success ? 'Novo email enviado!' : 'Erro ao enviar');
    } else {
        alert(result.success ? 'Email ja verificado!' : 'Usuario nao encontrado');
    }
};

async function ensureEventHasTasks(eventId) {
    const tasks = await getUserTasks(state.user.id, eventId);
    if (tasks.length === 0) {
        await createDefaultTasksForEvent(state.user.id, eventId);
        return true;
    }
    return false;
}

// ============================================
// CALCULAR VALOR DO FORNECEDOR
// ============================================

function calculateSupplierValue(priceRange, guestCount, category) {
    if (!priceRange) return 0;
    const numbers = priceRange.match(/\d+/g);
    if (!numbers || numbers.length === 0) return 0;
    let averagePerPerson = 0;
    const isPerPerson = priceRange.toLowerCase().includes('por pessoa') || (parseInt(numbers[0]) < 500 && category === 'buffet');
    if (isPerPerson) {
        const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
        const avgPricePerPerson = sum / numbers.length;
        averagePerPerson = avgPricePerPerson * guestCount;
    } else {
        const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
        averagePerPerson = sum / numbers.length;
    }
    return Math.round(averagePerPerson);
}

function getEstimatedCostDescription(priceRange, guestCount, category) {
    if (!priceRange) return '';
    const isPerPerson = priceRange.toLowerCase().includes('por pessoa') || (category === 'buffet');
    if (isPerPerson && guestCount > 0) {
        const numbers = priceRange.match(/\d+/g);
        if (numbers) {
            const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
            const avgPerPerson = Math.round(sum / numbers.length);
            const total = avgPerPerson * guestCount;
            return ` (${formatCurrency(avgPerPerson)} por pessoa × ${guestCount} convidados = ${formatCurrency(total)})`;
        }
    }
    return '';
}

// ============================================
// ENVIAR CONVITE POR WHATSAPP
// ============================================

window.sendWhatsAppInvite = async function(guestId, guestName, guestPhone) {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    if (!guestPhone || guestPhone.trim() === '') {
        alert('Este convidado nao possui numero de telefone cadastrado!');
        return;
    }
    if (!guestId) {
        alert('Erro: ID do convidado nao encontrado!');
        return;
    }
    
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventName = currentEvent?.name || currentEvent?.couple_names || 'Evento';
    const eventDate = currentEvent?.event_date ? new Date(currentEvent.event_date).toLocaleDateString('pt-BR') : 'Data a definir';
    const eventVenue = currentEvent?.venue || 'Local a confirmar';
    
    const baseUrl = 'https://la-vie-casamentos.web.app';
    const confirmLink = `${baseUrl}/confirmar.html?eventId=${state.selectedEvent}&guestId=${guestId}&status=confirmado`;
    const declineLink = `${baseUrl}/confirmar.html?eventId=${state.selectedEvent}&guestId=${guestId}&status=recusado`;
    
    let phoneNumber = guestPhone.replace(/\D/g, '');
    if (phoneNumber.length === 11) {
        phoneNumber = '55' + phoneNumber;
    } else if (phoneNumber.length === 10) {
        phoneNumber = '55' + phoneNumber.substring(0, 2) + '9' + phoneNumber.substring(2);
    }
    
    const message = `*${eventName}*%0a%0aOlá ${guestName}!%0a%0aData: ${eventDate}%0aLocal: ${eventVenue}%0a%0aConfirme sua presença:%0a✅ ${confirmLink}%0a❌ ${declineLink}`;
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
    showNotification(`Abrindo WhatsApp para ${guestName}`, 'success');
};

window.sendMassWhatsAppInvite = async function() {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    const pendingGuests = state.guests.filter(g => g.status === 'pendente' && g.phone);
    if (pendingGuests.length === 0) {
        alert('Nenhum convidado pendente com telefone cadastrado para enviar convite!');
        return;
    }
    if (!confirm(`Voce ira enviar convites via WhatsApp para ${pendingGuests.length} convidados pendentes.\n\nIsso abrira ${pendingGuests.length} abas no seu navegador.\n\nDeseja continuar?`)) return;
    for (const guest of pendingGuests) {
        await new Promise(resolve => setTimeout(resolve, 800));
        window.sendWhatsAppInvite(guest.id, guest.name, guest.phone);
    }
    showNotification(`Enviando convites para ${pendingGuests.length} convidados pendentes...`, 'success');
};

// ============================================
// EXPORTACAO DE CONVIDADOS
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
    
    const dados = [];
    dados.push(['LA VIE CASAMENTOS - RELATORIO DE CONVIDADOS', '', '', '', '']);
    dados.push(['Evento:', eventName, '', '', '']);
    dados.push(['Data do Evento:', currentEvent?.event_date ? new Date(currentEvent.event_date).toLocaleDateString('pt-BR') : 'Nao definida', '', '', '']);
    dados.push(['Data de Exportacao:', new Date().toLocaleDateString('pt-BR'), '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['RESUMO DO EVENTO', '', '', '', '']);
    dados.push(['Total de Convidados:', state.guests.length, '', '', '']);
    dados.push(['Confirmados:', confirmados, '', '', '']);
    dados.push(['Pendentes:', pendentes, '', '', '']);
    dados.push(['Recusados:', recusados, '', '', '']);
    dados.push(['Taxa de Confirmacao:', ((confirmados / state.guests.length) * 100).toFixed(1) + '%', '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['Nome do Convidado', 'Grupo/Familia', 'Status', 'Mesa', 'Telefone', 'Data de Cadastro']);
    
    for (const guest of state.guests) {
        dados.push([
            guest.name || '',
            guest.group_name || '',
            guest.status === 'confirmado' ? 'Confirmado' : guest.status === 'recusado' ? 'Recusado' : 'Pendente',
            guest.table_name || '',
            guest.phone || '',
            new Date(guest.created_at || Date.now()).toLocaleDateString('pt-BR')
        ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Convidados');
    const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    XLSX.writeFile(wb, `convidados_${eventName.replace(/[^a-z0-9]/gi, '_')}_${dataAtual}.xlsx`);
    showNotification(`${state.guests.length} convidados exportados!`, 'success');
};

// ============================================
// EXPORTACAO DE FORNECEDORES
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
    
    const dados = [];
    dados.push(['LA VIE CASAMENTOS - RELATORIO DE FORNECEDORES', '', '', '', '']);
    dados.push(['Evento:', eventName, '', '', '']);
    dados.push(['Data do Evento:', currentEvent?.event_date ? new Date(currentEvent.event_date).toLocaleDateString('pt-BR') : 'Nao definida', '', '', '']);
    dados.push(['Data de Exportacao:', new Date().toLocaleDateString('pt-BR'), '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['RESUMO FINANCEIRO', '', '', '', '']);
    dados.push(['Total de Fornecedores:', state.suppliers.length, '', '', '']);
    dados.push(['Total Gasto:', formatCurrency(totalGasto), '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['GASTOS POR CATEGORIA', '', '', '', '']);
    for (const [cat, valor] of Object.entries(categorias)) {
        dados.push([cat, formatCurrency(valor), '', '', '']);
    }
    dados.push(['', '', '', '', '']);
    dados.push(['', '', '', '', '']);
    dados.push(['Nome do Fornecedor', 'Categoria', 'Status', 'Valor (R$)', 'Contato', 'Data de Cadastro']);
    for (const supplier of state.suppliers) {
        let statusTexto = supplier.status === 'contratado' ? 'Contratado' : supplier.status === 'negociacao' ? 'Negociacao' : 'Cotado';
        dados.push([
            supplier.name || '',
            supplier.category || '',
            statusTexto,
            formatCurrency(supplier.value || 0),
            supplier.contact || '',
            new Date(supplier.created_at || Date.now()).toLocaleDateString('pt-BR')
        ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores');
    const dataAtual = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    XLSX.writeFile(wb, `fornecedores_${eventName.replace(/[^a-z0-9]/gi, '_')}_${dataAtual}.xlsx`);
    showNotification(`${state.suppliers.length} fornecedores exportados!`, 'success');
};

// ============================================
// IMPORTACAO DE CONVIDADOS
// ============================================

window.importGuestsFile = function() {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await processGuestFile(file);
    };
    input.click();
};

async function processGuestFile(file) {
    const extension = file.name.split('.').pop().toLowerCase();
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
        } else {
            alert('Formato nao suportado. Use CSV ou Excel.');
            return;
        }
        const result = await importGuestsFromData(data);
        if (result.imported.length > 0) {
            alert(`Importacao concluida!\n\n${result.imported.length} convidados importados.\n${result.errors.length} erros.`);
            state.guests = await getEventGuests(state.selectedEvent);
            renderDashboard();
        } else {
            alert(`Nenhum convidado importado.\n\nErros:\n${result.errors.slice(0, 5).join('\n')}`);
        }
    } catch (error) {
        alert('Erro ao processar o arquivo.');
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
        headers.forEach((header, index) => {
            row[header] = values[index] ? values[index].trim().replace(/["']/g, '') : '';
        });
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
        status: ['status', 'situacao', 'situacao', 'confirmacao', 'confirmacao'],
        table: ['mesa', 'table', 'numero da mesa', 'numero da mesa'],
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
        
        if (!name || name.toString().trim() === '') {
            errors.push(`Linha ${i + 2}: Nome e obrigatorio`);
            continue;
        }
        const guestName = name.toString().trim();
        if (existingNames.has(guestName.toLowerCase())) {
            errors.push(`Linha ${i + 2}: "${guestName}" ja existe`);
            continue;
        }
        let normalizedStatus = 'pendente';
        const statusLower = status.toString().toLowerCase();
        if (statusLower === 'confirmado' || statusLower === 'confirm' || statusLower === 'yes') normalizedStatus = 'confirmado';
        else if (statusLower === 'recusado' || statusLower === 'declined' || statusLower === 'no') normalizedStatus = 'recusado';
        
        const guest = {
            name: guestName,
            group_name: group ? group.toString().trim() : '',
            status: normalizedStatus,
            table_name: table ? table.toString().trim() : '',
            phone: phone ? phone.toString().trim() : ''
        };
        const result = await createGuest(guest, state.selectedEvent);
        if (result.success) {
            imported.push(guest);
            existingNames.add(guestName.toLowerCase());
        } else {
            errors.push(`Linha ${i + 2}: Erro ao salvar "${guestName}"`);
        }
    }
    return { imported, errors };
}

window.downloadGuestTemplate = function() {
    const dados = [
        ['LA VIE CASAMENTOS - MODELO PARA IMPORTACAO', '', '', '', ''],
        ['', '', '', '', ''],
        ['INSTRUCOES:', '', '', '', ''],
        ['1. Preencha os dados a partir da linha 7', '', '', '', ''],
        ['2. Nome do Convidado e OBRIGATORIO', '', '', '', ''],
        ['3. Status aceitos: Confirmado, Pendente, Recusado', '', '', '', ''],
        ['', '', '', '', ''],
        ['Nome do Convidado', 'Grupo/Familia', 'Status', 'Mesa', 'Telefone'],
        ['Joao Silva', 'Familia Silva', 'Confirmado', 'Mesa 01', '(11) 99999-9999'],
        ['Maria Oliveira', 'Familia Oliveira', 'Pendente', 'Mesa 02', '(11) 88888-8888'],
        ['Carlos Santos', 'Familia Santos', 'Recusado', 'Mesa 03', '(11) 77777-7777']
    ];
    for (let i = 0; i < 20; i++) dados.push(['', '', '', '', '']);
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, `modelo_convidados_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showNotification('Modelo baixado!', 'success');
};

// ============================================
// FUNCOES DE SUPORTE PARA FORNECEDORES
// ============================================

function getCategoryIconSimple(category) {
    const icons = { buffet: '🍽️', fotografia: '📷', decoracao: '🎨', musica: '🎵', espaco: '🏠' };
    return icons[category] || '📦';
}

function getCategoryNameFull(category) {
    const names = { buffet: 'Buffet', fotografia: 'Fotografia', decoracao: 'Decoracao', musica: 'Musica', espaco: 'Espaco' };
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

// ============================================
// BOTÃO DE TEMAS FLUTUANTE COM ARRASTE
// ============================================

function loadThemeButtonPosition() {
    const savedPosition = localStorage.getItem('themeButtonPosition');
    if (savedPosition) {
        const position = JSON.parse(savedPosition);
        const btn = document.querySelector('.theme-toggle-btn');
        if (btn) {
            btn.style.left = position.left;
            btn.style.bottom = position.bottom;
        }
    }
}

function saveThemeButtonPosition(left, bottom) {
    localStorage.setItem('themeButtonPosition', JSON.stringify({ left, bottom }));
}

function makeThemeButtonDraggable() {
    const btn = document.querySelector('.theme-toggle-btn');
    if (!btn) return;
    
    let isDragging = false;
    let startX, startY, startLeft, startBottom;
    
    btn.addEventListener('mousedown', (e) => {
        if (e.target === btn || btn.contains(e.target)) {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const left = parseInt(btn.style.left);
            const bottom = parseInt(btn.style.bottom);
            startLeft = isNaN(left) ? 20 : left;
            startBottom = isNaN(bottom) ? 20 : bottom;
            
            btn.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = startX - e.clientX;
        const deltaY = startY - e.clientY;
        
        let newLeft = startLeft - deltaX;
        let newBottom = startBottom + deltaY;
        
        newLeft = Math.max(5, Math.min(newLeft, window.innerWidth - 70));
        newBottom = Math.max(5, Math.min(newBottom, window.innerHeight - 70));
        
        btn.style.left = newLeft + 'px';
        btn.style.bottom = newBottom + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            btn.style.cursor = 'grab';
            
            const left = btn.style.left;
            const bottom = btn.style.bottom;
            saveThemeButtonPosition(left, bottom);
        }
    });
}

// ============================================
// SUGESTAO DE FORNECEDORES COM IA
// ============================================

window.showSupplierSuggestions = async function() {
    if (!state.selectedEvent) {
        alert('Selecione um evento primeiro!');
        return;
    }
    const currentEvent = state.events.find(e => e.id === state.selectedEvent);
    const eventTheme = currentEvent?.theme || 'classico';
    const eventBudget = currentEvent?.budget_total || 50000;
    showNotification('Analisando tema e orcamento...', 'success');
    await new Promise(resolve => setTimeout(resolve, 1500));
    const suggestions = suggestSuppliersIA(eventTheme, eventBudget);
    const grouped = {};
    suggestions.forEach(s => {
        if (!grouped[s.category]) grouped[s.category] = [];
        grouped[s.category].push(s);
    });
    
    function getCategoryName(cat) {
        const names = { buffet: 'Buffet', fotografia: 'Fotografia', decoracao: 'Decoracao', musica: 'Musica', espaco: 'Espaco' };
        return names[cat] || cat;
    }
    function getCategoryIcon(cat) {
        const icons = { buffet: 'fa-utensils', fotografia: 'fa-camera', decoracao: 'fa-palette', musica: 'fa-music', espaco: 'fa-building' };
        return icons[cat] || 'fa-store';
    }
    
    const modalHtml = `
        <div class="modal" id="suggestionsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div class="suggestions-header">
                    <h2>IA - Sugestoes de Fornecedores</h2>
                    <p>Baseado no tema <strong>${eventTheme}</strong> e orcamento <strong>${formatCurrency(eventBudget)}</strong></p>
                    <button class="close-btn" onclick="closeSuggestionsModal()">✕</button>
                </div>
                <div class="suggestions-content">
                    ${Object.entries(grouped).map(([category, suppliers]) => `
                        <div class="suggestion-category">
                            <h3><i class="fas ${getCategoryIcon(category)}"></i> ${getCategoryName(category)}</h3>
                            <div class="suggestion-cards">
                                ${suppliers.map(supplier => `
                                    <div class="suggestion-card" style="cursor: pointer;" onclick="showSupplierDetails('${supplier.id}', '${supplier.name.replace(/'/g, "\\'")}', '${supplier.category}', '${supplier.priceRange.replace(/'/g, "\\'")}', ${supplier.rating}, '${supplier.tags.join(',')}', ${supplier.compatibility}, '${supplier.icon || getCategoryIconSimple(supplier.category)}')">
                                        <div class="suggestion-header">
                                            <span class="suggestion-icon">${supplier.icon || getCategoryIconSimple(supplier.category)}</span>
                                            <div>
                                                <h4>${supplier.name}</h4>
                                                <div class="suggestion-rating">Estrelas ${supplier.rating}/5</div>
                                            </div>
                                            <div class="compatibility-badge" style="background: ${getCompatibilityColor(supplier.compatibility)}">
                                                ${supplier.compatibility}% compatibilidade
                                            </div>
                                        </div>
                                        <div class="suggestion-details">
                                            <p><i class="fas fa-tag"></i> ${supplier.priceRange}</p>
                                            <p><i class="fas fa-palette"></i> Tags: ${supplier.tags.join(', ')}</p>
                                        </div>
                                        <button class="btn-small" onclick="event.stopPropagation(); saveSuggestedSupplier('${supplier.id}', '${supplier.name.replace(/'/g, "\\'")}', '${supplier.category}', '${supplier.priceRange.replace(/'/g, "\\'")}', ${supplier.rating}, ${supplier.compatibility})" style="background: #10b981; color: white; width: 100%; margin-top: 0.5rem;">
                                            Salvar na minha lista
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="suggestions-footer">
                    <button class="btn" onclick="closeSuggestionsModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeSuggestionsModal = function() {
    const modal = document.getElementById('suggestionsModal');
    if (modal) modal.remove();
};

window.saveSuggestedSupplier = async function(supplierId, name, category, priceRange, rating, compatibility) {
    try {
        const decodedName = name.replace(/\\'/g, "'");
        const decodedPriceRange = priceRange.replace(/\\'/g, "'");
        const result = await saveSuggestedSupplier(state.user.id, state.selectedEvent, {
            id: supplierId, name: decodedName, category: category, priceRange: decodedPriceRange, rating: rating, compatibility: compatibility
        });
        if (result.success) {
            const guestCount = state.guests.length;
            const estimatedValue = calculateSupplierValue(decodedPriceRange, guestCount, category);
            const costDescription = getEstimatedCostDescription(decodedPriceRange, guestCount, category);
            let message = `Fornecedor "${decodedName}" salvo na sua lista!`;
            if (guestCount > 0 && estimatedValue > 0) {
                message += `\n\nValor estimado para ${guestCount} convidados: ${formatCurrency(estimatedValue)}${costDescription}`;
            }
            showNotification(message, 'success');
            await loadSavedSuppliersList();
            closeSuggestionsModal();
            renderDashboard();
        } else {
            showNotification('Erro ao salvar fornecedor: ' + (result.error || 'Tente novamente'), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showNotification('Erro ao salvar fornecedor. Tente novamente.', 'error');
    }
};

// ============================================
// DETALHES DO FORNECEDOR
// ============================================

window.showSupplierDetails = function(supplierId, name, category, priceRange, rating, tags, compatibility, icon) {
    let tagsArray = tags;
    if (typeof tags === 'string') tagsArray = tags.split(',');
    const guestCount = state.guests.length;
    const estimatedValue = calculateSupplierValue(priceRange, guestCount, category);
    const costDescription = getEstimatedCostDescription(priceRange, guestCount, category);
    
    const modalHtml = `
        <div class="modal" id="supplierDetailsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="suggestions-header" style="margin-bottom: 1rem;">
                    <h2 style="color: #ffd700;">Detalhes do Fornecedor</h2>
                    <button class="close-btn" onclick="closeSupplierDetailsModal()">✕</button>
                </div>
                <div class="supplier-details-content">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="font-size: 3rem; margin-bottom: 0.5rem;">${icon || getCategoryIconSimple(category)}</div>
                        <h3 style="color: #ffd700; font-size: 1.5rem;">${name}</h3>
                        <div class="supplier-rating-detail">
                            <span style="color: #ffd700;">★★★★★</span> 
                            <span style="color: #fff;">${rating}/5</span>
                        </div>
                    </div>
                    <div class="supplier-info-group">
                        <div class="supplier-info-item"><span class="info-label">Categoria:</span><span class="info-value">${getCategoryNameFull(category)}</span></div>
                        <div class="supplier-info-item"><span class="info-label">Faixa de Preco:</span><span class="info-value">${priceRange}</span></div>
                        ${guestCount > 0 && estimatedValue > 0 ? `
                        <div class="supplier-info-item"><span class="info-label">Valor Estimado:</span><span class="info-value" style="color: #ffd700; font-weight: bold;">${formatCurrency(estimatedValue)}</span></div>
                        <div class="supplier-info-item"><span class="info-label">Base de Calculo:</span><span class="info-value">${guestCount} convidados ${costDescription}</span></div>
                        ` : ''}
                        <div class="supplier-info-item"><span class="info-label">Compatibilidade:</span><span class="info-value" style="color: ${getCompatibilityColor(compatibility)}; font-weight: bold;">${compatibility}%</span></div>
                        <div class="supplier-info-item"><span class="info-label">Tags:</span><span class="info-value">${tagsArray.join(', ')}</span></div>
                    </div>
                    <div class="supplier-actions" style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button class="btn" onclick="saveSuggestedSupplier('${supplierId}', '${name.replace(/'/g, "\\'")}', '${category}', '${priceRange.replace(/'/g, "\\'")}', ${rating}, ${compatibility})" style="flex: 1;">Salvar na minha lista</button>
                        <button class="btn-secondary" onclick="closeSupplierDetailsModal()" style="flex: 1;">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeSupplierDetailsModal = function() {
    const modal = document.getElementById('supplierDetailsModal');
    if (modal) modal.remove();
};

// ============================================
// FORNECEDORES SALVOS
// ============================================

window.showSavedSupplierDetails = function(savedId, name, category, priceRange, rating, compatibility) {
    const guestCount = state.guests.length;
    const categoryValue = getCategoryValueFromName(category);
    const estimatedValue = calculateSupplierValue(priceRange, guestCount, categoryValue);
    const costDescription = getEstimatedCostDescription(priceRange, guestCount, categoryValue);
    
    const modalHtml = `
        <div class="modal" id="supplierDetailsModal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <div class="suggestions-header" style="margin-bottom: 1rem;">
                    <h2 style="color: #ffd700;">Detalhes do Fornecedor</h2>
                    <button class="close-btn" onclick="closeSupplierDetailsModal()">✕</button>
                </div>
                <div class="supplier-details-content">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <div style="font-size: 3rem; margin-bottom: 0.5rem;">${getCategoryIconSimpleFromName(category)}</div>
                        <h3 style="color: #ffd700; font-size: 1.5rem;">${name}</h3>
                        <div class="supplier-rating-detail">
                            <span style="color: #ffd700;">★★★★★</span> 
                            <span style="color: #fff;">${rating}/5</span>
                        </div>
                    </div>
                    <div class="supplier-info-group">
                        <div class="supplier-info-item"><span class="info-label">Categoria:</span><span class="info-value">${getCategoryNameFull(category)}</span></div>
                        <div class="supplier-info-item"><span class="info-label">Faixa de Preco:</span><span class="info-value">${priceRange}</span></div>
                        ${guestCount > 0 && estimatedValue > 0 ? `
                        <div class="supplier-info-item"><span class="info-label">Valor Estimado:</span><span class="info-value" style="color: #ffd700; font-weight: bold;">${formatCurrency(estimatedValue)}</span></div>
                        <div class="supplier-info-item"><span class="info-label">Base de Calculo:</span><span class="info-value">${guestCount} convidados ${costDescription}</span></div>
                        ` : ''}
                        <div class="supplier-info-item"><span class="info-label">Compatibilidade:</span><span class="info-value" style="color: ${getCompatibilityColor(compatibility)}; font-weight: bold;">${compatibility}%</span></div>
                    </div>
                    <div class="supplier-actions" style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button class="btn" onclick="addSavedSupplierToEvent('${savedId}', '${name.replace(/'/g, "\\'")}', '${category}', '${priceRange.replace(/'/g, "\\'")}')" style="flex: 1; background: #10b981;">Adicionar ao Evento</button>
                        <button class="btn-secondary" onclick="closeSupplierDetailsModal()" style="flex: 1;">Fechar</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.addSavedSupplierToEvent = async function(savedId, name, category, priceRange) {
    closeSupplierDetailsModal();
    const existingSupplier = state.suppliers.find(s => s.name === name);
    if (existingSupplier) {
        showNotification('Este fornecedor ja foi adicionado ao evento!', 'error');
        return;
    }
    const guestCount = state.guests.length;
    const categoryValue = getCategoryValueFromName(category);
    let estimatedValue = calculateSupplierValue(priceRange, guestCount, categoryValue);
    if (estimatedValue === 0) {
        const numbers = priceRange.match(/\d+/g);
        if (numbers) {
            const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
            estimatedValue = Math.round(sum / numbers.length);
        }
    }
    const costDescription = getEstimatedCostDescription(priceRange, guestCount, categoryValue);
    const confirmMessage = `Fornecedor: ${name}\nCategoria: ${getCategoryNameFull(category)}\nFaixa de preco: ${priceRange}\n\nQuantidade de convidados: ${guestCount}\nValor estimado: ${formatCurrency(estimatedValue)}${costDescription}\n\nDeseja adicionar este fornecedor ao evento?`;
    if (!confirm(confirmMessage)) return;
    const supplierData = { name: name, category: categoryValue, status: 'cotado', value: estimatedValue, contact: '' };
    const result = await createSupplier(supplierData, state.selectedEvent);
    if (result.success) {
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        renderDashboard();
        showNotification(`Fornecedor "${name}" adicionado ao evento! Valor: ${formatCurrency(estimatedValue)}`, 'success');
    } else {
        showNotification('Erro ao adicionar fornecedor', 'error');
    }
};

async function loadSavedSuppliersList() {
    if (!state.selectedEvent) return;
    const savedSuppliers = await getSavedSuppliers(state.selectedEvent);
    const container = document.getElementById('savedSuppliersContainer');
    if (container) {
        if (savedSuppliers.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum fornecedor salvo. Use o botao "Sugerir Fornecedores" para recomendacoes personalizadas!</div>';
        } else {
            container.innerHTML = `
                <div class="saved-suppliers-section">
                    <h3><i class="fas fa-bookmark"></i> Meus Fornecedores Salvos</h3>
                    <div class="saved-suppliers-list">
                        ${savedSuppliers.map(s => `
                            <div class="saved-supplier-card" style="cursor: pointer;" onclick="showSavedSupplierDetails('${s.id}', '${s.name.replace(/'/g, "\\'")}', '${s.category}', '${s.price_range.replace(/'/g, "\\'")}', ${s.rating}, ${s.compatibility})">
                                <div>
                                    <strong style="color: #ffd700;">${s.name}</strong>
                                    <div style="font-size: 0.8rem; color: #888;">${getCategoryNameFull(s.category)} • ${s.price_range}</div>
                                    <div style="font-size: 0.8rem; color: #888;">Estrelas ${s.rating}/5 • ${s.compatibility}% compativel</div>
                                </div>
                                <div style="display: flex; gap: 0.5rem;">
                                    <button class="btn-small" onclick="event.stopPropagation(); addSavedSupplierToEvent('${s.id}', '${s.name.replace(/'/g, "\\'")}', '${s.category}', '${s.price_range.replace(/'/g, "\\'")}')" style="background: #10b981; color: white;">Adicionar</button>
                                    <button class="btn-small" onclick="event.stopPropagation(); removeSavedSupplier('${s.id}')" style="background: #e11d48; color: white;">Remover</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }
}

window.removeSavedSupplier = async function(savedId) {
    if (confirm('Remover este fornecedor da sua lista?')) {
        await deleteSavedSupplier(savedId);
        await loadSavedSuppliersList();
        showNotification('Fornecedor removido!', 'success');
    }
};

// ============================================
// FUNCOES AUXILIARES
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
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem 1.5rem';
    notification.style.borderRadius = '50px';
    notification.style.backgroundColor = type === 'success' ? '#10b981' : '#e11d48';
    notification.style.color = 'white';
    notification.style.zIndex = '2000';
    notification.style.fontSize = '0.85rem';
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
    return (state.tasks.filter(t => t.completed).length / state.tasks.length) * 100;
}

async function loadEventData(id) {
    state.guests = await getEventGuests(id);
    state.suppliers = await getEventSuppliers(id);
    await ensureEventHasTasks(id);
    state.tasks = await getUserTasks(state.user.id, id);
    await loadSavedSuppliersList();
}

// ============================================
// GRAFICOS
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
}

// ============================================
// RENDERIZACAO DO PERFIL
// ============================================

function renderPerfil() {
    const profile = state.user?.profile || {};
    const photoUrl = profile.photo || state.user?.photoURL || '';
    let memberSince = 'Data nao disponivel';
    if (state.user?.createdAt) {
        const date = new Date(state.user.createdAt);
        memberSince = date.toLocaleDateString('pt-BR');
    }
    return `
        <div class="profile-section">
            <div class="profile-header">
                <div class="profile-avatar">
                    <div class="profile-avatar-large" id="profileAvatar">${photoUrl ? `<img src="${photoUrl}">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}</div>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                    <button class="btn-secondary" id="changePhotoBtn">Alterar Foto</button>
                </div>
                <div class="profile-info">
                    <h2>${escapeHtml(profile.fullName || state.user?.username || 'Usuario')}</h2>
                    <p>${state.user?.email || ''}</p>
                    <p>Membro desde ${memberSince}</p>
                </div>
            </div>
            <form id="profileForm">
                <div class="profile-form-grid">
                    <div class="form-group"><label>Nome Completo</label><input type="text" name="fullName" value="${escapeHtml(profile.fullName || '')}"></div>
                    <div class="form-group"><label>CPF</label><input type="text" name="cpf" value="${escapeHtml(profile.cpf || '')}" maxlength="14"></div>
                    <div class="form-group"><label>Data de Nascimento</label><input type="date" name="birthDate" value="${profile.birthDate || ''}"></div>
                    <div class="form-group"><label>Telefone</label><input type="tel" name="phone" value="${escapeHtml(profile.phone || '')}"></div>
                    <div class="form-group" style="grid-column: span 2;"><label>Endereco</label><input type="text" name="address" value="${escapeHtml(profile.address || '')}"></div>
                    <div class="form-group"><label>Email</label><input type="email" value="${state.user?.email || ''}" disabled></div>
                </div>
                <button type="submit" class="btn">Salvar Alteracoes</button>
            </form>
        </div>
    `;
}

// ============================================
// RENDERIZACAO DO CHECKLIST
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
    const categoryOrder = ['12 meses', '9 meses', '6 meses', '3 meses', '1 mes', '1 semana', 'Dia do Casamento'];
    const progress = getProgressoChecklist();
    
    return `
        <div class="checklist-section">
            <div class="checklist-header">
                <h2>Checklist do Casamento</h2>
                <div class="checklist-filters">
                    <button class="filter-btn ${state.taskFilter === 'all' ? 'active' : ''}" onclick="setTaskFilter('all')">Todas</button>
                    <button class="filter-btn ${state.taskFilter === 'pending' ? 'active' : ''}" onclick="setTaskFilter('pending')">Pendentes</button>
                    <button class="filter-btn ${state.taskFilter === 'completed' ? 'active' : ''}" onclick="setTaskFilter('completed')">Concluidas</button>
                    <button class="btn" onclick="openTaskModal()">Nova Tarefa</button>
                </div>
            </div>
            <div class="progress-section">
                <h3>Progresso: ${progress.toFixed(0)}% concluido</h3>
                <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
            </div>
            ${categoryOrder.map(cat => {
                const tasks = categories[cat] || [];
                if (tasks.length === 0) return '';
                const concluidas = tasks.filter(t => t.completed).length;
                return `<div class="checklist-category">
                    <div class="category-title"><span>${cat}</span><span>${concluidas}/${tasks.length} concluidas</span></div>
                    ${tasks.map(task => `<div class="task-item">
                        <input type="checkbox" class="task-check" ${task.completed ? 'checked' : ''} onchange="toggleTaskComplete('${task.id}')">
                        <div class="task-content">
                            <div class="task-name">${task.name}<span class="task-priority priority-${task.priority}">${task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Media' : 'Baixa'}</span></div>
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

// ============================================
// RENDERIZACAO DO CALENDARIO
// ============================================

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
    const monthNames = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `
        <div class="calendar-section">
            <div class="calendar-header">
                <h3>${monthNames[state.calendarMonth]} ${state.calendarYear}</h3>
                <div><button class="btn-secondary" onclick="mudarMes(-1)">◀ Anterior</button><button class="btn-secondary" onclick="mudarMes(1)">Proximo ▶</button></div>
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
    } else {
        showNotification('Nenhum evento nesta data', 'error');
    }
};

// ============================================
// RENDERIZACAO SOBRE NOS
// ============================================

function renderAbout() {
    return `
        <div class="about-section">
            <div class="about-header-horizontal">
                <div class="about-logo-horizontal">
                    <img src="assets/LOGO3.png" class="about-logo-img-horizontal" onerror="this.src='https://placehold.co/200x200?text=LA+VIE'">
                </div>
                <div class="about-text-horizontal">
                    <h1 class="about-logo-title">LA VIE</h1>
                    <div class="about-logo-subtitle">CASAMENTOS</div>
                    <p class="about-tagline">Realizando sonhos com tecnologia e inovação</p>
                </div>
            </div>
            
            <div class="about-badge">
                <span class="academic-badge">FEITO PARA TRABALHO ACADÊMICO</span>
            </div>
                <div class="about-card">
                    <h2><i class="fas fa-bullseye"></i> Missão</h2>
                    <p>Oferecer uma plataforma completa e intuitiva que permita aos casais planejarem seu casamento com tranquilidade, economia e organização, conectando tecnologia e emoção em cada detalhe.</p>
                </div>

                <div class="about-card">
                    <h2><i class="fas fa-eye"></i> Visão</h2>
                    <p>Ser referência acadêmica e profissional em plataformas de planejamento de casamentos, reconhecida pela inovação tecnológica, confiabilidade e por transformar sonhos em realidade.</p>
                </div>

                <div class="about-card">
                    <h2><i class="fas fa-gem"></i> Valores</h2>
                    <ul class="about-values">
                        <li>Inovação tecnológica</li>
                        <li>Compromisso com a excelência</li>
                        <li>Transparência e confiança</li>
                        <li>Empatia com os sonhos dos casais</li>
                        <li>Aprendizado contínuo</li>
                    </ul>
                </div>
            </div>

            <div class="about-footer">
                <p>&copy; 2026 La Vie Casamentos - Trabalho Acadêmico</p>
                <p>Desenvolvido por estudantes de Análise e Desenvolvimento de Sistemas</p>
                <p class="academic-note">Transformando sonhos em realidade</p>
            </div>
        </div>
    `;
}

// ============================================
// FUNCOES DE TEMAS
// ============================================

function toggleThemeMenu() {
    const menu = document.getElementById('themeMenu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function applyTheme(theme) {
    document.body.classList.remove('theme-rose', 'theme-blue', 'theme-green', 'theme-purple', 'theme-dark');
    if (theme !== 'gold') document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('selectedTheme', theme);
    const menu = document.getElementById('themeMenu');
    if (menu) menu.style.display = 'none';
}

function loadSavedTheme() {
    const savedTheme = localStorage.getItem('selectedTheme');
    if (savedTheme && savedTheme !== 'gold') document.body.classList.add(`theme-${savedTheme}`);
}

window.toggleThemeMenu = toggleThemeMenu;
window.applyTheme = applyTheme;

// ============================================
// RENDERIZACAO DO DASHBOARD
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
    
    // Criar botão de temas se não existir
    if (!document.querySelector('.theme-toggle-btn')) {
        const themeBtn = document.createElement('div');
        themeBtn.className = 'theme-toggle-btn';
        themeBtn.innerHTML = '<span class="theme-icon">🎨</span>';
        themeBtn.style.position = 'fixed';
        themeBtn.style.left = '20px';
        themeBtn.style.bottom = '20px';
        themeBtn.style.cursor = 'grab';
        themeBtn.style.zIndex = '1000';
        document.body.appendChild(themeBtn);
        
        loadThemeButtonPosition();
        themeBtn.onclick = (e) => {
            if (!e.defaultPrevented) {
                toggleThemeMenu();
            }
        };
        makeThemeButtonDraggable();
    }
    
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
                <button class="tab ${state.activeTab === 'about' ? 'active' : ''}" onclick="setActiveTab('about')">Sobre Nós</button>
            </div>
            <div class="user-info">
                <button class="btn-calendar" onclick="setActiveTab('calendar')" style="background: rgba(255,215,0,0.15); border: 1px solid rgba(255,215,0,0.3); padding: 0.4rem 1rem; border-radius: 50px; cursor: pointer; color: #ffd700; margin-right: 0.5rem; transition: all 0.3s;">
                    📅 Calendário
                </button>
                <div class="profile-pic" onclick="setActiveTab('profile')">
                    ${photoUrl ? `<img src="${photoUrl}" alt="Perfil">` : `<span>${state.user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>`}
                </div>
                <span onclick="setActiveTab('profile')" style="cursor: pointer;">${state.user?.username}</span>
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
                        <div class="budget-card used"><h3>Utilizado</h3><div class="budget-value">${formatCurrency(totalGasto)}</div><small>${percentual.toFixed(1)}% do total</small></div>
                        <div class="budget-card available"><h3>Disponível</h3><div class="budget-value">${formatCurrency(orcamentoTotal - totalGasto)}</div><small>${(100 - percentual).toFixed(1)}% restante</small></div>
                    </div>
                    <div class="progress-section">
                        <h3>Progresso do Orçamento: ${percentual.toFixed(1)}%</h3><div class="progress-bar"><div class="progress-fill" style="width: ${percentual}%"></div></div>
                        <h3>Checklist: ${progressoChecklist.toFixed(0)}%</h3><div class="progress-bar"><div class="progress-fill" style="width: ${progressoChecklist}%"></div></div>
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
                ${state.events.length === 0 ? '<div class="empty-state">Nenhum evento. Crie seu primeiro evento!</div>' : `<div class="events-grid">${state.events.map(event => {
                    const gastosEvento = state.suppliers.filter(s => s.event_id === event.id).reduce((s, i) => s + (i.value || 0), 0);
                    const perc = event.budget_total ? (gastosEvento / event.budget_total) * 100 : 0;
                    return `<div class="event-card ${state.selectedEvent === event.id ? 'selected' : ''}" onclick="selectEvent('${event.id}')">
                        <div class="event-card-header"><h4>${event.name || event.couple_names || 'Evento'}</h4></div>
                        <div class="event-card-body">
                            <p><strong>Tipo:</strong> ${event.event_type || 'Tipo'}</p>
                            <p><strong>Orcamento:</strong> ${formatCurrency(event.budget_total)}</p>
                            <p><strong>Gasto:</strong> ${formatCurrency(gastosEvento)} (${perc.toFixed(0)}%)</p>
                            <p><strong>Data:</strong> ${formatDate(event.event_date)}</p>
                        </div>
                        <div><button class="btn-secondary" onclick="event.stopPropagation(); editEvent('${event.id}')">Editar</button><button class="btn-secondary" onclick="event.stopPropagation(); deleteEventConfirm('${event.id}')">Excluir</button></div>
                    </div>`;
                }).join('')}</div>`}
                ${state.selectedEvent && currentEvent ? `
                    <div>
                        <div class="section-header"><h2>Gerenciando: ${currentEvent.name || currentEvent.couple_names || 'Evento'}</h2><button class="btn-secondary" onclick="selectEvent(null)">Trocar Evento</button></div>
                        <div class="section-header"><h2>Convidados</h2><div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn" onclick="openGuestModal()">Adicionar</button>
                            <button class="btn-secondary" onclick="importGuestsFile()">Importar Arquivo</button>
                            <button class="btn-secondary" onclick="downloadGuestTemplate()">Baixar Modelo</button>
                            <button class="btn-secondary" onclick="exportGuestsToExcel()">Exportar Excel</button>
                            <button class="btn-secondary" onclick="sendMassWhatsAppInvite()" style="background: #25D366; color: white; border-color: #25D366;">Enviar Convites</button>
                        </div></div>
                        <div class="guest-list">${state.guests.map(g => `
                            <div class="guest-card">
                                <div>
                                    <strong>${g.name}</strong>
                                    <div style="font-size: 0.7rem; color: #888;">${g.status === 'confirmado' ? 'Confirmado' : g.status === 'recusado' ? 'Recusado' : 'Pendente'}${g.table_name ? ` • Mesa ${g.table_name}` : ''}</div>
                                    ${g.phone ? `<div style="font-size: 0.7rem; color: #888;">📱 ${g.phone}</div>` : ''}
                                </div>
                                <div style="display: flex; gap: 0.5rem;">
                                    ${g.phone && g.status === 'pendente' ? `<button class="btn-small" onclick="sendWhatsAppInvite('${g.id}', '${g.name.replace(/'/g, "\\'")}', '${g.phone}')" style="background: #25D366; color: white;">WhatsApp</button>` : ''}
                                    <button class="btn-small" onclick="editGuest('${g.id}')">Editar</button>
                                    <button class="btn-small" onclick="deleteGuestConfirm('${g.id}')">Excluir</button>
                                </div>
                            </div>
                        `).join('')}${state.guests.length === 0 ? '<div class="empty-state">Nenhum convidado</div>' : ''}</div>
                        <div class="section-header"><h2>Fornecedores</h2><div><button class="btn" onclick="openSupplierModal()">Adicionar</button><button class="btn-secondary" onclick="showSupplierSuggestions()" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">Sugerir Fornecedores</button><button class="btn-secondary" onclick="exportSuppliersToExcel()">Exportar Excel</button></div></div>
                        <div class="supplier-list">${state.suppliers.map(s => `<div class="supplier-card"><div><strong>${s.name}</strong><div>${s.category} • ${formatCurrency(s.value)}<br>${s.status === 'contratado' ? 'Contratado' : s.status === 'negociacao' ? 'Negociacao' : 'Cotado'}</div></div><div><button class="btn-small" onclick="editSupplier('${s.id}')">Editar</button><button class="btn-small" onclick="deleteSupplierConfirm('${s.id}')">Excluir</button></div></div>`).join('')}${state.suppliers.length === 0 ? '<div class="empty-state">Nenhum fornecedor</div>' : ''}</div>
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
    if (state.selectedEvent) await loadSavedSuppliersList();
}

// ============================================
// FORMULARIOS E HANDLERS
// ============================================

function renderEventForm() {
    const event = state.editingEvent;
    return `<div class="modal" id="eventModal"><div class="modal-content"><h2>${event ? 'Editar Evento' : 'Novo Evento'}</h2>
        <form id="eventForm"><div class="form-group"><label>Nome do Evento</label><input type="text" name="name" value="${event?.name || ''}"></div>
        <div class="form-group"><label>Nomes dos Noivos</label><input type="text" name="couple_names" value="${event?.couple_names || ''}"></div>
        <div class="form-group"><label>Tipo</label><select name="event_type"><option>Casamento</option><option>Corporativo</option><option>Aniversario</option><option>Festa</option></select></div>
        <div class="form-group"><label>Tema</label><select name="theme"><option>Classico</option><option>Moderno</option><option>Rustico</option><option>Luxo</option></select></div>
        <div class="form-group"><label>Orcamento (R$)</label><input type="number" name="budget_total" value="${event?.budget_total || ''}"></div>
        <div class="form-group"><label>Data do Evento</label><input type="date" name="event_date" value="${event?.event_date || ''}"></div>
        <div class="form-group"><label>Local</label><input type="text" name="venue" value="${event?.venue || ''}"></div>
        <div><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeEventModal()">Cancelar</button></div></form></div></div>`;
}

function renderGuestForm() {
    const guest = state.editingGuest;
    return `<div class="modal" id="guestModal"><div class="modal-content"><h2>${guest ? 'Editar Convidado' : 'Novo Convidado'}</h2>
        <form id="guestForm"><div class="form-group"><label>Nome</label><input type="text" name="name" value="${guest?.name || ''}" required></div>
        <div class="form-group"><label>Grupo</label><input type="text" name="group_name" value="${guest?.group_name || ''}"></div>
        <div class="form-group"><label>Status</label><select name="status"><option>pendente</option><option>confirmado</option><option>recusado</option></select></div>
        <div class="form-group"><label>Mesa</label><input type="text" name="table_name" value="${guest?.table_name || ''}"></div>
        <div class="form-group"><label>Telefone</label><input type="text" name="phone" value="${guest?.phone || ''}"></div>
        <div><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeGuestModal()">Cancelar</button></div></form></div></div>`;
}

function renderSupplierForm() {
    const supplier = state.editingSupplier;
    return `<div class="modal" id="supplierModal"><div class="modal-content"><h2>${supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
        <form id="supplierForm"><div class="form-group"><label>Nome</label><input type="text" name="name" value="${supplier?.name || ''}" required></div>
        <div class="form-group"><label>Categoria</label><select name="category"><option>Buffet</option><option>Fotografia</option><option>Musica</option><option>Decoracao</option><option>Espaco</option><option>Vestuario</option><option>Outro</option></select></div>
        <div class="form-group"><label>Status</label><select name="status"><option>cotado</option><option>negociacao</option><option>contratado</option></select></div>
        <div class="form-group"><label>Valor</label><input type="number" name="value" value="${supplier?.value || 0}"></div>
        <div class="form-group"><label>Contato</label><input type="text" name="contact" value="${supplier?.contact || ''}"></div>
        <div><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeSupplierModal()">Cancelar</button></div></form></div></div>`;
}

function renderTaskForm() {
    const task = state.editingTask;
    return `<div class="modal" id="taskModal"><div class="modal-content"><h2>${task ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
        <form id="taskForm"><div class="form-group"><label>Nome</label><input type="text" name="name" value="${task?.name || ''}" required></div>
        <div class="form-group"><label>Categoria</label><select name="category"><option>12 meses</option><option>9 meses</option><option>6 meses</option><option>3 meses</option><option>1 mes</option><option>1 semana</option><option>Dia do Casamento</option></select></div>
        <div class="form-group"><label>Prioridade</label><select name="priority"><option>baixa</option><option>media</option><option>alta</option></select></div>
        <div class="form-group"><label>Data Limite</label><input type="date" name="due_date" value="${task?.due_date || ''}"></div>
        <div><button type="submit" class="btn">Salvar</button><button type="button" class="btn-secondary" onclick="closeTaskModal()">Cancelar</button></div></form></div></div>`;
}

function attachFormEvents() {
    document.getElementById('eventForm')?.addEventListener('submit', handleEventSubmit);
    document.getElementById('guestForm')?.addEventListener('submit', handleGuestSubmit);
    document.getElementById('supplierForm')?.addEventListener('submit', handleSupplierSubmit);
    document.getElementById('taskForm')?.addEventListener('submit', handleTaskSubmit);
    document.getElementById('profileForm')?.addEventListener('submit', handleProfileSubmit);
    document.getElementById('changePhotoBtn')?.addEventListener('click', () => document.getElementById('photoUpload')?.click());
    document.getElementById('photoUpload')?.addEventListener('change', handlePhotoUpload);
}

async function handleEventSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.budget_total = parseFloat(data.budget_total || 0);
    const result = state.editingEvent ? await updateEvent(state.editingEvent.id, data) : await createEvent(data, state.user.id);
    if (result.success) {
        state.events = await getUserEvents(state.user.id);
        closeEventModal();
        showNotification('Evento salvo!', 'success');
        renderDashboard();
    } else showNotification('Erro ao salvar evento', 'error');
}

async function handleGuestSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    const result = state.editingGuest ? await updateGuest(state.editingGuest.id, data) : await createGuest(data, state.selectedEvent);
    if (result.success) {
        state.guests = await getEventGuests(state.selectedEvent);
        closeGuestModal();
        showNotification('Convidado salvo!', 'success');
        renderDashboard();
    } else showNotification('Erro ao salvar convidado', 'error');
}

async function handleSupplierSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.event_id = state.selectedEvent;
    data.value = parseFloat(data.value || 0);
    const result = state.editingSupplier ? await updateSupplier(state.editingSupplier.id, data) : await createSupplier(data, state.selectedEvent);
    if (result.success) {
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        closeSupplierModal();
        showNotification('Fornecedor salvo!', 'success');
        renderDashboard();
    } else showNotification('Erro ao salvar fornecedor', 'error');
}

async function handleTaskSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const result = state.editingTask ? await updateTask(state.editingTask.id, data) : await createTask(data, state.user.id, state.selectedEvent || null);
    if (result.success) {
        state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id);
        closeTaskModal();
        showNotification('Tarefa salva!', 'success');
        renderDashboard();
    } else showNotification('Erro ao salvar tarefa', 'error');
}

async function handleProfileSubmit(e) {
    e.preventDefault();
    const profileData = Object.fromEntries(new FormData(e.target));
    const userData = await getUserProfile(state.user.id);
    const currentPhoto = state.user.profile?.photo || userData?.profile?.photo || null;
    const result = await updateUserProfile(state.user.id, { ...profileData, photo: currentPhoto });
    if (result.success) {
        state.user.profile = (await getUserProfile(state.user.id))?.profile || {};
        showNotification('Perfil atualizado!', 'success');
        renderDashboard();
    } else showNotification('Erro ao atualizar perfil', 'error');
}

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const userData = await getUserProfile(state.user.id);
            const currentProfile = userData?.profile || {};
            const result = await updateUserProfile(state.user.id, { ...currentProfile, photo: event.target.result });
            if (result.success) {
                state.user.profile = (await getUserProfile(state.user.id))?.profile || {};
                showNotification('Foto atualizada!', 'success');
                renderDashboard();
            } else showNotification('Erro ao atualizar foto', 'error');
        };
        reader.readAsDataURL(file);
    }
}

// ============================================
// FUNCOES DE AUTENTICACAO
// ============================================

function renderAuth() {
    const isLogin = state.authMode === 'login';
    document.getElementById('app').innerHTML = `
        <div class="auth-container"><div class="auth-box"><div class="auth-logo"><h1>LA VIE</h1><div class="subtitle">CASAMENTOS</div><div class="tagline">Seu sonho feito por especialistas</div></div>
        <div class="auth-card"><div class="auth-tabs"><button class="auth-tab ${isLogin ? 'active' : ''}" onclick="setAuthMode('login')">Login</button><button class="auth-tab ${!isLogin ? 'active' : ''}" onclick="setAuthMode('register')">Cadastrar</button></div>
        <div id="authMessage" class="error-message" style="display:none"></div>
        ${isLogin ? `
            <button id="googleLoginBtn" class="auth-btn google-btn"><svg style="width:20px;height:20px;margin-right:10px;" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Entrar com Google</button>
            <div class="divider"><span>ou</span></div>
            <form id="loginForm"><div class="form-group"><label>EMAIL</label><input type="email" id="loginEmail" required></div><div class="form-group"><label>SENHA</label><input type="password" id="loginPassword" required></div><button type="submit" class="auth-btn">ENTRAR</button>
            <div><a onclick="forgotPassword()">Esqueceu sua senha?</a> | <a onclick="resendVerification()">Reenviar verificacao</a></div></form>
        ` : `
            <form id="registerForm"><div class="form-group"><label>USUARIO</label><input type="text" id="regUsername" required></div><div class="form-group"><label>EMAIL</label><input type="email" id="regEmail" required></div><div class="form-group"><label>SENHA</label><input type="password" id="regPassword" required></div><div class="form-group"><label>CONFIRMAR</label><input type="password" id="regConfirmPassword" required></div><button type="submit" class="auth-btn">CADASTRAR</button></form>
        `}
        </div></div></div>
    `;
    
    if (isLogin) {
        document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
            const result = await loginWithGoogle();
            if (result.success) await loadUserData(result.user);
            else document.getElementById('authMessage').innerHTML = result.error;
        });
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const result = await loginWithEmail(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            if (result.success) await loadUserData(result.user);
            else document.getElementById('authMessage').innerHTML = result.error === 'email-not-verified' ? `${result.message}<br><a onclick="resendVerification()">Reenviar verificacao</a>` : result.error;
        });
    } else {
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;
            if (pwd !== confirm) return document.getElementById('authMessage').innerHTML = 'Senhas nao coincidem!';
            if (pwd.length < 6) return document.getElementById('authMessage').innerHTML = 'Minimo 6 caracteres!';
            const result = await registerWithEmail(document.getElementById('regEmail').value, pwd, document.getElementById('regUsername').value);
            if (result.success) {
                document.getElementById('authMessage').innerHTML = `${result.message}<br>Verifique seu email!`;
                setTimeout(() => setAuthMode('login'), 4000);
            } else document.getElementById('authMessage').innerHTML = result.error;
        });
    }
}

async function checkAuthState() {
    onAuthChange(async (user) => {
        if (user) {
            state.user = user;
            state.events = await getUserEvents(state.user.id);
            state.tasks = await getUserTasks(state.user.id);
            renderDashboard();
        } else renderAuth();
    });
}

async function loadUserData(user) {
    state.user = user;
    state.events = await getUserEvents(state.user.id);
    if (state.selectedEvent) {
        state.guests = await getEventGuests(state.selectedEvent);
        state.suppliers = await getEventSuppliers(state.selectedEvent);
        state.tasks = await getUserTasks(state.user.id, state.selectedEvent);
        await loadSavedSuppliersList();
    } else state.tasks = await getUserTasks(state.user.id);
    renderDashboard();
}

window.completeTask = async (id) => {
    await toggleTaskComplete(id);
    state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id);
    renderDashboard();
};

async function logout() {
    await logoutUser();
    state.user = null;
    state.events = [];
    state.selectedEvent = null;
    state.guests = [];
    state.suppliers = [];
    state.tasks = [];
    state.savedSuppliers = [];
    Object.values(state.charts).forEach(c => c?.destroy());
    renderAuth();
}

window.setAuthMode = (m) => { state.authMode = m; renderAuth(); };
window.setActiveTab = (tab) => { state.activeTab = tab; renderDashboard(); };
window.setTaskFilter = (filter) => { state.taskFilter = filter; renderDashboard(); };
window.selectEvent = async (id) => { state.selectedEvent = id; if (id) await loadEventData(id); await loadSavedSuppliersList(); renderDashboard(); };
window.mudarMes = (d) => { const nd = new Date(state.calendarYear, state.calendarMonth + d, 1); state.calendarYear = nd.getFullYear(); state.calendarMonth = nd.getMonth(); renderDashboard(); };
window.toggleTaskComplete = async (id) => { await toggleTaskComplete(id); state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id); renderDashboard(); };
window.openEventModal = () => { state.editingEvent = null; state.showEventForm = true; renderDashboard(); };
window.editEvent = (id) => { state.editingEvent = state.events.find(e => e.id === id); state.showEventForm = true; renderDashboard(); };
window.closeEventModal = () => { state.showEventForm = false; state.editingEvent = null; renderDashboard(); };
window.deleteEventConfirm = async (id) => { if (confirm('Excluir evento?')) { await deleteEvent(id); state.events = await getUserEvents(state.user.id); if (state.selectedEvent === id) state.selectedEvent = null; renderDashboard(); } };
window.openGuestModal = () => { if (!state.selectedEvent) return alert('Selecione um evento primeiro!'); state.editingGuest = null; state.showGuestForm = true; renderDashboard(); };
window.editGuest = (id) => { state.editingGuest = state.guests.find(g => g.id === id); state.showGuestForm = true; renderDashboard(); };
window.closeGuestModal = () => { state.showGuestForm = false; state.editingGuest = null; renderDashboard(); };
window.deleteGuestConfirm = async (id) => { if (confirm('Excluir convidado?')) { await deleteGuest(id); state.guests = await getEventGuests(state.selectedEvent); renderDashboard(); } };
window.openSupplierModal = () => { if (!state.selectedEvent) return alert('Selecione um evento primeiro!'); state.editingSupplier = null; state.showSupplierForm = true; renderDashboard(); };
window.editSupplier = (id) => { state.editingSupplier = state.suppliers.find(s => s.id === id); state.showSupplierForm = true; renderDashboard(); };
window.closeSupplierModal = () => { state.showSupplierForm = false; state.editingSupplier = null; renderDashboard(); };
window.deleteSupplierConfirm = async (id) => { if (confirm('Excluir fornecedor?')) { await deleteSupplier(id); state.suppliers = await getEventSuppliers(state.selectedEvent); renderDashboard(); } };
window.openTaskModal = () => { state.editingTask = null; state.showTaskForm = true; renderDashboard(); };
window.editTask = (id) => { state.editingTask = state.tasks.find(t => t.id === id); state.showTaskForm = true; renderDashboard(); };
window.closeTaskModal = () => { state.showTaskForm = false; state.editingTask = null; renderDashboard(); };
window.deleteTaskConfirm = async (id) => { if (confirm('Excluir tarefa?')) { await deleteTask(id); state.tasks = state.selectedEvent ? await getUserTasks(state.user.id, state.selectedEvent) : await getUserTasks(state.user.id); renderDashboard(); } };
window.logout = logout;

loadSavedTheme();
checkAuthState();