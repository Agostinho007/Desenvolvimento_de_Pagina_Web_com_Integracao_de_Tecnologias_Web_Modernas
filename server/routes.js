const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

router.get('/tarefas', async (req, res) => {
  try {
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    let tarefas = JSON.parse(data);
    if (req.query.prioridade && req.query.prioridade !== 'todas') {
      tarefas = tarefas.filter(t => t.prioridade === req.query.prioridade);
    }
    res.json(tarefas);
  } catch (err) {
    console.error('Erro ao ler tarefas:', err);
    res.status(500).json({ error: 'Erro ao carregar tarefas' });
  }
});

router.post('/tarefas', async (req, res) => {
  try {
    const { titulo, prioridade, prazo, descricao } = req.body;
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    const tarefas = JSON.parse(data);
    const novaTarefa = {
      id: tarefas.length ? Math.max(...tarefas.map(t => t.id)) + 1 : 1,
      titulo,
      prioridade,
      prazo,
      descricao: descricao || ''
    };
    tarefas.push(novaTarefa);
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.status(201).json(novaTarefa);
  } catch (err) {
    console.error('Erro ao adicionar tarefa:', err);
    res.status(500).json({ error: 'Erro ao adicionar tarefa' });
  }
});

router.put('/tarefas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, prioridade, prazo, descricao } = req.body;
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    let tarefas = JSON.parse(data);
    const index = tarefas.findIndex(t => t.id == id);
    if (index === -1) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    tarefas[index] = { ...tarefas[index], titulo, prioridade, prazo, descricao: descricao || '' };
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.json(tarefas[index]);
  } catch (err) {
    console.error('Erro ao atualizar tarefa:', err);
    res.status(500).json({ error: 'Erro ao atualizar tarefa' });
  }
});

router.delete('/tarefas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(path.join(__dirname, 'tarefas.json'), 'utf8');
    let tarefas = JSON.parse(data);
    tarefas = tarefas.filter(t => t.id != id);
    await fs.writeFile(path.join(__dirname, 'tarefas.json'), JSON.stringify(tarefas, null, 2));
    res.status(204).send();
  } catch (err) {
    console.error('Erro ao excluir tarefa:', err);
    res.status(500).json({ error: 'Erro ao excluir tarefa' });
  }
});

module.exports = router;