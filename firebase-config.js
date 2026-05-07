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

// SUAS CONFIGURAÇÕES DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyCTg35X3QhCeQCXZR_mfvdHufzyJycDAhg",
    authDomain: "la-vie-casamentos.firebaseapp.com",
    projectId: "la-vie-casamentos",
    storageBucket: "la-vie-casamentos.firebasestorage.app",
    messagingSenderId: "44479756816",
    appId: "1:44479756816:web:1fd88c199f3e782baae895",
    measurementId: "G-C9RTVWLY0V"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ATIVAR PERSISTÊNCIA - O USUÁRIO PERMANECE LOGADO
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log('✅ Persistência ativada - usuário ficará logado');
    })
    .catch((error) => {
        console.error('❌ Erro ao ativar persistência:', error);
    });

// Configurar Google Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ========== AUTENTICAÇÃO ==========
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', user.uid), {
                username: user.displayName || user.email.split('@')[0],
                email: user.email,
                photoURL: user.photoURL,
                emailVerified: true,
                is_admin: false,
                createdAt: new Date().toISOString(),
                profile: {
                    fullName: user.displayName || '',
                    cpf: '',
                    birthDate: '',
                    address: '',
                    phone: '',
                    photo: user.photoURL || null
                }
            });
        }
        
        const userData = userDoc.exists() ? userDoc.data() : await (await getDoc(doc(db, 'users', user.uid))).data();
        
        return { 
            success: true, 
            user: {
                id: user.uid,
                username: userData?.username || user.displayName || user.email.split('@')[0],
                email: user.email,
                photoURL: user.photoURL,
                emailVerified: true,
                is_admin: userData?.is_admin || false,
                profile: userData?.profile || {}
            }
        };
    } catch (error) {
        console.error('Erro no login com Google:', error);
        let errorMessage = 'Erro ao fazer login com Google';
        if (error.code === 'auth/popup-closed-by-user') errorMessage = 'Popup fechado antes de completar o login';
        if (error.code === 'auth/popup-blocked') errorMessage = 'Popup bloqueado. Permita popups para este site.';
        return { success: false, error: errorMessage };
    }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        await userCredential.user.reload();
        
        if (!userCredential.user.emailVerified) {
            await signOut(auth);
            return { 
                success: false, 
                error: 'email-not-verified',
                message: 'Por favor, verifique seu email antes de fazer login.'
            };
        }
        
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        const userData = userDoc.data();
        
        return { 
            success: true, 
            user: {
                id: userCredential.user.uid,
                username: userData?.username || email.split('@')[0],
                email: userCredential.user.email,
                emailVerified: true,
                is_admin: userData?.is_admin || false,
                profile: userData?.profile || {}
            }
        };
    } catch (error) {
        let errorMessage = 'Erro no login';
        if (error.code === 'auth/user-not-found') errorMessage = 'Usuário não encontrado';
        if (error.code === 'auth/wrong-password') errorMessage = 'Senha incorreta';
        if (error.code === 'auth/invalid-email') errorMessage = 'Email inválido';
        if (error.code === 'auth/too-many-requests') errorMessage = 'Muitas tentativas. Tente mais tarde.';
        return { success: false, error: errorMessage };
    }
}

export async function registerWithEmail(email, password, username) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        await sendEmailVerification(userCredential.user);
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            username: username,
            email: email,
            photoURL: null,
            emailVerified: false,
            is_admin: username === 'admin',
            createdAt: new Date().toISOString(),
            profile: {
                fullName: '',
                cpf: '',
                birthDate: '',
                address: '',
                phone: '',
                photo: null
            }
        });
        
        await signOut(auth);
        
        return { success: true, message: 'Email de verificação enviado! Verifique sua caixa de entrada.' };
    } catch (error) {
        let errorMessage = 'Erro no cadastro';
        if (error.code === 'auth/email-already-in-use') errorMessage = 'Email já cadastrado';
        if (error.code === 'auth/weak-password') errorMessage = 'Senha muito fraca (mínimo 6 caracteres)';
        if (error.code === 'auth/invalid-email') errorMessage = 'Email inválido';
        return { success: false, error: errorMessage };
    }
}

export async function sendPasswordResetEmailFunction(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error) {
        console.error('Erro ao enviar recuperação:', error);
        let errorMessage = 'Erro ao enviar email de recuperação';
        if (error.code === 'auth/user-not-found') errorMessage = 'Usuário não encontrado';
        if (error.code === 'auth/invalid-email') errorMessage = 'Email inválido';
        return { success: false, error: error.code, message: errorMessage };
    }
}

export async function sendVerificationEmail() {
    try {
        const user = auth.currentUser;
        if (user) {
            await sendEmailVerification(user);
            return { success: true };
        }
        return { success: false, error: 'Nenhum usuário logado' };
    } catch (error) {
        console.error('Erro ao enviar verificação:', error);
        return { success: false, error: error.message };
    }
}

export async function logoutUser() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        console.error('Erro no logout:', error);
        return { success: false, error: error.message };
    }
}

export function onAuthChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const userData = userDoc.data();
            callback({
                id: user.uid,
                username: userData?.username || user.displayName || user.email.split('@')[0],
                email: user.email,
                photoURL: user.photoURL,
                emailVerified: user.emailVerified,
                is_admin: userData?.is_admin || false,
                profile: userData?.profile || {}
            });
        } else {
            callback(null);
        }
    });
}

// ========== TAREFAS PADRÃO (CHECKLIST AUTOMÁTICO) ==========

const DEFAULT_TASKS = [
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
    { name: "Relaxar e aproveitar o grande dia!", category: "Dia do Casamento", priority: "alta" },
    { name: "Fazer teste de maquiagem e cabelo", category: "1 mês", priority: "media" },
    { name: "Comprar alianças", category: "3 meses", priority: "alta" },
    { name: "Definir lista de presente", category: "6 meses", priority: "media" },
    { name: "Fazer ensaio pré-wedding", category: "3 meses", priority: "baixa" },
    { name: "Contratar cerimonialista", category: "9 meses", priority: "alta" },
    { name: "Organizar traslado dos convidados", category: "1 mês", priority: "baixa" },
    { name: "Preparar lembrancinhas", category: "1 mês", priority: "media" },
    { name: "Confirmar som e iluminação", category: "1 semana", priority: "alta" },
    { name: "Fazer massagem de relaxamento", category: "1 semana", priority: "baixa" }
];

function calculateDueDate(category) {
    const hoje = new Date();
    const newDate = new Date(hoje);
    switch(category) {
        case '12 meses': newDate.setMonth(hoje.getMonth() + 12); break;
        case '9 meses': newDate.setMonth(hoje.getMonth() + 9); break;
        case '6 meses': newDate.setMonth(hoje.getMonth() + 6); break;
        case '3 meses': newDate.setMonth(hoje.getMonth() + 3); break;
        case '1 mês': newDate.setMonth(hoje.getMonth() + 1); break;
        case '1 semana': newDate.setDate(hoje.getDate() + 7); break;
        default: return null;
    }
    return newDate.toISOString().split('T')[0];
}

export async function createDefaultTasksForEvent(userId, eventId) {
    try {
        const tasksCollection = collection(db, 'tasks');
        const defaultTasks = DEFAULT_TASKS.map(task => ({
            ...task,
            user_id: userId,
            event_id: eventId,
            completed: false,
            created_at: new Date().toISOString(),
            due_date: calculateDueDate(task.category)
        }));
        
        const promises = defaultTasks.map(task => addDoc(tasksCollection, task));
        await Promise.all(promises);
        
        console.log(`✅ ${defaultTasks.length} tarefas padrão criadas para o evento ${eventId}`);
        return { success: true, count: defaultTasks.length };
    } catch (error) {
        console.error('Erro ao criar tarefas padrão:', error);
        return { success: false, error: error.message };
    }
}

// ========== EVENTOS ==========
export async function createEvent(eventData, userId) {
    try {
        const docRef = await addDoc(collection(db, 'events'), {
            ...eventData,
            user_id: userId,
            created_at: new Date().toISOString()
        });
        
        // CRIAR TAREFAS PADRÃO AUTOMATICAMENTE
        await createDefaultTasksForEvent(userId, docRef.id);
        
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserEvents(userId) {
    try {
        const q = query(collection(db, 'events'), where('user_id', '==', userId));
        const querySnapshot = await getDocs(q);
        const events = [];
        querySnapshot.forEach(doc => {
            events.push({ id: doc.id, ...doc.data() });
        });
        return events;
    } catch (error) {
        console.error('Erro ao carregar eventos:', error);
        return [];
    }
}

export async function updateEvent(eventId, data) {
    try {
        const eventRef = doc(db, 'events', eventId);
        await updateDoc(eventRef, data);
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar evento:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteEvent(eventId) {
    try {
        await deleteDoc(doc(db, 'events', eventId));
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar evento:', error);
        return { success: false, error: error.message };
    }
}

// ========== CONVIDADOS ==========
export async function createGuest(guestData, eventId) {
    try {
        const docRef = await addDoc(collection(db, 'guests'), {
            ...guestData,
            event_id: eventId,
            created_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Erro ao criar convidado:', error);
        return { success: false, error: error.message };
    }
}

export async function getEventGuests(eventId) {
    try {
        const q = query(collection(db, 'guests'), where('event_id', '==', eventId));
        const querySnapshot = await getDocs(q);
        const guests = [];
        querySnapshot.forEach(doc => {
            guests.push({ id: doc.id, ...doc.data() });
        });
        return guests;
    } catch (error) {
        console.error('Erro ao carregar convidados:', error);
        return [];
    }
}

export async function updateGuest(guestId, data) {
    try {
        const guestRef = doc(db, 'guests', guestId);
        await updateDoc(guestRef, data);
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar convidado:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteGuest(guestId) {
    try {
        await deleteDoc(doc(db, 'guests', guestId));
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar convidado:', error);
        return { success: false, error: error.message };
    }
}

// ========== FORNECEDORES ==========
export async function createSupplier(supplierData, eventId) {
    try {
        const docRef = await addDoc(collection(db, 'suppliers'), {
            ...supplierData,
            event_id: eventId,
            created_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Erro ao criar fornecedor:', error);
        return { success: false, error: error.message };
    }
}

export async function getEventSuppliers(eventId) {
    try {
        const q = query(collection(db, 'suppliers'), where('event_id', '==', eventId));
        const querySnapshot = await getDocs(q);
        const suppliers = [];
        querySnapshot.forEach(doc => {
            suppliers.push({ id: doc.id, ...doc.data() });
        });
        return suppliers;
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        return [];
    }
}

export async function updateSupplier(supplierId, data) {
    try {
        const supplierRef = doc(db, 'suppliers', supplierId);
        await updateDoc(supplierRef, data);
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar fornecedor:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteSupplier(supplierId) {
    try {
        await deleteDoc(doc(db, 'suppliers', supplierId));
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar fornecedor:', error);
        return { success: false, error: error.message };
    }
}

// ========== TAREFAS ==========
export async function createTask(taskData, userId, eventId = null) {
    try {
        const docRef = await addDoc(collection(db, 'tasks'), {
            ...taskData,
            user_id: userId,
            event_id: eventId,
            completed: false,
            created_at: new Date().toISOString()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserTasks(userId, eventId = null) {
    try {
        let q;
        if (eventId) {
            q = query(
                collection(db, 'tasks'), 
                where('user_id', '==', userId),
                where('event_id', '==', eventId)
            );
        } else {
            q = query(
                collection(db, 'tasks'), 
                where('user_id', '==', userId),
                where('event_id', '==', null)
            );
        }
        const querySnapshot = await getDocs(q);
        const tasks = [];
        querySnapshot.forEach(doc => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        return tasks;
    } catch (error) {
        console.error('Erro ao carregar tarefas:', error);
        return [];
    }
}

export async function updateTask(taskId, data) {
    try {
        const taskRef = doc(db, 'tasks', taskId);
        await updateDoc(taskRef, data);
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        return { success: false, error: error.message };
    }
}

export async function deleteTask(taskId) {
    try {
        await deleteDoc(doc(db, 'tasks', taskId));
        return { success: true };
    } catch (error) {
        console.error('Erro ao deletar tarefa:', error);
        return { success: false, error: error.message };
    }
}

export async function toggleTaskComplete(taskId) {
    try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskDoc = await getDoc(taskRef);
        const currentStatus = taskDoc.data()?.completed || false;
        await updateDoc(taskRef, { completed: !currentStatus });
        return { success: true };
    } catch (error) {
        console.error('Erro ao alternar tarefa:', error);
        return { success: false, error: error.message };
    }
}

// ========== PERFIL DO USUÁRIO ==========
export async function updateUserProfile(userId, profileData) {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            'profile.fullName': profileData.fullName || '',
            'profile.cpf': profileData.cpf || '',
            'profile.birthDate': profileData.birthDate || '',
            'profile.address': profileData.address || '',
            'profile.phone': profileData.phone || ''
        });
        
        if (profileData.photo) {
            await updateDoc(userRef, { 'profile.photo': profileData.photo });
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        return { success: false, error: error.message };
    }
}

export async function getUserProfile(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        return null;
    }
}