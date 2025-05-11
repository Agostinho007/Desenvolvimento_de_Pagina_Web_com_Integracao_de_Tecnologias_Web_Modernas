const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const routes = require('./routes');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  reconnection: false // Desativar reconexões automáticas
});

// Configurar timeouts para Render
server.keepAliveTimeout = 120000; // 120 segundos
server.headersTimeout = 120000; // 120 segundos

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/home.html'));
});

app.get('/chat_gerente.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/chat_gerente.html'));
});

// Rota para obter dados do perfil
app.get('/api/perfil/:nome', async (req, res) => {
  const { nome } = req.params;
  try {
    const data = await fs.readFile(path.join(__dirname, 'perfis.json'), 'utf8');
    const perfis = JSON.parse(data);
    const perfil = perfis.find(p => p.nome.toLowerCase() === nome.toLowerCase());
    if (perfil) {
      res.json({ success: true, perfil });
    } else {
      res.status(404).json({ success: false, error: 'Perfil não encontrado' });
    }
  } catch (err) {
    console.error('Erro ao ler perfis.json:', err);
    res.status(500).json({ success: false, error: err.code === 'ENOENT' ? 'Arquivo de perfis não encontrado' : 'Erro interno' });
  }
});

// Rota para atualizar a bio
app.post('/api/perfil/:nome/bio', async (req, res) => {
  const { nome } = req.params;
  const { bio } = req.body;
  try {
    const data = await fs.readFile(path.join(__dirname, 'perfis.json'), 'utf8');
    let perfis = JSON.parse(data);
    const perfilIndex = perfis.findIndex(p => p.nome.toLowerCase() === nome.toLowerCase());
    if (perfilIndex === -1) {
      res.status(404).json({ success: false, error: 'Perfil não encontrado' });
      return;
    }
    perfis[perfilIndex].bio = bio;
    await fs.writeFile(path.join(__dirname, 'perfis.json'), JSON.stringify(perfis, null, 2));
    res.json({ success: true, perfil: perfis[perfilIndex] });
  } catch (err) {
    console.error('Erro ao atualizar perfis.json:', err);
    res.status(500).json({ success: false, error: err.code === 'ENOENT' ? 'Arquivo de perfis não encontrado' : 'Erro interno' });
  }
});

app.use('/api', routes);

// Validar PIN do gerente
app.post('/api/validar-pin', async (req, res) => {
  const { pin } = req.body;
  try {
    const data = await fs.readFile(path.join(__dirname, 'gerente.json'), 'utf8');
    const config = JSON.parse(data);
    if (pin === config.pin) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'PIN inválido' });
    }
  } catch (err) {
    console.error('Erro ao validar PIN:', err);
    res.status(500).json({ success: false, error: err.code === 'ENOENT' ? 'Arquivo de configuração não encontrado' : 'Erro interno' });
  }
});

// Mapeamento de intenções
const intencoes = {
  saudacao: {
    palavras: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite'],
    responder: () => 'Olá! Como posso ajudar com suas tarefas hoje?'
  },
  apresentacao: {
    palavras: ['quem', 'você', 'assistente'],
    responder: () => 'Sou o assistente do TaskFlow, criado para gerenciar suas tarefas! Tente "mostre tarefas de hoje" ou "como adicionar tarefa".'
  },
  dicas: {
    palavras: ['como', 'usar', 'dicas', 'ajuda'],
    responder: () => 'No TaskFlow, você pode:\n1. **Cronograma**: Adicione tarefas com título, descrição, prioridade e prazo.\n2. **Chat**: Pergunte sobre tarefas ou peça ajuda.\nTente criar uma tarefa!'
  },
  tarefas: {
    palavras: ['tarefa', 'tarefas', 'lista', 'mostre'],
    responder: async (tokens) => {
      try {
        const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
        const tarefas = JSON.parse(data);
        let filtro = tarefas;

        if (tokens.includes('alta')) filtro = filtro.filter(t => t.prioridade === 'alta');
        else if (tokens.includes('media') || tokens.includes('média')) filtro = filtro.filter(t => t.prioridade === 'media');
        else if (tokens.includes('baixa')) filtro = filtro.filter(t => t.prioridade === 'baixa');

        if (tokens.includes('hoje')) {
          const hoje = new Date().toISOString().split('T')[0];
          filtro = filtro.filter(t => t.prazo.startsWith(hoje));
        }

        return filtro.length === 0 ? 'Nenhuma tarefa encontrada.' :
          filtro.map(t => `${t.titulo} (${t.prioridade}, Prazo: ${t.prazo}, Descrição: ${t.descricao || 'Sem descrição'})`).join('\n');
      } catch (err) {
        console.error('Erro ao consultar tarefas:', err);
        return 'Erro ao consultar tarefas.';
      }
    }
  }
};

// Processar mensagens do chat normal
async function responderMensagem(mensagem, contador, nome) {
  const tokens = mensagem.toLowerCase().trim().split(/\s+/);
  const intencoesDetectadas = [];

  for (const [nome, { palavras, responder }] of Object.entries(intencoes)) {
    if (palavras.some(p => tokens.includes(p))) intencoesDetectadas.push({ nome, responder });
  }

  if (!intencoesDetectadas.length) return 'Não entendi. Tente "mostre tarefas de hoje" ou "oi".';

  const prioridadeIntencoes = ['tarefas', 'dicas', 'apresentacao', 'saudacao'];
  const intencaoPrincipal = intencoesDetectadas.sort((a, b) => prioridadeIntencoes.indexOf(a.nome) - prioridadeIntencoes.indexOf(b.nome))[0];

  try {
    return await intencaoPrincipal.responder(tokens);
  } catch (err) {
    console.error('Erro ao gerar resposta:', err);
    return 'Erro ao processar sua pergunta.';
  }
}

// Gerenciamento de salas e usuários
const usuariosFinalizados = new Map();
const usuariosEmChat = new Map();
let socketGerente = null;
const mensagensEnviadas = new Map();

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.on('registrar_nome', (nome) => {
    socket.nome = nome;
    console.log(`Nome registrado: ${socket.id} -> ${nome}`);
  });

  socket.on('mensagem', async (data) => {
    const { mensagem, contador, nome } = data;
    if (usuariosEmChat.has(socket.id)) {
      socket.emit('resposta', 'Você está em um chat com o gerente. Use o chat bidirecional.');
      return;
    }
    const resposta = await responderMensagem(mensagem, contador, nome);
    socket.emit('resposta', resposta);
    if (contador >= 4) {
      if (!usuariosEmChat.has(socket.id)) {
        usuariosFinalizados.set(socket.id, { nome, socket });
        if (socketGerente) {
          socketGerente.emit('atualizar_usuarios', Array.from(usuariosFinalizados.entries())
            .map(([id, { nome }]) => ({ id, nome })));
        }
      }
    }
  });

  socket.on('entrar_chat_bidirecional', () => {
    if (usuariosEmChat.has(socket.id)) {
      socket.emit('chat_status', 'Você está em um chat com o gerente. Não pode iniciar outro chat.');
      socket.emit('bloquear_chat_bidirecional', true);
      console.log(`Usuário ${socket.id} bloqueado de chat bidirecional: já em chat com gerente`);
      return;
    }
    let salaId = null;
    let salaEncontrada = false;

    for (const [id, usuarios] of salas) {
      if (usuarios.length < 2 && !id.startsWith('gerente-')) {
        salaId = id;
        usuarios.push(socket);
        salaEncontrada = true;
        break;
      }
    }

    if (!salaEncontrada) {
      salaId = `sala-${Date.now()}`;
      salas.set(salaId, [socket]);
    }

    socket.join(salaId);
    usuariosEmChat.set(socket.id, salaId);
    const usuariosNaSala = salas.get(salaId);
    if (usuariosNaSala.length === 1) {
      socket.emit('chat_status', 'Aguardando outro usuário...');
    } else if (usuariosNaSala.length === 2) {
      io.to(salaId).emit('chat_status', 'Chat bidirecional iniciado!');
      io.to(salaId).emit('bloquear_chat_bidirecional', false);
    }

    socket.on('mensagem_chat', (mensagem) => {
      const mensagemId = uuidv4();
      if (mensagensEnviadas.has(mensagemId)) return;
      mensagensEnviadas.set(mensagemId, true);
      socket.to(salaId).emit('mensagem_chat', { id: socket.id, nome: socket.nome || 'Anônimo', mensagem, mensagemId });
      socket.emit('mensagem_chat', { id: socket.id, nome: socket.nome || 'Anônimo', mensagem, mensagemId }); // Retransmitir para o remetente
      console.log(`Mensagem na sala ${salaId} de ${socket.nome}: ${mensagem} (ID: ${mensagemId})`);
    });
  });

  socket.on('gerente_conectado', () => {
    socketGerente = socket;
    socket.emit('atualizar_usuarios', Array.from(usuariosFinalizados.entries())
      .map(([id, { nome }]) => ({ id, nome })));
    console.log('Gerente conectado:', socket.id);
  });

  socket.on('selecionar_usuario', (userId) => {
    const usuario = usuariosFinalizados.get(userId);
    if (!usuario) {
      socket.emit('chat_status', 'Usuário não disponível.');
      console.log(`Usuário ${userId} não encontrado.`);
      return;
    }
    usuariosFinalizados.delete(userId);
    const salaId = `gerente-${socket.id}-${userId}`;
    socket.join(salaId);
    usuario.socket.join(salaId);
    usuariosEmChat.set(userId, salaId);
    usuariosEmChat.set(socket.id, salaId);
    socket.salaGerente = salaId;
    usuario.socket.salaGerente = salaId;
    io.to(salaId).emit('chat_status', `Chat iniciado com ${usuario.nome}.`);
    usuario.socket.emit('bloquear_chat_bidirecional', true);
    console.log(`Chat iniciado na sala ${salaId} com ${usuario.nome}`);

    socket.removeAllListeners('mensagem_chat');
    usuario.socket.removeAllListeners('mensagem_chat');

    socket.on('mensagem_chat', (mensagem) => {
      const mensagemId = uuidv4();
      if (mensagensEnviadas.has(mensagemId)) {
        console.log(`Mensagem duplicada descartada no servidor: ${mensagemId}`);
        return;
      }
      mensagensEnviadas.set(mensagemId, true);
      io.to(salaId).emit('mensagem_chat', { id: socket.id, nome: 'Gerente', mensagem, mensagemId });
      console.log(`Mensagem na sala ${salaId} de Gerente: ${mensagem} (ID: ${mensagemId})`);
    });

    usuario.socket.on('mensagem_chat', (mensagem) => {
      const mensagemId = uuidv4();
      if (mensagensEnviadas.has(mensagemId)) {
        console.log(`Mensagem duplicada descartada no servidor: ${mensagemId}`);
        return;
      }
      mensagensEnviadas.set(mensagemId, true);
      io.to(salaId).emit('mensagem_chat', { id: userId, nome: usuario.nome, mensagem, mensagemId });
      console.log(`Mensagem na sala ${salaId} de ${usuario.nome}: ${mensagem} (ID: ${mensagemId})`);
    });

    if (socketGerente) {
      socketGerente.emit('atualizar_usuarios', Array.from(usuariosFinalizados.entries())
        .map(([id, { nome }]) => ({ id, nome })));
    }
  });

  socket.on('sair_chat', () => {
    const salaId = usuariosEmChat.get(socket.id);
    if (salaId) {
      io.to(salaId).emit('chat_status', 'Chat encerrado.');
      io.to(salaId).emit('bloquear_chat_bidirecional', false);
      const usuariosNaSala = salas.get(salaId);
      if (usuariosNaSala) {
        usuariosNaSala.forEach(s => {
          s.leave(salaId);
          usuariosEmChat.delete(s.id);
          s.removeAllListeners('mensagem_chat');
          if (s !== socketGerente && !usuariosFinalizados.has(s.id)) {
            usuariosFinalizados.set(s.id, { nome: s.nome, socket: s });
          }
        });
        salas.delete(salaId);
      } else if (salaId.startsWith('gerente-')) {
        socket.leave(salaId);
        usuariosEmChat.delete(socket.id);
        socket.removeAllListeners('mensagem_chat');
        const userId = salaId.split('-')[2];
        const usuario = io.sockets.sockets.get(userId);
        if (usuario) {
          usuario.leave(salaId);
          usuariosEmChat.delete(userId);
          usuario.removeAllListeners('mensagem_chat');
          if (!usuariosFinalizados.has(userId)) {
            usuariosFinalizados.set(userId, { nome: usuario.nome || 'Anônimo', socket: usuario });
          }
        }
      }
      if (socketGerente) {
        socketGerente.emit('atualizar_usuarios', Array.from(usuariosFinalizados.entries())
          .map(([id, { nome }]) => ({ id, nome })));
      }
      console.log(`Chat encerrado na sala ${salaId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
    usuariosFinalizados.delete(socket.id);
    const salaId = usuariosEmChat.get(socket.id);
    if (salaId) {
      io.to(salaId).emit('chat_status', 'Outro usuário desconectado.');
      io.to(salaId).emit('bloquear_chat_bidirecional', false);
      const usuariosNaSala = salas.get(salaId);
      if (usuariosNaSala) {
        const index = usuariosNaSala.indexOf(socket);
        if (index !== -1) {
          usuariosNaSala.splice(index, 1);
          if (usuariosNaSala.length === 0) {
            salas.delete(salaId);
          } else {
            usuariosNaSala.forEach(s => {
              usuariosEmChat.delete(s.id);
              s.removeAllListeners('mensagem_chat');
            });
          }
        }
      } else if (salaId.startsWith('gerente-')) {
        const userId = salaId.split('-')[2];
        const usuario = io.sockets.sockets.get(userId);
        if (usuario) {
          usuario.leave(salaId);
          usuariosEmChat.delete(userId);
          usuario.removeAllListeners('mensagem_chat');
          if (!usuariosFinalizados.has(userId)) {
            usuariosFinalizados.set(userId, { nome: usuario.nome || 'Anônimo', socket: usuario });
          }
        }
        usuariosEmChat.delete(socket.id);
        socket.removeAllListeners('mensagem_chat');
      }
    }
    if (socket === socketGerente) {
      socketGerente = null;
      console.log('Gerente desconectado');
    }
    if (socketGerente) {
      socketGerente.emit('atualizar_usuarios', Array.from(usuariosFinalizados.entries())
        .map(([id, { nome }]) => ({ id, nome })));
    }
  });

  socket.on('testar_notificacao', (data) => {
    io.emit('testar_notificacao', data);
  });
});

const salas = new Map();

// Notificações
setInterval(async () => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    const tarefas = JSON.parse(data);
    const agora = new Date();
    const trintaMinutosDepois = new Date(agora.getTime() + 30 * 60 * 1000);
    tarefas.forEach(tarefa => {
      const prazo = new Date(tarefa.prazo);
      if (prazo >= agora && prazo <= trintaMinutosDepois) {
        io.emit('notificacao', { mensagem: `Tarefa "${tarefa.titulo}" vence em 30 minutos!` });
      }
    });
  } catch (err) {
    console.error('Erro ao verificar tarefas:', err);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});