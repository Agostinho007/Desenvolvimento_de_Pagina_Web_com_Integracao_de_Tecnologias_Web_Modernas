const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Caminho para o arquivo JSON
const dbPath = path.join(__dirname, 'db.json');

// Carregar ou inicializar banco de dados
let db = { users: [], tasks: [], disciplines: [], notifications: [], chats: [] };
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
    } else {
        db.users = [
            { id: '1', username: 'admin', password: 'admin123', role: 'admin', name: 'Administrador' },
            { id: '2', username: 'aluno123', password: 'senha123', role: 'student', name: 'Aluno 123', matricula: 'aluno123' }
        ];
        db.tasks = [];
        db.disciplines = ['Matemática', 'Programação Web', 'Inteligência Artificial', 'História', 'Física'];
        db.notifications = [];
        db.chats = [];
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
    if (!db.disciplines.includes(subject) && subject !== 'Outra') {
        db.disciplines.push(subject);
    }
    const task = {
        id: String(db.tasks.length + 1),
        title,
        type,
        description,
        deadline: formatDate(deadline),
        subject,
        assignedTo: [req.user.username],
        groupMembers: [req.user.username],
        priority,
        estimatedTime,
        status: 'Pendente'
    };
    db.tasks.push(task);
    const notification = {
        id: String(db.notifications.length + 1),
        message: `Nova tarefa criada: ${title} (${subject})`,
        timestamp: new Date().toISOString(),
        user: req.user.username
    };
    db.notifications.push(notification);
    saveDb();
    const io = req.app.get('io');
    io.emit('newTask', { task, notification });
    res.json(task);
});

// Rota: Visão geral do aluno
router.get('/student-overview', authenticateToken, (req, res) => {
    const userTasks = db.tasks.filter(t => t.assignedTo.includes(req.user.username)) || [];
    const pendingTasks = userTasks.filter(t => t.status === 'Pendente').length;
    const completedTasks = userTasks.filter(t => t.status === 'Concluída').length;
    const overdueTasks = userTasks.filter(t => {
        if (!t.deadline) return false;
        const [day, month, year] = t.deadline.split('/');
        return new Date(`${year}-${month}-${day}`) < new Date() && t.status !== 'Concluída';
    }).length;
    const upcomingTasks = userTasks.filter(t => {
        if (!t.deadline) return false;
        const [day, month, year] = t.deadline.split('/');
        const deadline = new Date(`${year}-${month}-${day}`);
        const now = new Date();
        return deadline > now && deadline < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }).length;
    res.json({ pendingTasks, completedTasks, overdueTasks, upcomingTasks });
});

// Rota: Listar tarefas do aluno
router.get('/tasks', authenticateToken, (req, res) => {
    const filter = req.query.filter || 'all';
    let userTasks = db.tasks.filter(t => t.assignedTo.includes(req.user.username)) || [];
    if (filter !== 'all') {
        userTasks = userTasks.filter(t => t.status === filter);
    }
    res.json(userTasks);
});

// Rota: Atualizar tarefa (aluno)
router.patch('/tasks/:id', authenticateToken, (req, res) => {
    const task = db.tasks.find(t => t.id === req.params.id && t.assignedTo.includes(req.user.username));
    if (!task) return res.status(404).json({ message: 'Tarefa não encontrada ou não autorizada' });
    Object.assign(task, req.body);
    const notification = {
        id: String(db.notifications.length + 1),
        message: `Tarefa atualizada: ${task.title} (${task.subject}) - Status: ${req.body.status}`,
        timestamp: new Date().toISOString(),
        user: req.user.username
    };
    db.notifications.push(notification);
    saveDb();
    const io = req.app.get('io');
    io.emit('taskUpdated', { task, notification });
    res.json({ message: 'Tarefa atualizada' });
});

// Rota: Relatórios do aluno
router.get('/reports', authenticateToken, (req, res) => {
    const userTasks = db.tasks.filter(t => t.assignedTo.includes(req.user.username)) || [];
    const bySubject = {};
    const byType = {
        'Trabalho individual': 0,
        'Trabalho em grupo': 0,
        'Revisão': 0,
        'Apresentação': 0
    };
    userTasks.forEach(task => {
        if (!bySubject[task.subject]) {
            bySubject[task.subject] = { Pendente: 0, 'Em andamento': 0, Concluída: 0 };
        }
        bySubject[task.subject][task.status] = (bySubject[task.subject][task.status] || 0) + 1;
        if (byType[task.type] !== undefined) {
            byType[task.type]++;
        }
    });
    res.json({ bySubject, byType });
});

// Rota: Visão geral do administrador
router.get('/admin-overview', authenticateToken, authenticateAdmin, (req, res) => {
    const totalTasks = db.tasks.length || 0;
    const pendingTasks = db.tasks.filter(t => t.status === 'Pendente').length || 0;
    const activeStudents = db.users.filter(u => u.role === 'student').length || 0;
    const overdueTasks = db.tasks.filter(t => {
        if (!t.deadline) return false;
        const [day, month, year] = t.deadline.split('/');
        return new Date(`${year}-${month}-${day}`) < new Date() && t.status !== 'Concluída';
    }).length || 0;
    res.json({ totalTasks, pendingTasks, activeStudents, overdueTasks });
});

// Rota: Listar todas as tarefas (admin)
router.get('/admin/tasks', authenticateToken, authenticateAdmin, (req, res) => {
    res.json(db.tasks || []);
});

// Rota: Criar tarefa (admin)
router.post('/admin/tasks', authenticateToken, authenticateAdmin, (req, res) => {
    const { title, type, description, deadline, subject, priority, estimatedTime } = req.body;
    if (!title || !type || !description || !deadline || !subject || !priority || !estimatedTime) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    if (!db.disciplines.includes(subject) && subject !== 'Outra') {
        db.disciplines.push(subject);
    }
    const task = {
        id: String(db.tasks.length + 1),
        title,
        type,
        description,
        deadline: formatDate(deadline),
        subject,
        assignedTo: [req.user.username],
        groupMembers: [req.user.username],
        priority,
        estimatedTime,
        status: 'Pendente'
    };
    db.tasks.push(task);
    const notification = {
        id: String(db.notifications.length + 1),
        message: `Nova tarefa criada por admin: ${title} (${subject})`,
        timestamp: new Date().toISOString(),
        user: req.user.username
    };
    db.notifications.push(notification);
    saveDb();
    const io = req.app.get('io');
    io.emit('newTask', { task, notification });
    res.json(task);
});

// Rota: Editar tarefa (admin)
router.patch('/admin/tasks/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const task = db.tasks.find(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ message: 'Tarefa não encontrada' });
    const { title, type, description, deadline, subject, priority, estimatedTime, status } = req.body;
    if (!title || !type || !description || !deadline || !subject || !priority || !estimatedTime || !status) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios' });
    }
    if (!db.disciplines.includes(subject) && subject !== 'Outra') {
        db.disciplines.push(subject);
    }
    Object.assign(task, {
        title,
        type,
        description,
        deadline: formatDate(deadline),
        subject,
        priority,
        estimatedTime,
        status
    });
    const notification = {
        id: String(db.notifications.length + 1),
        message: `Tarefa editada por admin: ${title} (${subject}) - Status: ${status}`,
        timestamp: new Date().toISOString(),
        user: req.user.username
    };
    db.notifications.push(notification);
    saveDb();
    const io = req.app.get('io');
    io.emit('taskUpdated', { task, notification });
    res.json({ message: 'Tarefa atualizada' });
});

// Rota: Excluir tarefa (admin)
router.delete('/admin/tasks/:id', authenticateToken, authenticateAdmin, (req, res) => {
    const initialLength = db.tasks.length;
    db.tasks = db.tasks.filter(t => t.id !== req.params.id);
    if (db.tasks.length === initialLength) {
        return res.status(404).json({ message: 'Tarefa não encontrada' });
    }
    saveDb();
    res.json({ message: 'Tarefa excluída' });
});

// Rota: Relatório de desempenho dos alunos (admin)
router.get('/admin/reports/students', authenticateToken, authenticateAdmin, (req, res) => {
    const students = db.users
        .filter(u => u.role === 'student')
        .map(u => ({
            name: u.name,
            completedTasks: db.tasks.filter(t => t.assignedTo.includes(u.username) && t.status === 'Concluída').length || 0,
            pendingTasks: db.tasks.filter(t => t.assignedTo.includes(u.username) && t.status === 'Pendente').length || 0
        }));
    res.json(students);
});

// Rota: Relatório de tipos de tarefas (admin)
router.get('/admin/reports/task-types', authenticateToken, authenticateAdmin, (req, res) => {
    const byType = {
        'Trabalho individual': 0,
        'Trabalho em grupo': 0,
        'Revisão': 0,
        'Apresentação': 0
    };
    db.tasks.forEach(task => {
        if (byType[task.type] !== undefined) {
            byType[task.type]++;
        }
    });
    res.json({ byType });
});

// Rota: Relatório de tarefas por disciplina (admin)
router.get('/admin/reports/disciplines', authenticateToken, authenticateAdmin, (req, res) => {
    const byDiscipline = {};
    db.tasks.forEach(task => {
        if (!byDiscipline[task.subject]) {
            byDiscipline[task.subject] = { Pendente: 0, 'Em andamento': 0, Concluída: 0 };
        }
        byDiscipline[task.subject][task.status] = (byDiscipline[task.subject][task.status] || 0) + 1;
    });
    res.json(byDiscipline);
});

// Rota: Listar notificações
router.get('/notifications', authenticateToken, (req, res) => {
    const userNotifications = db.notifications.filter(n => n.user === req.user.username || !n.user) || [];
    res.json(userNotifications);
});

// Rota: Listar mensagens de chat
router.get('/chats', authenticateToken, (req, res) => {
    const username = req.query.username;
    let userChats = [];
    if (req.user.role === 'admin' && username) {
        userChats = db.chats.filter(c => c.from === username || c.to === username);
    } else {
        userChats = db.chats.filter(c => c.from === req.user.username || c.to === req.user.username);
    }
    res.json(userChats);
});

module.exports = router;