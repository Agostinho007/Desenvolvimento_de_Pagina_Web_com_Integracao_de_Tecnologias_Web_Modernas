const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Caminho para o arquivo JSON
const dbPath = path.join(__dirname, 'db.json');

// Carregar ou inicializar banco de dados
let db = { users: [], tasks: [], disciplines: [], notifications: [], chats: [], botInteractions: {} };
try {
    if (fs.existsSync(dbPath)) {
        const rawData = fs.readFileSync(dbPath, 'utf8');
        if (!rawData) throw new Error('Arquivo db.json está vazio');
        db = JSON.parse(rawData);
        if (!db.users) db.users = [];
        if (!db.tasks) db.tasks = [];
        if (!db.disciplines) db.disciplines = [];
        if (!db.notifications) db.notifications = [];
        if (!db.chats) db.chats = [];
        if (!db.botInteractions) db.botInteractions = {};
    } else {
        db.users = [
            { id: '1', username: 'admin', password: 'admin123', role: 'admin', name: 'Administrador' },
            { id: '2', username: 'aluno123', password: 'senha123', role: 'student', name: 'Aluno 123', matricula: 'aluno123' }
        ];
        db.tasks = [];
        db.disciplines = ['Matemática', 'Programação Web', 'Inteligência Artificial', 'História', 'Física'];
        db.notifications = [];
        db.chats = [];
        db.botInteractions = {};
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }
} catch (error) {
    console.error('Erro ao carregar db.json:', error.message);
    throw new Error('Falha ao inicializar banco de dados');
}

// Salvar alterações no banco de dados
function saveDb() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Erro ao salvar db.json:', error.message);
        throw new Error('Falha ao salvar banco de dados');
    }
}

// Middleware para verificar JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token não fornecido' });
    jwt.verify(token, 'secret_key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido ou expirado' });
        req.user = user;
        next();
    });
};

// Middleware para verificar administrador
const authenticateAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Acesso negado' });
    next();
};

// Função para formatar data
function formatDate(date) {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
}

// Rota: Cadastro de aluno
router.post('/register', (req, res) => {
    const { name, matricula, username, password } = req.body;
    if (!name || !matricula || !username || !password) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    if (db.users.some(u => u.username === username)) {
        return res.status(400).json({ message: 'Usuário já existe' });
    }
    if (db.users.some(u => u.matricula === matricula)) {
        return res.status(400).json({ message: 'Matrícula já registrada' });
    }
    const user = {
        id: String(db.users.length + 1),
        name,
        matricula,
        username,
        password,
        role: 'student'
    };
    db.users.push(user);
    saveDb();
    res.json({ message: 'Usuário criado com sucesso' });
});

// Rota: Cadastro de administrador
router.post('/admin/register', authenticateToken, authenticateAdmin, (req, res) => {
    const { name, username, password } = req.body;
    if (!name || !username || !password) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    if (db.users.some(u => u.username === username)) {
        return res.status(400).json({ message: 'Usuário já existe' });
    }
    const user = {
        id: String(db.users.length + 1),
        name,
        username,
        password,
        role: 'admin'
    };
    db.users.push(user);
    saveDb();
    res.json({ message: 'Administrador criado com sucesso' });
});

// Rota: Listar administradores
router.get('/admin/admins', authenticateToken, authenticateAdmin, (req, res) => {
    const admins = db.users.filter(u => u.role === 'admin').map(u => ({
        id: u.id,
        name: u.name,
        username: u.username
    }));
    res.json(admins);
});

// Rota: Excluir administrador
router.delete('/admin/admins/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const adminId = req.params.id;
    const adminIndex = db.users.findIndex(u => u.id === adminId && u.role === 'admin');
    if (adminIndex === -1) return res.status(404).json({ message: 'Administrador não encontrado' });
    const adminCount = db.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) return res.status(400).json({ message: 'Não é possível excluir o último administrador' });
    db.users.splice(adminIndex, 1);
    saveDb();
    res.json({ message: 'Administrador excluído com sucesso' });
});

// Rota: Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios' });
    }
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ message: 'Credenciais inválidas' });
    const token = jwt.sign({ username, role: user.role, name: user.name }, 'secret_key', { expiresIn: '1h' });
    res.json({ token, role: user.role, name: user.name });
});

// Rota: Criar tarefa (aluno)
router.post('/tasks', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const { title, type, description, deadline, subject, priority, estimatedTime } = req.body;
    if (!title || !type || !description || !deadline || !subject || !priority || !estimatedTime) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    const task = {
        id: String(db.tasks.length + 1),
        title,
        type,
        description,
        deadline: formatDate(deadline),
        subject,
        priority,
        estimatedTime,
        status: 'Pendente',
        userId: db.users.find(u => u.username === req.user.username).id,
        createdAt: new Date().toISOString()
    };
    db.tasks.push(task);
    saveDb();
    res.json({ message: 'Tarefa criada com sucesso', task });
});

// Rota: Criar tarefa (admin)
router.post('/admin/tasks', authenticateToken, authenticateAdmin, (req, res) => {
    const { title, type, description, deadline, subject, priority, estimatedTime } = req.body;
    if (!title || !type || !description || !deadline || !subject || !priority || !estimatedTime) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    const task = {
        id: String(db.tasks.length + 1),
        title,
        type,
        description,
        deadline: formatDate(deadline),
        subject,
        priority,
        estimatedTime,
        status: 'Pendente',
        userId: null,
        createdAt: new Date().toISOString()
    };
    db.tasks.push(task);
    saveDb();
    res.json({ message: 'Tarefa criada com sucesso', task });
});

// Rota: Listar tarefas (aluno)
router.get('/tasks', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const filter = req.query.filter || 'all';
    const userId = db.users.find(u => u.username === req.user.username).id;
    let tasks = db.tasks.filter(t => t.userId === userId);
    if (filter !== 'all') tasks = tasks.filter(t => t.status === filter);
    res.json(tasks);
});

// Rota: Listar tarefas priorizadas (aluno)
router.get('/tasks/prioritized', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const userId = db.users.find(u => u.username === req.user.username).id;
    const tasks = db.tasks.filter(t => t.userId === userId && t.status !== 'Concluída');
    tasks.sort((a, b) => {
        const priorityOrder = { 'Alta': 1, 'Média': 2, 'Baixa': 3 };
        const priorityA = priorityOrder[a.priority] || 3;
        const priorityB = priorityOrder[b.priority] || 3;
        if (priorityA !== priorityB) return priorityA - priorityB;
        const [dayA, monthA, yearA] = a.deadline.split('/');
        const [dayB, monthB, yearB] = b.deadline.split('/');
        const dateA = new Date(`${yearA}-${monthA}-${dayA}`);
        const dateB = new Date(`${yearB}-${monthB}-${dayB}`);
        return dateA - dateB;
    });
    res.json(tasks);
});

// Rota: Listar tarefas (admin)
router.get('/admin/tasks', authenticateToken, authenticateAdmin, (req, res) => {
    res.json(db.tasks);
});

// Rota: Atualizar tarefa (aluno)
router.patch('/tasks/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const taskId = req.params.id;
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status é obrigatório' });
    const task = db.tasks.find(t => t.id === taskId && t.userId === db.users.find(u => u.username === req.user.username).id);
    if (!task) return res.status(404).json({ message: 'Tarefa não encontrada' });
    task.status = status;
    saveDb();
    res.json({ message: 'Tarefa atualizada com sucesso', task });
});

// Rota: Atualizar tarefa (admin)
router.patch('/admin/tasks/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const taskId = req.params.id;
    const { title, type, description, deadline, subject, priority, estimatedTime, status } = req.body;
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) return res.status(404).json({ message: 'Tarefa não encontrada' });
    task.title = title || task.title;
    task.type = type || task.type;
    task.description = description || task.description;
    task.deadline = deadline ? formatDate(deadline) : task.deadline;
    task.subject = subject || task.subject;
    task.priority = priority || task.priority;
    task.estimatedTime = estimatedTime || task.estimatedTime;
    task.status = status || task.status;
    saveDb();
    res.json({ message: 'Tarefa atualizada com sucesso', task });
});

// Rota: Excluir tarefa (admin)
router.delete('/admin/tasks/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const taskId = req.params.id;
    const taskIndex = db.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return res.status(404).json({ message: 'Tarefa não encontrada' });
    db.tasks.splice(taskIndex, 1);
    saveDb();
    res.json({ message: 'Tarefa excluída com sucesso' });
});

// Rota: Visão geral (aluno)
router.get('/student-overview', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const userId = db.users.find(u => u.username === req.user.username).id;
    const tasks = db.tasks.filter(t => t.userId === userId);
    const today = new Date();
    const overview = {
        pendingTasks: tasks.filter(t => t.status === 'Pendente').length,
        completedTasks: tasks.filter(t => t.status === 'Concluída').length,
        overdueTasks: tasks.filter(t => {
            const [day, month, year] = t.deadline.split('/');
            const deadline = new Date(`${year}-${month}-${day}`);
            return deadline < today && t.status !== 'Concluída';
        }).length,
        upcomingTasks: tasks.filter(t => {
            const [day, month, year] = t.deadline.split('/');
            const deadline = new Date(`${year}-${month}-${day}`);
            return deadline >= today && t.status !== 'Concluída';
        }).length
    };
    res.json(overview);
});

// Rota: Visão geral (admin)
router.get('/admin-overview', authenticateToken, authenticateAdmin, (req, res) => {
    const today = new Date();
    const overview = {
        totalTasks: db.tasks.length,
        pendingTasks: db.tasks.filter(t => t.status === 'Pendente').length,
        overdueTasks: db.tasks.filter(t => {
            const [day, month, year] = t.deadline.split('/');
            const deadline = new Date(`${year}-${month}-${day}`);
            return deadline < today && t.status !== 'Concluída';
        }).length,
        activeStudents: db.users.filter(u => u.role === 'student').length
    };
    res.json(overview);
});

// Rota: Relatórios (aluno)
router.get('/reports', authenticateToken, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Acesso negado' });
    const userId = db.users.find(u => u.username === req.user.username).id;
    const tasks = db.tasks.filter(t => t.userId === userId);
    const bySubject = {};
    const byType = {};
    tasks.forEach(t => {
        bySubject[t.subject] = bySubject[t.subject] || {};
        bySubject[t.subject][t.status] = (bySubject[t.subject][t.status] || 0) + 1;
        byType[t.type] = (byType[t.type] || 0) + 1;
    });
    res.json({ bySubject, byType });
});

// Rota: Relatórios de desempenho dos alunos (admin)
router.get('/admin/reports/students', authenticateToken, authenticateAdmin, (req, res) => {
    const students = db.users.filter(u => u.role === 'student').map(u => ({
        name: u.name,
        completedTasks: db.tasks.filter(t => t.userId === u.id && t.status === 'Concluída').length,
        pendingTasks: db.tasks.filter(t => t.userId === u.id && t.status !== 'Concluída').length
    }));
    res.json(students);
});

// Rota: Relatórios por tipo de tarefa (admin)
router.get('/admin/reports/task-types', authenticateToken, authenticateAdmin, (req, res) => {
    const byType = {};
    db.tasks.forEach(t => {
        byType[t.type] = (byType[t.type] || 0) + 1;
    });
    res.json({ byType });
});

// Rota: Relatórios por disciplina (admin)
router.get('/admin/reports/disciplines', authenticateToken, authenticateAdmin, (req, res) => {
    const byDiscipline = {};
    db.tasks.forEach(t => {
        byDiscipline[t.subject] = byDiscipline[t.subject] || {};
        byDiscipline[t.subject][t.status] = (byDiscipline[t.subject][t.status] || 0) + 1;
    });
    res.json(byDiscipline);
});

// Rota: Relatórios mensais de tarefas (admin)
router.get('/admin/reports/monthly', authenticateToken, authenticateAdmin, (req, res) => {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthly = {};
    months.forEach((month, index) => {
        monthly[month] = 0;
    });
    db.tasks.forEach(t => {
        const [day, month, year] = t.deadline.split('/');
        if (year === '2025') {
            const monthIndex = parseInt(month, 10) - 1;
            const monthName = months[monthIndex];
            monthly[monthName]++;
        }
    });
    res.json(monthly);
});

// Rota: Notificações
router.get('/notifications', authenticateToken, (req, res) => {
    const notifications = db.notifications.filter(n => n.userId === db.users.find(u => u.username === req.user.username)?.id || n.userId === null);
    res.json(notifications);
});

// Rota: Chats
router.get('/chats', authenticateToken, (req, res) => {
    const username = req.query.username;
    let chats = db.chats;
    if (username) {
        chats = chats.filter(c => c.from === username || c.to === username);
    } else if (req.user.role === 'admin') {
        chats = chats.filter(c => c.from !== 'Bot' && c.to !== 'Bot');
    } else {
        chats = chats.filter(c => c.from === req.user.username || c.to === req.user.username);
    }
    res.json(chats);
});

// Rota: Enviar mensagem no chat
router.post('/chats', authenticateToken, (req, res) => {
    const { message, to, timestamp } = req.body;
    if (!message || !to || !timestamp) return res.status(400).json({ message: 'Mensagem, destinatário e timestamp são obrigatórios' });
    const chat = {
        id: String(db.chats.length + 1),
        from: req.user.username,
        to,
        message,
        timestamp
    };
    db.chats.push(chat);
    saveDb();
    res.json({ message: 'Mensagem enviada com sucesso', chat });
});

module.exports = router;