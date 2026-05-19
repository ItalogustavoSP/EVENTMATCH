import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    sendEmailVerification,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, doc, setDoc, getDoc, getDocs, 
    query, where, updateDoc, deleteDoc, addDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyCTg35X3QhCeQCXZR_mfvdHufzyJycDAhg",
    authDomain: "la-vie-casamentos.firebaseapp.com",
    projectId: "la-vie-casamentos",
    storageBucket: "la-vie-casamentos.firebasestorage.app",
    messagingSenderId: "44479756816",
    appId: "1:44479756816:web:1fd88c199f3e782baae895",
    measurementId: "G-C9RTVWLY0V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Persistência offline desabilitada (evita avisos no console)
// enableIndexedDbPersistence foi removido

setPersistence(auth, browserLocalPersistence)
    .then(() => console.log("🔐 Persistência de autenticação ativada"))
    .catch((error) => console.error("Erro ao ativar persistencia:", error));

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// ============================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================

export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (!userDoc.exists()) {
            await setDoc(doc(db, "users", user.uid), {
                username: user.displayName || user.email.split("@")[0],
                email: user.email,
                photoURL: user.photoURL,
                emailVerified: true,
                is_admin: false,
                createdAt: new Date().toISOString(),
                profile: {
                    fullName: user.displayName || "",
                    cpf: "",
                    birthDate: "",
                    address: "",
                    phone: "",
                    photo: user.photoURL || null
                }
            });
        }
        
        const userData = userDoc.exists() ? userDoc.data() : await (await getDoc(doc(db, "users", user.uid))).data();
        
        return { 
            success: true, 
            user: {
                id: user.uid,
                username: userData?.username || user.displayName || user.email.split("@")[0],
                email: user.email,
                photoURL: user.photoURL,
                emailVerified: true,
                is_admin: userData?.is_admin || false,
                createdAt: userData?.createdAt || new Date().toISOString(),
                profile: userData?.profile || {}
            }
        };
    } catch (error) {
        console.error("Erro login Google:", error);
        return { success: false, error: error.message };
    }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await userCredential.user.reload();
        
        if (!userCredential.user.emailVerified) {
            await signOut(auth);
            return { success: false, error: "email-not-verified", message: "Verifique seu email antes de fazer login." };
        }
        
        const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
        const userData = userDoc.data();
        
        return { 
            success: true, 
            user: {
                id: userCredential.user.uid,
                username: userData?.username || email.split("@")[0],
                email: userCredential.user.email,
                emailVerified: true,
                is_admin: userData?.is_admin || false,
                createdAt: userData?.createdAt || new Date().toISOString(),
                profile: userData?.profile || {}
            }
        };
    } catch (error) {
        let errorMessage = "Erro no login";
        if (error.code === "auth/user-not-found") errorMessage = "Usuário não encontrado";
        if (error.code === "auth/wrong-password") errorMessage = "Senha incorreta";
        if (error.code === "auth/too-many-requests") errorMessage = "Muitas tentativas. Tente mais tarde";
        return { success: false, error: errorMessage };
    }
}

export async function registerWithEmail(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        await setDoc(doc(db, "users", userCredential.user.uid), {
            username: username,
            email: email,
            photoURL: null,
            emailVerified: false,
            is_admin: username === "admin",
            createdAt: new Date().toISOString(),
            profile: { fullName: "", cpf: "", birthDate: "", address: "", phone: "", photo: null }
        });
        await signOut(auth);
        return { success: true, message: "Email de verificação enviado!" };
    } catch (error) {
        let errorMessage = "Erro no cadastro";
        if (error.code === "auth/email-already-in-use") errorMessage = "Email já cadastrado";
        if (error.code === "auth/weak-password") errorMessage = "Senha muito fraca (mínimo 6 caracteres)";
        return { success: false, error: errorMessage };
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
        console.log("✅ Logout realizado com sucesso");
        return { success: true };
    } catch (error) {
        console.error("Erro no logout:", error);
        return { success: false, error: error.message };
    }
}

export async function sendPasswordResetEmailFunction(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.code };
    }
}

export async function sendVerificationEmail() {
    try {
        const user = auth.currentUser;
        if (user) {
            await sendEmailVerification(user);
            return { success: true };
        }
        return { success: false };
    } catch (error) {
        return { success: false };
    }
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        console.log("🟢 onAuthStateChanged disparado:", user ? "Usuário logado" : "Usuário deslogado");
        
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const userData = userDoc.data();
                callback({
                    id: user.uid,
                    username: userData?.username || user.displayName || user.email.split("@")[0],
                    email: user.email,
                    photoURL: user.photoURL,
                    emailVerified: user.emailVerified,
                    is_admin: userData?.is_admin || false,
                    createdAt: userData?.createdAt || new Date().toISOString(),
                    profile: userData?.profile || {}
                });
            } catch (error) {
                console.error("Erro ao carregar dados do usuário:", error);
                callback(null);
            }
        } else {
            callback(null);
        }
    });
}

// ============================================
// O RESTO DO SEU CÓDIGO CONTINUA IGUAL...
// (mantenha todo o resto do firebase-config.js igual)
// ============================================

// ============================================
// REPOSITORIO DE FORNECEDORES (IA)
// ============================================

export const SUPPLIERS_DB = {
    buffet: [
        { id: "buf1", name: "Buffet Gourmet & Cia", category: "buffet", priceRange: "R$ 80-120 por pessoa", rating: 4.8, tags: ["classico", "gourmet", "tradicional"], availability: 95, icon: "🍽️" },
        { id: "buf2", name: "Sabor & Arte Buffet", category: "buffet", priceRange: "R$ 60-90 por pessoa", rating: 4.5, tags: ["rustico", "campestre", "natural"], availability: 85, icon: "🍽️" },
        { id: "buf3", name: "Delicias do Chef", category: "buffet", priceRange: "R$ 100-150 por pessoa", rating: 4.9, tags: ["luxo", "moderno", "internacional"], availability: 70, icon: "🍽️" },
        { id: "buf4", name: "Buffet Colonial", category: "buffet", priceRange: "R$ 50-80 por pessoa", rating: 4.3, tags: ["tradicional", "caseiro", "familiar"], availability: 98, icon: "🍽️" },
        { id: "buf5", name: "Chef no Evento", category: "buffet", priceRange: "R$ 90-130 por pessoa", rating: 4.7, tags: ["contemporaneo", "fusion", "criativo"], availability: 88, icon: "🍽️" }
    ],
    fotografia: [
        { id: "fot1", name: "Fotografia Memorias Eternas", category: "fotografia", priceRange: "R$ 3.000 - 5.000", rating: 4.9, tags: ["classico", "romantico", "ensaio"], availability: 80, icon: "📷" },
        { id: "fot2", name: "Click & Love Estudio", category: "fotografia", priceRange: "R$ 4.000 - 7.000", rating: 4.8, tags: ["moderno", "espontaneo", "documental"], availability: 75, icon: "📷" },
        { id: "fot3", name: "Golden Moments Photo", category: "fotografia", priceRange: "R$ 5.000 - 10.000", rating: 5.0, tags: ["luxo", "editorial", "requintado"], availability: 60, icon: "📷" },
        { id: "fot4", name: "Fotografia Luz & Amor", category: "fotografia", priceRange: "R$ 2.500 - 4.500", rating: 4.6, tags: ["natural", "campestre", "luz natural"], availability: 92, icon: "📷" },
        { id: "fot5", name: "Estudio Criativo", category: "fotografia", priceRange: "R$ 3.500 - 6.000", rating: 4.7, tags: ["criativo", "diferente", "arte"], availability: 85, icon: "📷" }
    ],
    decoracao: [
        { id: "dec1", name: "Decoracoes dos Sonhos", category: "decoracao", priceRange: "R$ 5.000 - 10.000", rating: 4.7, tags: ["classico", "elegante", "floral"], availability: 78, icon: "🎨" },
        { id: "dec2", name: "Arte & Estilo Eventos", category: "decoracao", priceRange: "R$ 8.000 - 15.000", rating: 4.9, tags: ["moderno", "minimalista", "design"], availability: 65, icon: "🎨" },
        { id: "dec3", name: "Rustico Charm", category: "decoracao", priceRange: "R$ 4.000 - 8.000", rating: 4.8, tags: ["rustico", "boho", "natural"], availability: 90, icon: "🎨" },
        { id: "dec4", name: "Luxo & Sofisticacao", category: "decoracao", priceRange: "R$ 10.000 - 20.000", rating: 5.0, tags: ["luxo", "chique", "requintado"], availability: 55, icon: "🎨" },
        { id: "dec5", name: "Decore Seu Dia", category: "decoracao", priceRange: "R$ 3.000 - 6.000", rating: 4.5, tags: ["simples", "elegante", "acessivel"], availability: 95, icon: "🎨" }
    ],
    musica: [
        { id: "mus1", name: "Banda Alma & Coracao", category: "musica", priceRange: "R$ 3.000 - 5.000", rating: 4.8, tags: ["classico", "romantico", "ao vivo"], availability: 70, icon: "🎵" },
        { id: "mus2", name: "DJ EletroVibe", category: "musica", priceRange: "R$ 2.000 - 4.000", rating: 4.6, tags: ["moderno", "eletronico", "pista"], availability: 85, icon: "🎵" },
        { id: "mus3", name: "Orquestra Encanto", category: "musica", priceRange: "R$ 5.000 - 10.000", rating: 4.9, tags: ["luxo", "elegante", "classica"], availability: 60, icon: "🎵" },
        { id: "mus4", name: "Trio Instrumental", category: "musica", priceRange: "R$ 1.500 - 3.000", rating: 4.5, tags: ["acustico", "intimo", "jazz"], availability: 92, icon: "🎵" },
        { id: "mus5", name: "Vocal Harmony", category: "musica", priceRange: "R$ 2.500 - 4.500", rating: 4.7, tags: ["vocal", "harmonia", "emocional"], availability: 80, icon: "🎵" }
    ],
    espaco: [
        { id: "esp1", name: "Espaco Villa Serena", category: "espaco", priceRange: "R$ 10.000 - 20.000", rating: 4.7, tags: ["campestre", "rustico", "jardim"], availability: 75, icon: "🏠" },
        { id: "esp2", name: "Salao Nobre Palace", category: "espaco", priceRange: "R$ 15.000 - 30.000", rating: 4.9, tags: ["luxo", "classico", "imponente"], availability: 60, icon: "🏠" },
        { id: "esp3", name: "Fazenda Encantada", category: "espaco", priceRange: "R$ 8.000 - 15.000", rating: 4.8, tags: ["rustico", "campo", "natureza"], availability: 82, icon: "🏠" },
        { id: "esp4", name: "Rooftop Vista Linda", category: "espaco", priceRange: "R$ 12.000 - 25.000", rating: 4.6, tags: ["moderno", "vista", "urbano"], availability: 70, icon: "🏠" },
        { id: "esp5", name: "Salao Industrial Chic", category: "espaco", priceRange: "R$ 7.000 - 12.000", rating: 4.5, tags: ["industrial", "moderno", "descolado"], availability: 88, icon: "🏠" }
    ]
};

// ============================================
// TAREFAS PADRAO
// ============================================

const DEFAULT_TASKS = [
    { name: "Definir orcamento do casamento", category: "12 meses", priority: "alta" },
    { name: "Escolher a data do casamento", category: "12 meses", priority: "alta" },
    { name: "Pesquisar e reservar o espaco", category: "12 meses", priority: "alta" },
    { name: "Contratar buffet", category: "9 meses", priority: "alta" },
    { name: "Escolher o vestido de noiva", category: "9 meses", priority: "alta" },
    { name: "Contratar fotografo e videografista", category: "6 meses", priority: "alta" },
    { name: "Contratar musica/DJ", category: "6 meses", priority: "media" },
    { name: "Enviar os convites", category: "3 meses", priority: "alta" },
    { name: "Confirmar fornecedores", category: "3 meses", priority: "alta" },
    { name: "Confirmar lista de convidados final", category: "1 mes", priority: "alta" },
    { name: "Relaxar e aproveitar o grande dia!", category: "Dia do Casamento", priority: "alta" },
    { name: "Fazer teste de maquiagem e cabelo", category: "1 mes", priority: "media" },
    { name: "Comprar aliancas", category: "3 meses", priority: "alta" },
    { name: "Definir lista de presente", category: "6 meses", priority: "media" },
    { name: "Fazer ensaio pre-wedding", category: "3 meses", priority: "baixa" },
    { name: "Contratar cerimonialista", category: "9 meses", priority: "alta" },
    { name: "Organizar traslado dos convidados", category: "1 mes", priority: "baixa" },
    { name: "Preparar lembrancinhas", category: "1 mes", priority: "media" },
    { name: "Confirmar som e iluminacao", category: "1 semana", priority: "alta" },
    { name: "Fazer massagem de relaxamento", category: "1 semana", priority: "baixa" }
];

function calculateDueDate(category) {
    const hoje = new Date();
    const newDate = new Date(hoje);
    switch(category) {
        case "12 meses": newDate.setMonth(hoje.getMonth() + 12); break;
        case "9 meses": newDate.setMonth(hoje.getMonth() + 9); break;
        case "6 meses": newDate.setMonth(hoje.getMonth() + 6); break;
        case "3 meses": newDate.setMonth(hoje.getMonth() + 3); break;
        case "1 mes": newDate.setMonth(hoje.getMonth() + 1); break;
        case "1 semana": newDate.setDate(hoje.getDate() + 7); break;
        default: return null;
    }
    return newDate.toISOString().split("T")[0];
}

export async function createDefaultTasksForEvent(userId, eventId) {
    try {
        const tasksCollection = collection(db, "tasks");
        const defaultTasks = DEFAULT_TASKS.map(function(task) {
            return {
                name: task.name,
                category: task.category,
                priority: task.priority,
                user_id: userId,
                event_id: eventId,
                completed: false,
                created_at: new Date().toISOString(),
                due_date: calculateDueDate(task.category)
            };
        });
        const promises = defaultTasks.map(function(task) {
            return addDoc(tasksCollection, task);
        });
        await Promise.all(promises);
        return { success: true, count: defaultTasks.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// IA DE SUGESTAO DE FORNECEDORES
// ============================================

function parsePriceRange(priceRange) {
    if (!priceRange) return 5000;
    var numbers = priceRange.match(/\d+/g);
    if (!numbers || numbers.length === 0) return 5000;
    var sum = 0;
    for (var i = 0; i < numbers.length; i++) {
        sum = sum + parseInt(numbers[i], 10);
    }
    return sum / numbers.length;
}

export function suggestSuppliersIA(eventTheme, budget) {
    var suggestions = [];
    
    var themePriceProfile = {
        "classico": { nivel: "medio", multiplicador: 0.8, descricao: "Tradicional e elegante" },
        "moderno": { nivel: "medio-alto", multiplicador: 1.0, descricao: "Contemporâneo e minimalista" },
        "rustico": { nivel: "baixo-medio", multiplicador: 0.6, descricao: "Campestre e aconchegante" },
        "luxo": { nivel: "alto", multiplicador: 1.5, descricao: "Sofisticado e requintado" }
    };
    
    const SUPPLIERS_BY_THEME = {
        classico: {
            buffet: [{ id: "buf1", name: "Buffet Tradição & Elegância", priceRange: "R$ 70-100 por pessoa", rating: 4.7, availability: 90 }],
            fotografia: [{ id: "fot1", name: "Fotografia Classic Moments", priceRange: "R$ 2.500 - 4.000", rating: 4.7, availability: 88 }],
            decoracao: [{ id: "dec1", name: "Decorações Clássicas", priceRange: "R$ 4.000 - 7.000", rating: 4.6, availability: 85 }],
            musica: [{ id: "mus1", name: "Orquestra de Câmara", priceRange: "R$ 3.000 - 5.000", rating: 4.8, availability: 75 }],
            espaco: [{ id: "esp1", name: "Salão Nobre Classic", priceRange: "R$ 8.000 - 15.000", rating: 4.7, availability: 82 }]
        },
        luxo: {
            buffet: [{ id: "buf1", name: "Buffet Imperial", priceRange: "R$ 150-250 por pessoa", rating: 5.0, availability: 60 }],
            fotografia: [{ id: "fot1", name: "Vogue Photography", priceRange: "R$ 8.000 - 15.000", rating: 5.0, availability: 55 }],
            decoracao: [{ id: "dec1", name: "Decorações Reais", priceRange: "R$ 15.000 - 30.000", rating: 5.0, availability: 50 }],
            musica: [{ id: "mus1", name: "Orquestra Sinfônica", priceRange: "R$ 8.000 - 15.000", rating: 5.0, availability: 55 }],
            espaco: [{ id: "esp1", name: "Palácio dos Eventos", priceRange: "R$ 25.000 - 50.000", rating: 5.0, availability: 45 }]
        },
        rustico: {
            buffet: [{ id: "buf1", name: "Buffet Campestre", priceRange: "R$ 45-70 por pessoa", rating: 4.5, availability: 95 }],
            fotografia: [{ id: "fot1", name: "Foto Natural", priceRange: "R$ 1.800 - 3.000", rating: 4.5, availability: 92 }],
            decoracao: [{ id: "dec1", name: "Decoração Rústica", priceRange: "R$ 3.000 - 5.000", rating: 4.6, availability: 90 }],
            musica: [{ id: "mus1", name: "Música ao Pé do Fogo", priceRange: "R$ 1.500 - 3.000", rating: 4.5, availability: 88 }],
            espaco: [{ id: "esp1", name: "Fazenda Paraíso", priceRange: "R$ 5.000 - 10.000", rating: 4.7, availability: 85 }]
        },
        moderno: {
            buffet: [{ id: "buf1", name: "Buffet Contemporâneo", priceRange: "R$ 90-140 por pessoa", rating: 4.8, availability: 85 }],
            fotografia: [{ id: "fot1", name: "Urban Photo", priceRange: "R$ 3.500 - 6.000", rating: 4.8, availability: 80 }],
            decoracao: [{ id: "dec1", name: "Design Minimalista", priceRange: "R$ 6.000 - 12.000", rating: 4.8, availability: 78 }],
            musica: [{ id: "mus1", name: "DJ Eletrônico", priceRange: "R$ 3.000 - 6.000", rating: 4.7, availability: 80 }],
            espaco: [{ id: "esp1", name: "Galeria Industrial", priceRange: "R$ 10.000 - 18.000", rating: 4.8, availability: 70 }]
        }
    };
    
    var priceProfile = themePriceProfile[eventTheme?.toLowerCase()] || themePriceProfile.classico;
    var themeSuppliers = SUPPLIERS_BY_THEME[eventTheme?.toLowerCase()] || SUPPLIERS_BY_THEME.classico;
    
    for (var category in themeSuppliers) {
        if (themeSuppliers.hasOwnProperty(category)) {
            var suppliers = themeSuppliers[category];
            for (var j = 0; j < suppliers.length; j++) {
                var supplier = suppliers[j];
                var score = 30;
                var ratingScore = (supplier.rating - 4) * 20;
                score += Math.max(0, ratingScore);
                
                if (budget > 0) {
                    var priceValue = parsePriceRange(supplier.priceRange);
                    var orcamentoAjustado = budget * priceProfile.multiplicador;
                    var budgetRatio = priceValue / orcamentoAjustado;
                    if (budgetRatio <= 0.5) score += 30;
                    else if (budgetRatio <= 0.8) score += 25;
                    else if (budgetRatio <= 1.2) score += 20;
                    else if (budgetRatio <= 1.5) score += 10;
                    else score += 5;
                }
                
                score += (supplier.availability / 100) * 15;
                var compatibility = Math.min(100, Math.max(0, Math.round(score)));
                
                var icon = "";
                if (category === "buffet") icon = "🍽️";
                else if (category === "fotografia") icon = "📷";
                else if (category === "decoracao") icon = "🎨";
                else if (category === "musica") icon = "🎵";
                else if (category === "espaco") icon = "🏠";
                
                suggestions.push({
                    id: supplier.id,
                    name: supplier.name,
                    category: category,
                    priceRange: supplier.priceRange,
                    rating: supplier.rating,
                    availability: supplier.availability,
                    compatibility: compatibility,
                    icon: icon
                });
            }
        }
    }
    
    suggestions.sort(function(a, b) { return b.compatibility - a.compatibility; });
    return suggestions;
}

// ============================================
// FORNECEDORES SALVOS
// ============================================

export async function saveSuggestedSupplier(userId, eventId, supplierData) {
    try {
        if (!userId || !eventId) {
            return { success: false, error: "Dados incompletos" };
        }
        
        const q = query(collection(db, "saved_suppliers"), where("event_id", "==", eventId), where("supplier_id", "==", supplierData.id));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            return { success: false, error: "Fornecedor já salvo nesta lista" };
        }
        
        const newSupplier = {
            user_id: userId,
            event_id: eventId,
            supplier_id: supplierData.id,
            name: supplierData.name || "",
            category: supplierData.category || "",
            price_range: supplierData.priceRange || "",
            rating: Number(supplierData.rating) || 0,
            compatibility: Number(supplierData.compatibility) || 0,
            saved_at: new Date().toISOString()
        };
        
        const docRef = await addDoc(collection(db, "saved_suppliers"), newSupplier);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao salvar fornecedor:", error);
        return { success: false, error: error.message };
    }
}

export async function getSavedSuppliers(eventId) {
    try {
        if (!eventId) return [];
        const q = query(collection(db, "saved_suppliers"), where("event_id", "==", eventId));
        const querySnapshot = await getDocs(q);
        const suppliers = [];
        querySnapshot.forEach((doc) => {
            suppliers.push({ id: doc.id, ...doc.data() });
        });
        return suppliers;
    } catch (error) {
        console.error("Erro ao buscar fornecedores salvos:", error);
        return [];
    }
}

export async function deleteSavedSupplier(supplierId) {
    try {
        await deleteDoc(doc(db, "saved_suppliers", supplierId));
        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar fornecedor salvo:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CRUD EVENTOS
// ============================================

export async function createEvent(eventData, userId) {
    try {
        var docRef = await addDoc(collection(db, "events"), {
            name: eventData.name || "",
            couple_names: eventData.couple_names || "",
            event_type: eventData.event_type || "Casamento",
            theme: eventData.theme || "Classico",
            budget_total: eventData.budget_total || 0,
            event_date: eventData.event_date || null,
            event_time: eventData.event_time || null,
            venue: eventData.venue || "",
            user_id: userId,
            created_at: new Date().toISOString()
        });
        await createDefaultTasksForEvent(userId, docRef.id);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao criar evento:", error);
        return { success: false, error: error.message };
    }
}

export async function getUserEvents(userId) {
    try {
        var q = query(collection(db, "events"), where("user_id", "==", userId));
        var querySnapshot = await getDocs(q);
        var events = [];
        querySnapshot.forEach(function(doc) {
            events.push({ id: doc.id, ...doc.data() });
        });
        return events;
    } catch (error) {
        console.error("Erro ao buscar eventos:", error);
        return [];
    }
}

export async function updateEvent(eventId, data) {
    try {
        var eventRef = doc(db, "events", eventId);
        await updateDoc(eventRef, {
            name: data.name,
            couple_names: data.couple_names,
            event_type: data.event_type,
            theme: data.theme,
            budget_total: data.budget_total,
            event_date: data.event_date || null,
            event_time: data.event_time || null,
            venue: data.venue
        });
        return { success: true };
    } catch (error) {
        console.error("Erro ao atualizar evento:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteEvent(eventId) {
    try {
        await deleteDoc(doc(db, "events", eventId));
        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar evento:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CRUD CONVIDADOS
// ============================================

export async function createGuest(guestData, eventId) {
    try {
        var docRef = await addDoc(collection(db, "guests"), {
            name: guestData.name || "",
            group_name: guestData.group_name || "",
            status: guestData.status || "pendente",
            table_name: guestData.table_name || "",
            phone: guestData.phone || "",
            event_id: eventId,
            created_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao criar convidado:", error);
        return { success: false, error: error.message };
    }
}

export async function getEventGuests(eventId) {
    try {
        var q = query(collection(db, "guests"), where("event_id", "==", eventId));
        var querySnapshot = await getDocs(q);
        var guests = [];
        querySnapshot.forEach(function(doc) {
            guests.push({ id: doc.id, ...doc.data() });
        });
        return guests;
    } catch (error) {
        console.error("Erro ao buscar convidados:", error);
        return [];
    }
}

export async function updateGuest(guestId, data) {
    try {
        const guestRef = doc(db, "guests", guestId);
        await updateDoc(guestRef, data);
        return { success: true };
    } catch (error) {
        console.error("Erro ao atualizar convidado:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteGuest(guestId) {
    try {
        await deleteDoc(doc(db, "guests", guestId));
        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar convidado:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CRUD FORNECEDORES
// ============================================

export async function createSupplier(supplierData, eventId) {
    try {
        var docRef = await addDoc(collection(db, "suppliers"), {
            name: supplierData.name || "",
            category: supplierData.category || "",
            status: supplierData.status || "cotado",
            value: supplierData.value || 0,
            contact: supplierData.contact || "",
            event_id: eventId,
            created_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao criar fornecedor:", error);
        return { success: false, error: error.message };
    }
}

export async function getEventSuppliers(eventId) {
    try {
        var q = query(collection(db, "suppliers"), where("event_id", "==", eventId));
        var querySnapshot = await getDocs(q);
        var suppliers = [];
        querySnapshot.forEach(function(doc) {
            suppliers.push({ id: doc.id, ...doc.data() });
        });
        return suppliers;
    } catch (error) {
        console.error("Erro ao buscar fornecedores:", error);
        return [];
    }
}

export async function updateSupplier(supplierId, data) {
    try {
        var supplierRef = doc(db, "suppliers", supplierId);
        await updateDoc(supplierRef, data);
        return { success: true };
    } catch (error) {
        console.error("Erro ao atualizar fornecedor:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteSupplier(supplierId) {
    try {
        await deleteDoc(doc(db, "suppliers", supplierId));
        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar fornecedor:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CRUD TAREFAS
// ============================================

export async function createTask(taskData, userId, eventId = null) {
    try {
        var docRef = await addDoc(collection(db, "tasks"), {
            name: taskData.name || "",
            category: taskData.category || "",
            priority: taskData.priority || "media",
            user_id: userId,
            event_id: eventId,
            completed: false,
            created_at: new Date().toISOString(),
            due_date: taskData.due_date || null
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao criar tarefa:", error);
        return { success: false, error: error.message };
    }
}

export async function getUserTasks(userId, eventId = null) {
    try {
        var q;
        if (eventId) {
            q = query(collection(db, "tasks"), where("user_id", "==", userId), where("event_id", "==", eventId));
        } else {
            q = query(collection(db, "tasks"), where("user_id", "==", userId), where("event_id", "==", null));
        }
        var querySnapshot = await getDocs(q);
        var tasks = [];
        querySnapshot.forEach(function(doc) {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        return tasks;
    } catch (error) {
        console.error("Erro ao buscar tarefas:", error);
        return [];
    }
}

export async function updateTask(taskId, data) {
    try {
        var taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, data);
        return { success: true };
    } catch (error) {
        console.error("Erro ao atualizar tarefa:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteTask(taskId) {
    try {
        await deleteDoc(doc(db, "tasks", taskId));
        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar tarefa:", error);
        return { success: false, error: error.message };
    }
}

export async function toggleTaskComplete(taskId) {
    try {
        var taskRef = doc(db, "tasks", taskId);
        var taskDoc = await getDoc(taskRef);
        var currentStatus = taskDoc.data()?.completed || false;
        await updateDoc(taskRef, { completed: !currentStatus });
        return { success: true };
    } catch (error) {
        console.error("Erro ao alternar status da tarefa:", error);
        return { success: false, error: error.message };
    }
}

// ============================================
// PERFIL DO USUARIO
// ============================================

export async function updateUserProfile(userId, profileData) {
    try {
        var userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            "profile.fullName": profileData.fullName || "",
            "profile.cpf": profileData.cpf || "",
            "profile.birthDate": profileData.birthDate || "",
            "profile.address": profileData.address || "",
            "profile.phone": profileData.phone || "",
            "profile.photo": profileData.photo || null
        });
        return { success: true };
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        return { success: false, error: error.message };
    }
}

export async function getUserProfile(userId) {
    try {
        var userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) return userDoc.data();
        return null;
    } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        return null;
    }
}