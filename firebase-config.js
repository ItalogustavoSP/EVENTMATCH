// firebase-config.js
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

setPersistence(auth, browserLocalPersistence)
    .then(() => console.log("Persistencia ativada"))
    .catch((error) => console.error("Erro ao ativar persistencia:", error));

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

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
        if (error.code === "auth/user-not-found") errorMessage = "Usuario nao encontrado";
        if (error.code === "auth/wrong-password") errorMessage = "Senha incorreta";
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
        return { success: true, message: "Email de verificacao enviado!" };
    } catch (error) {
        let errorMessage = "Erro no cadastro";
        if (error.code === "auth/email-already-in-use") errorMessage = "Email ja cadastrado";
        if (error.code === "auth/weak-password") errorMessage = "Senha muito fraca";
        return { success: false, error: errorMessage };
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

export async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        return { success: false };
    }
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
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
        } else {
            callback(null);
        }
    });
}

// ============================================
// REPOSITORIO DE FORNECEDORES (IA)
// ============================================

export const SUPPLIERS_DB = {
    buffet: [
        { id: "buf1", name: "Buffet Gourmet & Cia", category: "buffet", priceRange: "R$ 80-120 por pessoa", rating: 4.8, tags: ["casamento", "gourmet", "tradicional"], icon: "B" },
        { id: "buf2", name: "Sabor & Arte Buffet", category: "buffet", priceRange: "R$ 60-90 por pessoa", rating: 4.5, tags: ["rustico", "campestre", "natural"], icon: "B" },
        { id: "buf3", name: "Delicias do Chef", category: "buffet", priceRange: "R$ 100-150 por pessoa", rating: 4.9, tags: ["luxo", "moderno", "internacional"], icon: "B" },
        { id: "buf4", name: "Buffet Colonial", category: "buffet", priceRange: "R$ 50-80 por pessoa", rating: 4.3, tags: ["tradicional", "caseiro", "familiar"], icon: "B" },
        { id: "buf5", name: "Chef no Evento", category: "buffet", priceRange: "R$ 90-130 por pessoa", rating: 4.7, tags: ["contemporaneo", "fusion", "criativo"], icon: "B" }
    ],
    fotografia: [
        { id: "fot1", name: "Fotografia Memorias Eternas", category: "fotografia", priceRange: "R$ 3.000 - 5.000", rating: 4.9, tags: ["classico", "romantico", "ensaio"], icon: "F" },
        { id: "fot2", name: "Click & Love Estudio", category: "fotografia", priceRange: "R$ 4.000 - 7.000", rating: 4.8, tags: ["moderno", "espontaneo", "documental"], icon: "F" },
        { id: "fot3", name: "Golden Moments Photo", category: "fotografia", priceRange: "R$ 5.000 - 10.000", rating: 5.0, tags: ["luxo", "editorial", "requintado"], icon: "F" },
        { id: "fot4", name: "Fotografia Luz & Amor", category: "fotografia", priceRange: "R$ 2.500 - 4.500", rating: 4.6, tags: ["natural", "campestre", "luz natural"], icon: "F" },
        { id: "fot5", name: "Estudio Criativo", category: "fotografia", priceRange: "R$ 3.500 - 6.000", rating: 4.7, tags: ["criativo", "diferente", "arte"], icon: "F" }
    ],
    decoracao: [
        { id: "dec1", name: "Decoracoes dos Sonhos", category: "decoracao", priceRange: "R$ 5.000 - 10.000", rating: 4.7, tags: ["classico", "elegante", "floral"], icon: "D" },
        { id: "dec2", name: "Arte & Estilo Eventos", category: "decoracao", priceRange: "R$ 8.000 - 15.000", rating: 4.9, tags: ["moderno", "minimalista", "design"], icon: "D" },
        { id: "dec3", name: "Rustico Charm", category: "decoracao", priceRange: "R$ 4.000 - 8.000", rating: 4.8, tags: ["rustico", "boho", "natural"], icon: "D" },
        { id: "dec4", name: "Luxo & Sofisticacao", category: "decoracao", priceRange: "R$ 10.000 - 20.000", rating: 5.0, tags: ["luxo", "chique", "requintado"], icon: "D" },
        { id: "dec5", name: "Decore Seu Dia", category: "decoracao", priceRange: "R$ 3.000 - 6.000", rating: 4.5, tags: ["simples", "elegante", "acessivel"], icon: "D" }
    ],
    musica: [
        { id: "mus1", name: "Banda Alma & Coracao", category: "musica", priceRange: "R$ 3.000 - 5.000", rating: 4.8, tags: ["classico", "romantico", "ao vivo"], icon: "M" },
        { id: "mus2", name: "DJ EletroVibe", category: "musica", priceRange: "R$ 2.000 - 4.000", rating: 4.6, tags: ["moderno", "eletronico", "pista"], icon: "M" },
        { id: "mus3", name: "Orquestra Encanto", category: "musica", priceRange: "R$ 5.000 - 10.000", rating: 4.9, tags: ["luxo", "elegante", "classica"], icon: "M" },
        { id: "mus4", name: "Trio Instrumental", category: "musica", priceRange: "R$ 1.500 - 3.000", rating: 4.5, tags: ["acustico", "intimo", "jazz"], icon: "M" },
        { id: "mus5", name: "Vocal Harmony", category: "musica", priceRange: "R$ 2.500 - 4.500", rating: 4.7, tags: ["vocal", "harmonia", "emocional"], icon: "M" }
    ],
    espaco: [
        { id: "esp1", name: "Espaco Villa Serena", category: "espaco", priceRange: "R$ 10.000 - 20.000", rating: 4.7, tags: ["campestre", "rustico", "jardim"], icon: "E" },
        { id: "esp2", name: "Salao Nobre Palace", category: "espaco", priceRange: "R$ 15.000 - 30.000", rating: 4.9, tags: ["luxo", "classico", "imponente"], icon: "E" },
        { id: "esp3", name: "Fazenda Encantada", category: "espaco", priceRange: "R$ 8.000 - 15.000", rating: 4.8, tags: ["rustico", "campo", "natureza"], icon: "E" },
        { id: "esp4", name: "Rooftop Vista Linda", category: "espaco", priceRange: "R$ 12.000 - 25.000", rating: 4.6, tags: ["moderno", "vista", "urbano"], icon: "E" },
        { id: "esp5", name: "Salao Industrial Chic", category: "espaco", priceRange: "R$ 7.000 - 12.000", rating: 4.5, tags: ["industrial", "moderno", "descolado"], icon: "E" }
    ]
};

// ============================================
// TAREFAS PADRAO (CHECKLIST AUTOMATICO)
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

export function suggestSuppliersIA(eventTheme, budget) {
    var suggestions = [];
    
    var themeTags = {
        "classico": ["classico", "elegante", "tradicional", "romantico"],
        "moderno": ["moderno", "contemporaneo", "minimalista", "design"],
        "rustico": ["rustico", "campestre", "natural", "boho"],
        "luxo": ["luxo", "chique", "requintado", "imponente"],
        "romantico": ["romantico", "emocional", "floral", "acolhedor"],
        "praia": ["praia", "mar", "natural", "areia"],
        "industrial": ["industrial", "moderno", "descolado", "urbano"]
    };
    
    var tags = themeTags[eventTheme?.toLowerCase()] || ["classico", "elegante", "moderno"];
    
    function parsePriceRange(priceRange) {
        var numbers = priceRange.match(/\d+/g);
        if (!numbers) return 5000;
        var sum = 0;
        for (var i = 0; i < numbers.length; i++) {
            sum = sum + parseInt(numbers[i], 10);
        }
        return sum / numbers.length;
    }
    
    for (var category in SUPPLIERS_DB) {
        if (SUPPLIERS_DB.hasOwnProperty(category)) {
            var suppliers = SUPPLIERS_DB[category];
            var categorySuggestions = [];
            for (var j = 0; j < suppliers.length; j++) {
                var supplier = suppliers[j];
                var score = 0;
                var tagMatches = 0;
                for (var k = 0; k < supplier.tags.length; k++) {
                    for (var t = 0; t < tags.length; t++) {
                        if (supplier.tags[k] === tags[t]) {
                            tagMatches++;
                        }
                    }
                }
                score += tagMatches * 2;
                score += (supplier.rating - 4) * 10;
                var priceValue = parsePriceRange(supplier.priceRange);
                if (budget >= priceValue * 0.5 && budget <= priceValue * 2) {
                    score += 5;
                } else if (budget >= priceValue * 0.3 && budget <= priceValue * 3) {
                    score += 2;
                }
                var compatibility = Math.min(100, Math.round(score * 10));
                categorySuggestions.push({
                    id: supplier.id,
                    name: supplier.name,
                    category: supplier.category,
                    priceRange: supplier.priceRange,
                    rating: supplier.rating,
                    tags: supplier.tags,
                    icon: supplier.icon,
                    compatibility: compatibility
                });
            }
            categorySuggestions.sort(function(a, b) {
                return b.compatibility - a.compatibility;
            });
            for (var s = 0; s < Math.min(3, categorySuggestions.length); s++) {
                suggestions.push(categorySuggestions[s]);
            }
        }
    }
    
    return suggestions;
}

// ============================================
// SALVAR FORNECEDORES SUGERIDOS
// ============================================

export async function saveSuggestedSupplier(userId, eventId, supplierData) {
    try {
        var q = query(
            collection(db, "saved_suppliers"), 
            where("event_id", "==", eventId),
            where("supplier_id", "==", supplierData.id)
        );
        var existing = await getDocs(q);
        
        if (!existing.empty) {
            return { success: false, error: "Fornecedor ja salvo nesta lista" };
        }
        
        var docRef = await addDoc(collection(db, "saved_suppliers"), {
            user_id: userId,
            event_id: eventId,
            supplier_id: supplierData.id,
            name: supplierData.name,
            category: supplierData.category,
            price_range: supplierData.priceRange,
            rating: supplierData.rating,
            compatibility: supplierData.compatibility,
            saved_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error("Erro ao salvar fornecedor:", error);
        return { success: false, error: error.message };
    }
}

export async function getSavedSuppliers(eventId) {
    try {
        var q = query(collection(db, "saved_suppliers"), where("event_id", "==", eventId));
        var querySnapshot = await getDocs(q);
        var suppliers = [];
        querySnapshot.forEach(function(doc) {
            suppliers.push({ id: doc.id, ...doc.data() });
        });
        return suppliers;
    } catch (error) {
        return [];
    }
}

export async function deleteSavedSupplier(supplierId) {
    try {
        await deleteDoc(doc(db, "saved_suppliers", supplierId));
        return { success: true };
    } catch (error) {
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
            venue: eventData.venue || "",
            user_id: userId,
            created_at: new Date().toISOString()
        });
        await createDefaultTasksForEvent(userId, docRef.id);
        return { success: true, id: docRef.id };
    } catch (error) {
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
        return [];
    }
}

export async function updateEvent(eventId, data) {
    try {
        var eventRef = doc(db, "events", eventId);
        await updateDoc(eventRef, data);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function deleteEvent(eventId) {
    try {
        await deleteDoc(doc(db, "events", eventId));
        return { success: true };
    } catch (error) {
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
        return [];
    }
}

export async function updateGuest(guestId, data) {
    try {
        const guestRef = doc(db, "guests", guestId);
        await updateDoc(guestRef, data);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function deleteGuest(guestId) {
    try {
        await deleteDoc(doc(db, "guests", guestId));
        return { success: true };
    } catch (error) {
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
        return [];
    }
}

export async function updateSupplier(supplierId, data) {
    try {
        var supplierRef = doc(db, "suppliers", supplierId);
        await updateDoc(supplierRef, data);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function deleteSupplier(supplierId) {
    try {
        await deleteDoc(doc(db, "suppliers", supplierId));
        return { success: true };
    } catch (error) {
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
        return [];
    }
}

export async function updateTask(taskId, data) {
    try {
        var taskRef = doc(db, "tasks", taskId);
        await updateDoc(taskRef, data);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function deleteTask(taskId) {
    try {
        await deleteDoc(doc(db, "tasks", taskId));
        return { success: true };
    } catch (error) {
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
        return { success: false, error: error.message };
    }
}

export async function getUserProfile(userId) {
    try {
        var userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) return userDoc.data();
        return null;
    } catch (error) {
        return null;
    }
}