const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

router.get('/tarefas', async (req, res) => {
  try {
    const { prioridade } = req.query;
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    let tarefas = JSON.parse(data);
    if (prioridade) {
      tarefas = tarefas.filter(t => t.prioridade === prioridade);
    }
    res.json(tarefas);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar tarefas' });
  }
});

router.post('/tarefas', async (req, res) => {
  try {
    const { titulo, descricao, prioridade, prazo } = req.body;
    if (!titulo || !prioridade || !prazo) {
      return res.status(400).json({ error: 'Título, prioridade e prazo são obrigatórios' });
    }
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    const tarefas = JSON.parse(data);
    const novaTarefa = {
      id: tarefas.length ? Math.max(...tarefas.map(t => t.id)) + 1 : 1,
      titulo,
      descricao: descricao || '',
      prioridade,
      prazo
    };
    tarefas.push(novaTarefa);
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.json(novaTarefa);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao adicionar tarefa' });
  }
});

router.put('/tarefas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { titulo, descricao, prioridade, prazo } = req.body;
    if (!titulo || !prioridade || !prazo) {
      return res.status(400).json({ error: 'Título, prioridade e prazo são obrigatórios' });
    }
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    const tarefas = JSON.parse(data);
    const index = tarefas.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    tarefas[index] = { id, titulo, descricao: descricao || '', prioridade, prazo };
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.json(tarefas[index]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao editar tarefa' });
  }
});

router.delete('/tarefas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    let tarefas = JSON.parse(data);
    const index = tarefas.findIndex(t => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    tarefas = tarefas.filter(t => t.id !== id);
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.json({ message: 'Tarefa excluída' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir tarefa' });
  }
});

router.get('/perfil', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'perfis.json'), 'utf8');
    const perfis = JSON.parse(data);
    if (!perfis.length) {
      return res.status(404).json({ error: 'Nenhum perfil encontrado' });
    }
    res.json(perfis[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar perfil' });
  }
});

router.post('/perfil', async (req, res) => {
  try {
    const { bio } = req.body;
    if (!bio) {
      console.log('Erro: Bio não fornecida');
      return res.status(400).json({ error: 'Bio é obrigatória' });
    }
    console.log('Bio recebida:', bio);
    const perfisPath = path.join(__dirname, 'perfis.json');
    let perfis = [];
    try {
      const data = await fs.readFile(perfisPath, 'utf8');
      perfis = JSON.parse(data);
    } catch (err) {
      console.log('perfis.json vazio ou não encontrado, inicializando...');
      perfis = [{ id: 1, nome: 'Usuário Teste', bio: 'Bem-vindo ao TaskFlow!', pontos: 0 }];
    }
    if (!perfis.length) {
      perfis = [{ id: 1, nome: 'Usuário Teste', bio, pontos: 0 }];
    } else {
      perfis[0].bio = bio;
    }
    await fs.writeFile(perfisPath, JSON.stringify(perfis, null, 2));
    console.log('Bio atualizada em perfis.json:', bio);
    res.json({ message: 'Bio atualizada', bio });
  } catch (err) {
    console.error('Erro ao atualizar bio:', err);
    res.status(500).json({ error: 'Erro ao atualizar bio' });
  }
});

module.exports = router;