// ============================================
// LOGOUT FIX - ARQUIVO DE EMERGÊNCIA
// ============================================

(function() {
    console.log("🟠 Logout Fix carregado!");
    
    // Função de logout forçado
    window.forceLogout = function() {
        console.log("🚨 Logout forçado ativado!");
        
        try {
            // Limpar localStorage
            localStorage.removeItem('lastBackup');
            localStorage.removeItem('demoLoaded');
            localStorage.removeItem('restorePending');
            localStorage.removeItem('selectedTheme');
            
            // Limpar sessionStorage
            sessionStorage.clear();
            
            // Tentar acessar o auth do Firebase se disponível
            if (typeof firebase !== 'undefined' && firebase.auth) {
                firebase.auth().signOut().catch(() => {});
            }
            
            // Recarregar a página
            window.location.href = '/';
            window.location.reload(true);
        } catch(e) {
            console.error("Erro no logout forçado:", e);
            window.location.reload(true);
        }
    };
    
    // Função de logout normal
    window.safeLogout = async function() {
        console.log("🔴 Logout seguro iniciado...");
        
        try {
            // Tentar importar do módulo principal
            if (typeof logoutUser === 'function') {
                await logoutUser();
            } else if (typeof auth !== 'undefined' && auth.signOut) {
                await auth.signOut();
            }
            
            // Limpar dados
            localStorage.removeItem('lastBackup');
            sessionStorage.clear();
            
            // Recarregar
            window.location.reload();
        } catch(e) {
            console.error("Erro no logout seguro:", e);
            window.forceLogout();
        }
    };
    
    // Corrigir os botões de logout existentes
    function fixLogoutButtons() {
        const buttons = document.querySelectorAll('.btn-logout');
        console.log(`🟠 Encontrados ${buttons.length} botões de logout`);
        
        buttons.forEach(btn => {
            // Remover event listeners antigos
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Adicionar novo evento
            newBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                console.log("🟠 Botão Sair clicado!");
                window.safeLogout();
            });
        });
    }
    
    // Executar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixLogoutButtons);
    } else {
        fixLogoutButtons();
    }
    
    // Observar mudanças no DOM para novos botões
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                fixLogoutButtons();
            }
        });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    console.log("🟠 Logout Fix inicializado - Use forceLogout() se necessário");
})();