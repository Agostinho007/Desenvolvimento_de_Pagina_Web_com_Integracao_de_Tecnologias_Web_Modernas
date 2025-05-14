const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
app.set('io', io); // Armazenar io no app para uso nas rotas

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', routes);

// Carregar banco de dados
const dbPath = path.join(__dirname, 'db.json');
let db = { users: [], tasks: [], disciplines: [], notifications: [], chats: [], botInteractions: {} };
try {
    if (fs.existsSync(dbPath)) {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!db.botInteractions) db.botInteractions = {};
    }
} catch (error) {
    console.error('Erro ao carregar db.json:', error.message);
}

// Salvar banco de dados
function saveDb() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Erro ao salvar db.json:', error.message);
    }
}

// Middleware de autenticação Socket.IO
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token não fornecido'));
    jwt.verify(token, 'secret_key', (err, decoded) => {
        if (err) return next(new Error('Usuário não autenticado'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    socket.emit('authenticated');
    socket.on('chatMessage', (data) => {
        const chat = {
            id: String(db.chats.length + 1),
            from: socket.user.username,
            to: data.to,
            message: data.message,
            timestamp: data.timestamp
        };
        db.chats.push(chat);
        saveDb();
        io.emit('chatMessage', chat);

        // Lógica do bot
        if (data.to === 'Bot') {
            const userId = db.users.find(u => u.username === socket.user.username)?.id;
            if (!userId) return;

            db.botInteractions[userId] = db.botInteractions[userId] || { count: 0, lastInteraction: null };
            const interactions = db.botInteractions[userId];

            if (interactions.count < 5) {
                interactions.count++;
                interactions.lastInteraction = new Date().toISOString();
                const botResponses = [
                    'Olá! Como posso ajudar com suas tarefas hoje?',
                    'Você tem alguma dúvida específica sobre uma disciplina?',
                    'Dica: Organize suas tarefas por prioridade para maior eficiência!',
                    'Precisa de ajuda com prazos ou planejamento? Me conte mais!',
                    'Essa é nossa última interação automática. Você será redirecionado para o administrador.'
                ];
                const botMessage = {
                    id: String(db.chats.length + 1),
                    from: 'Bot',
                    to: socket.user.username,
                    message: botResponses[interactions.count - 1],
                    timestamp: new Date().toISOString()
                };
                db.chats.push(botMessage);
                saveDb();
                io.emit('chatMessage', botMessage);

                // Após 5 interações, notificar o cliente e o administrador
                if (interactions.count === 5) {
                    io.to(socket.id).emit('botLimitReached', { username: socket.user.username });
                    io.emit('requestAdmin', { from: socket.user.username });
                }
            }
        }
    });
    socket.on('requestAdmin', (data) => {
        io.emit('requestAdmin', data);
    });
    socket.on('newTask', (task) => {
        io.emit('newTask', task);
    });
    socket.on('taskUpdated', (task) => {
        io.emit('taskUpdated', task);
    });
    socket.on('newNotification', (notification) => {
        io.emit('newNotification', notification);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));