const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Caminho para o arquivo JSON
const dbPath = path.join(__dirname, 'db.json');

// Carregar banco de dados
let db = { users: [], tasks: [], disciplines: [], notifications: [], chats: [] };
try {
    if (fs.existsSync(dbPath)) {
        const rawData = fs.readFileSync(dbPath, 'utf8');
        if (rawData) db = JSON.parse(rawData);
    }
} catch (error) {
    console.error('Erro ao carregar db.json:', error.message);
}

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Disponibilizar o io nas rotas
app.set('io', io);
app.use('/api', routes);

// Lógica do bot
const botResponses = {
    tarefa: 'Você gostaria de criar uma nova tarefa ou verificar suas tarefas pendentes?',
    prazo: 'Por favor, me diga qual tarefa você quer verificar o prazo ou use o painel para ver todas as datas.',
    disciplina: 'Qual disciplina você está buscando? Posso listar suas tarefas por disciplina.',
    default: 'Desculpe, não entendi. Tente usar palavras como "tarefa", "prazo" ou "disciplina".'
};

// Socket.IO
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, 'secret_key');
            socket.user = decoded;
            socket.join(`room:${decoded.username}`);
            if (decoded.role === 'admin') {
                socket.join('room:admin');
            }
            socket.emit('authenticated');
        } catch (error) {
            socket.emit('error', 'Autenticação falhou');
            socket.disconnect();
        }
    });

    socket.on('chatMessage', (data) => {
        if (!socket.user) {
            socket.emit('error', 'Usuário não autenticado');
            return;
        }

        const chat = {
            id: String(db.chats.length + 1),
            from: socket.user.username,
            to: data.to,
            message: data.message,
            timestamp: data.timestamp || new Date().toISOString()
        };
        db.chats.push(chat);
        try {
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        } catch (error) {
            console.error('Erro ao salvar mensagem no db.json:', error.message);
        }

        if (data.to === 'bot') {
            const message = data.message.toLowerCase();
            let response = botResponses.default;
            for (const [key, value] of Object.entries(botResponses)) {
                if (message.includes(key)) {
                    response = value;
                    break;
                }
            }
            const botMessage = {
                id: String(db.chats.length + 1),
                from: 'Bot',
                to: socket.user.username,
                message: response,
                timestamp: new Date().toISOString()
            };
            db.chats.push(botMessage);
            try {
                fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
            } catch (error) {
                console.error('Erro ao salvar mensagem do bot no db.json:', error.message);
            }
            socket.emit('chatMessage', botMessage);
        } else {
            // Enviar mensagem apenas para o destinatário
            io.to(`room:${data.to}`).emit('chatMessage', chat);
        }
    });

    socket.on('requestAdmin', (data) => {
        if (!socket.user) {
            socket.emit('error', 'Usuário não autenticado');
            return;
        }
        io.to('room:admin').emit('requestAdmin', { username: socket.user.username });
    });

    socket.on('join', (room) => {
        socket.join(room);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// Iniciar o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});