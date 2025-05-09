const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  console.log('Servindo home.html para rota /');
  res.sendFile(path.join(__dirname, '../public/home.html'));
});

app.use('/api', routes);

// Mapeamento de intenções com palavras-chave e funções de resposta
const intencoes = {
  saudacao: {
    palavras: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi'],
    responder: () => 'Olá! Como posso ajudar com suas tarefas hoje?'
  },
  apresentacao: {
    palavras: ['quem', 'você', 'voce', 'assistente', 'o que faz'],
    responder: () => 'Sou o assistente do TaskFlow, criado para ajudar a gerenciar suas tarefas! Posso listar tarefas, dar dicas, ou resolver problemas. Tente algo como "mostre tarefas de hoje" ou "como adicionar tarefa".'
  },
  dicas: {
    palavras: ['como', 'usar', 'funciona', 'dicas', 'ajuda', 'tutorial'],
    responder: () => 'No TaskFlow, você pode:\n1. **Cronograma**: Adicione tarefas com título, prioridade (alta, média, baixa) e prazo. Filtre por prioridade.\n2. **Chat**: Pergunte sobre tarefas (ex.: "tarefas de hoje") ou peça ajuda.\n3. **Perfil**: Atualize sua bio e veja estatísticas.\n4. **Notificações**: Alertas 30 minutos antes do prazo.\nTente criar uma tarefa no Cronograma!'
  },
  problemas: {
    palavras: ['erro', 'não funciona', 'problema', 'bug', 'falha'],
    responder: () => 'Desculpe pelo problema! Tente:\n1. **Chat não responde**: Verifique se o servidor está rodando (`node app.js` em `PRO/server`). Recarregue a página.\n2. **Tarefas não aparecem**: Confirme que `tarefas.json` existe em `PRO/server`.\n3. **Erro ao carregar**: Verifique os arquivos HTML em `PRO/public`.\nSe persistir, envie a mensagem de erro.'
  },
  tarefas: {
    palavras: ['tarefa', 'tarefas', 'lista', 'mostre', 'quais'],
    responder: async (tokens) => {
      try {
        const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
        const tarefas = JSON.parse(data);
        let filtro = tarefas;

        if (tokens.includes('alta') || tokens.includes('urgente') || tokens.includes('importante')) {
          filtro = filtro.filter(t => t.prioridade === 'alta');
        } else if (tokens.includes('media') || tokens.includes('média')) {
          filtro = filtro.filter(t => t.prioridade === 'media');
        } else if (tokens.includes('baixa')) {
          filtro = filtro.filter(t => t.prioridade === 'baixa');
        }

        if (tokens.includes('hoje') || tokens.includes('today')) {
          const hoje = new Date().toISOString().split('T')[0];
          filtro = filtro.filter(t => t.prazo.startsWith(hoje));
        }

        if (tokens.includes('vence') || tokens.includes('vencem') || tokens.includes('próxima') || tokens.includes('proxima')) {
          const agora = new Date();
          const trintaMinutosDepois = new Date(agora.getTime() + 30 * 60 * 1000);
          filtro = filtro.filter(t => {
            const prazo = new Date(t.prazo);
            return !isNaN(prazo) && prazo >= agora && prazo <= trintaMinutosDepois;
          });
        }

        if (filtro.length === 0) {
          return 'Nenhuma tarefa encontrada com esses critérios.';
        }
        return filtro.map(t => `${t.titulo} (${t.prioridade}, Prazo: ${t.prazo})`).join('\n');
      } catch (err) {
        console.error('Erro ao consultar tarefas:', err);
        return 'Erro ao consultar tarefas. Verifique se `tarefas.json` existe.';
      }
    }
  },
  adicionar: {
    palavras: ['adicionar', 'nova', 'criar', 'tarefa'],
    responder: () => 'Para adicionar uma tarefa:\n1. Acesse o Cronograma.\n2. Preencha título, prioridade (alta, média, baixa) e prazo.\n3. Clique em "Adicionar".\nQuer que eu te guie com um exemplo?'
  },
  priorizar: {
    palavras: ['priorizar', 'prioridade', 'organizar', 'urgente'],
    responder: () => 'Para priorizar, marque tarefas como "alta" no Cronograma. Use o filtro de prioridade para focar nas mais importantes. Quer ver tarefas de alta prioridade agora?'
  },
  fazer_hoje: {
    palavras: ['fazer', 'hoje', 'agora', 'tarefa hoje'],
    responder: async (tokens) => {
      try {
        const hoje = new Date().toISOString().split('T')[0];
        const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
        const tarefas = JSON.parse(data);
        let urgentes = tarefas.filter(t => t.prazo.startsWith(hoje));
        if (tokens.includes('alta') || tokens.includes('urgente')) {
          urgentes = urgentes.filter(t => t.prioridade === 'alta');
        }
        return urgentes.length
          ? `Priorize hoje:\n${urgentes.map(t => `${t.titulo} (${t.prioridade})`).join('\n')}`
          : 'Nenhuma tarefa urgente hoje. Quer adicionar uma nova tarefa?';
      } catch (err) {
        console.error('Erro ao consultar tarefas:', err);
        return 'Erro ao consultar tarefas. Verifique se `tarefas.json` existe.';
      }
    }
  }
};

// Função para processar mensagens e gerar respostas
async function responderMensagem(mensagem, contador) {
  console.log('Mensagem recebida:', mensagem, 'Contador:', contador);
  if (contador >= 5) {
    return 'Limite de 5 respostas atingido. Deseja conversar com outro usuário? Clique em "Iniciar Chat Bidirecional" no chat.';
  }
  const tokens = mensagem.toLowerCase().trim().split(/\s+/);
  const intencoesDetectadas = [];

  for (const [nome, { palavras, responder }] of Object.entries(intencoes)) {
    if (palavras.some(p => tokens.includes(p))) {
      intencoesDetectadas.push({ nome, responder });
    }
  }

  if (intencoesDetectadas.length === 0) {
    return 'Não entendi sua pergunta. Tente algo como "mostre tarefas de hoje", "como adicionar tarefa", ou "oi".';
  }

  const prioridadeIntencoes = ['tarefas', 'fazer_hoje', 'adicionar', 'priorizar', 'dicas', 'problemas', 'apresentacao', 'saudacao'];
  const intencaoPrincipal = intencoesDetectadas.sort((a, b) => {
    return prioridadeIntencoes.indexOf(a.nome) - prioridadeIntencoes.indexOf(b.nome);
  })[0];

  try {
    const resposta = await intencaoPrincipal.responder(tokens);
    console.log('Resposta gerada:', resposta);
    return resposta;
  } catch (err) {
    console.error('Erro ao gerar resposta:', err);
    return 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.';
  }
}

// Gerenciamento de salas para chat bidirecional
const salas = new Map(); // Mapa de salas: { salaId: [{socket, nome, isAdmin}] }

io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  // Chat com assistente
  socket.on('mensagem', async (data) => {
    const { mensagem, contador } = data;
    const resposta = await responderMensagem(mensagem, contador);
    socket.emit('resposta', resposta);
  });

  // Chat bidirecional
  socket.on('entrar_chat_bidirecional', (nome) => {
    console.log(`Cliente ${socket.id} solicitou chat bidirecional com nome: ${nome}`);
    let salaId = null;
    let salaEncontrada = false;

    // Validar nome
    const nomeLimpo = nome && nome.trim() ? nome.trim() : `Usuário-${Math.floor(Math.random() * 1000)}`;

    // Procurar sala com menos de 2 usuários
    for (const [id, usuarios] of salas) {
      if (usuarios.length < 2) {
        salaId = id;
        usuarios.push({ socket, nome: nomeLimpo, isAdmin: false });
        salaEncontrada = true;
        break;
      }
    }

    // Criar nova sala se necessário
    if (!salaEncontrada) {
      salaId = `sala-${Date.now()}`;
      salas.set(salaId, [{ socket, nome: `${nomeLimpo} (Gerente)`, isAdmin: true }]);
    }

    socket.join(salaId);
    console.log(`Cliente ${socket.id} (${nomeLimpo}) entrou na sala ${salaId}, admin: ${salas.get(salaId).find(u => u.socket === socket).isAdmin}`);

    // Notificar status
    const usuariosNaSala = salas.get(salaId);
    if (usuariosNaSala.length === 1) {
      socket.emit('chat_status', 'Aguardando outro usuário...');
    } else if (usuariosNaSala.length === 2) {
      io.to(salaId).emit('chat_status', 'Chat bidirecional iniciado! Digite sua mensagem.');
      io.to(salaId).emit('usuarios', usuariosNaSala.map(u => ({ nome: u.nome, isAdmin: u.isAdmin })));
    }

    // Receber e enviar mensagens na sala
    socket.on('mensagem_chat', (mensagem) => {
      const usuario = usuariosNaSala.find(u => u.socket === socket);
      console.log(`Mensagem na sala ${salaId} de ${usuario.nome}: ${mensagem}`);
      io.to(salaId).emit('mensagem_chat', { nome: usuario.nome, mensagem, isAdmin: usuario.isAdmin });
    });

    // Limpar sala quando o cliente desconectar
    socket.on('disconnect', () => {
      console.log(`Cliente ${socket.id} desconectado`);
      if (salaId && salas.has(salaId)) {
        const usuarios = salas.get(salaId);
        const index = usuarios.findIndex(u => u.socket === socket);
        if (index !== -1) {
          const usuario = usuarios[index];
          usuarios.splice(index, 1);
          if (usuarios.length === 0) {
            salas.delete(salaId);
          } else {
            io.to(salaId).emit('chat_status', `Usuário ${usuario.nome} desconectado. Aguardando novo usuário...`);
            io.to(salaId).emit('usuarios', usuarios.map(u => ({ nome: u.nome, isAdmin: u.isAdmin })));
          }
        }
      }
    });
  });

  // Notificações
  socket.on('testar_notificacao', (data) => {
    io.emit('testar_notificacao', data);
  });
});

// Verifica tarefas próximas a cada minuto
setInterval(async () => {
  try {
    console.log('Verificando tarefas próximas...');
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    const tarefas = JSON.parse(data);
    if (!tarefas.length) {
      console.log('Nenhuma tarefa encontrada em tarefas.json');
      return;
    }
    console.log(`Tarefas encontradas: ${tarefas.length}`);
    const agora = new Date();
    const trintaMinutosDepois = new Date(agora.getTime() + 30 * 60 * 1000);
    console.log(`Janela de verificação: ${agora.toISOString()} até ${trintaMinutosDepois.toISOString()}`);
    tarefas.forEach(tarefa => {
      try {
        const prazoStr = tarefa.prazo.replace('T', ' ').slice(0, 16);
        const prazo = new Date(prazoStr);
        if (isNaN(prazo)) {
          console.error(`Formato de prazo inválido para tarefa "${tarefa.titulo}": ${tarefa.prazo}`);
          return;
        }
        console.log(`Tarefa "${tarefa.titulo}" - Prazo: ${prazo.toISOString()}`);
        if (prazo >= agora && prazo <= trintaMinutosDepois) {
          console.log(`Emitindo notificação para tarefa "${tarefa.titulo}" (Prazo: ${tarefa.prazo})`);
          io.emit('notificacao', { mensagem: `Tarefa "${tarefa.titulo}" vence em 30 minutos!` });
        }
      } catch (err) {
        console.error(`Erro ao processar prazo da tarefa "${tarefa.titulo}":`, err);
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