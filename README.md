# Sistema de Tarefas Acadêmicas

## Descrição
O Sistema de Tarefas Acadêmicas é uma aplicação web que permite a alunos gerenciar tarefas acadêmicas e a administradores supervisionar o sistema. Inclui funcionalidades como criação e priorização de tarefas, chat com bot e administradores, notificações em tempo real, e relatórios detalhados.

## Tecnologias
- **Front-end**: HTML5, CSS3 (Bootstrap), JavaScript
- **Back-end**: Node.js, Express, Socket.IO, JWT
- **Armazenamento**: JSON (`server/db.json`)

## Instalação
1. Clone o repositório:
   ```bash
   git clone https://github.com/Agostinho007/Desenvolvimento_de_Pagina_Web_com_Integracao_de_Tecnologias_Web_Modernas
   ```
2. Navegue até o diretório:
   ```bash
   cd Desenvolvimento_de_Pagina_Web_com_Integracao_de_Tecnologias_Web_Modernas
   ```
3. Instale as dependências (Possuir as versões atuais ou recentes de node.js e npm instaladas):
   ```bash
   npm install
   ```
4. Inicie o servidor:
   ```bash
   cd server
   node app.js
   ```
   Acesse em `http://localhost:3000`.

## Funcionalidades
### Para Alunos:
- Login e cadastro.
- Gerenciamento de tarefas (criar, editar, filtrar por status).
- Tarefas priorizadas (ordenadas por prioridade e data).
- Relatórios por disciplina e tipo de tarefa.
- Chat com bot (até 5 interações) e administradores.
- Notificações de alterações em tarefas.

### Para Administradores:
- Gerenciamento de tarefas e administradores.
- Relatórios de desempenho, tipos de tarefa, disciplinas e tarefas por mês.
- Suporte via chat em tempo real.

### Comuns:
- Interface responsiva com Bootstrap e Cascading Style Sheet Puro.
- Comunicação em tempo real via WebSockets.

## Hospedagem
A aplicação está hospedada no Render. Acesse em: https://desenvolvimento-de-pagina-web-com-xszk.onrender.com

## Contribuição
1. Faça um fork do projeto.
2. Crie uma branch para sua feature:
   ```bash
   git checkout -b feature/nova-funcionalidade
   ```
3. Commit suas alterações:
   ```bash
   git commit -m 'Adiciona nova funcionalidade'
   ```
4. Push para a branch:
   ```bash
   git push origin feature/nova-funcionalidade
   ```
5. Abra um Pull Request.

## Licença
MIT