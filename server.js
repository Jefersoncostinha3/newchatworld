// Importa os módulos necessários
const express = require('express');
const http = require('http'); // Módulo HTTP do Node.js para criar o servidor
const { Server } = require("socket.io"); // Socket.IO para comunicação em tempo real
const path = require('path'); // Para lidar com caminhos de ficheiros
const mongoose = require('mongoose'); // Para interação com o MongoDB
const dotenv = require('dotenv'); // Para carregar variáveis de ambiente

// Carrega as variáveis de ambiente do ficheiro .env
dotenv.config();

// Certifique-se de que os modelos de usuário e mensagem estão corretos e no caminho certo
const User = require('./models/User'); // Importa o modelo de utilizador
const Message = require('./models/Message'); // Importa o modelo de mensagem

// Configuração básica do Express
const app = express();
const server = http.createServer(app); // Cria um servidor HTTP a partir do app Express

// Configura o Socket.IO para trabalhar com o servidor HTTP
// IMPORTANTE: Adiciona configuração CORS para permitir conexões do frontend (aplicativo Expo)
const io = new Server(server, {
  cors: {
    origin: "*", // Permite todas as origens para desenvolvimento. Em produção, restrinja a domínios específicos (ex: 'https://seu-app-expo.com').
    methods: ["GET", "POST"] // Métodos HTTP permitidos para as requisições CORS
  }
});

// Conexão com o MongoDB
const connectDB = async () => {
    try {
        // Conecta ao MongoDB usando a URI do ambiente
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB conectado com sucesso!');
    } catch (error) {
        console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
        // Sai do processo se a conexão falhar, pois o banco de dados é essencial
        process.exit(1);
    }
};
connectDB(); // Chama a função para conectar ao banco de dados

// Middleware para analisar corpos de requisição JSON
app.use(express.json());
// Servir ficheiros estáticos da pasta 'public' (HTML, CSS, JS do frontend web)
app.use(express.static(path.join(__dirname, 'public')));

// --- Rotas de Autenticação (REST API) ---
// Rota para registar um novo utilizador
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    console.log('Requisição de registo recebida:', { username, password });
    try {
        // Verifica se o nome de utilizador já existe
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ message: 'Nome de utilizador já existe.' });
        }
        // Cria um novo utilizador no banco de dados
        const user = await User.create({ username, password });
        res.status(201).json({ message: 'Utilizador registado com sucesso!', username: user.username });
    } catch (error) {
        console.error('Erro no registo:', error);
        res.status(500).json({ message: 'Erro no servidor ao registar utilizador.' });
    }
});

// Rota para autenticar um utilizador
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Requisição de login recebida:', { username, password });
    try {
        // Encontra o utilizador pelo nome de utilizador
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }
        // Compara a senha fornecida com a senha hash armazenada
        const isMatch = await user.matchPassword(password); // Assume que 'matchPassword' está definido no modelo User
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas.' });
        }
        res.status(200).json({ message: 'Login bem-sucedido!', username: user.username });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ message: 'Erro no servidor ao fazer login.' });
    }
});

// --- Lógica do Chat (Socket.IO) ---
const users = {}; // Armazena o mapeamento socket.id -> username
const rooms = { 'público': new Set() }; // Armazena roomName -> Set de socket.ids (todas as salas)

// Função auxiliar para emitir a lista de salas ativas para todos os clientes
async function emitActiveRooms() {
    const activeRooms = {};
    for (const roomName in rooms) {
        // Filtra salas que têm pelo menos um utilizador conectado
        if (rooms[roomName].size > 0) {
            // Mapeia os IDs dos sockets para os nomes de utilizador para exibir
            activeRooms[roomName] = Array.from(rooms[roomName]).map(socketId => users[socketId]).filter(Boolean); // Filtra valores nulos/indefinidos
        }
    }
    // Emite a lista atualizada de salas para todos os clientes conectados
    io.emit('active-rooms-list', activeRooms);
}

// Lógica de conexão do Socket.IO
io.on('connection', (socket) => {
    console.log('Um utilizador se conectou:', socket.id);

    // Evento para definir o nome de utilizador para um socket
    socket.on('set-username', (username) => {
        users[socket.id] = username; // Associa o socket.id ao nome de utilizador
        console.log(`Utilizador ${username} definido para socket ${socket.id}`);
        // O cliente então emitirá 'join-room' após definir o nome de utilizador
        emitActiveRooms(); // Atualiza a lista de salas para todos
    });

    // Evento quando um utilizador se desconecta
    socket.on('disconnect', () => {
        const username = users[socket.id]; // Obtém o nome de utilizador antes de o remover
        console.log(`Utilizador ${username || socket.id} desconectou.`);

        // Remove o utilizador de todas as salas em que ele estava
        for (const roomName in rooms) {
            if (rooms[roomName].has(socket.id)) {
                rooms[roomName].delete(socket.id);
                // Notifica a sala que o utilizador desconectou, se houver um nome de utilizador
                if (username) {
                    io.to(roomName).emit('user-disconnected', username);
                }
            }
        }
        delete users[socket.id]; // Remove o utilizador do mapeamento global
        emitActiveRooms(); // Atualiza a lista de salas após a desconexão
    });

    // Evento para receber e retransmitir mensagens de chat
    socket.on('chat-message', async (msg) => {
        const { username, room, message, audio, image, type } = msg;
        const normalizedRoomName = room.toLowerCase(); // Normaliza o nome da sala para minúsculas

        // Salvar a mensagem no banco de dados
        try {
            const newMessage = new Message({
                username,
                room: normalizedRoomName,
                type,
                timestamp: new Date()
            });

            if (type === 'text') {
                newMessage.message = message;
            } else if (type === 'audio') {
                newMessage.audio = audio;
            } else if (type === 'image') {
                newMessage.image = image;
                if (message) { // Permite texto junto com a imagem (opcional)
                    newMessage.message = message;
                }
            }

            await newMessage.save(); // Salva a mensagem no MongoDB
            console.log('Mensagem salva no DB:', newMessage);

            // Reemite a mensagem para a sala específica onde ela foi enviada
            io.to(normalizedRoomName).emit('chat-message', newMessage);
        } catch (error) {
            console.error('Erro ao salvar ou emitir mensagem:', error);
            // Envia um erro de volta apenas para o remetente
            socket.emit('room-error', 'Erro ao enviar mensagem.');
        }
    });

    // Evento para criar uma nova sala
    socket.on('create-room', async (roomName, username) => {
        const normalizedRoomName = roomName.toLowerCase();
        if (rooms[normalizedRoomName]) {
            socket.emit('room-error', `A sala "${roomName}" já existe.`);
            return;
        }

        rooms[normalizedRoomName] = new Set(); // Cria um novo conjunto para a sala
        console.log(`Sala "${roomName}" criada por ${username}.`);
        socket.emit('room-created', roomName); // Informa o criador que a sala foi criada
        // O cliente então emitirá um 'join-room' para essa nova sala
        await emitActiveRooms(); // Atualiza a lista de salas para todos os clientes
    });

    // Evento para um utilizador entrar numa sala
    socket.on('join-room', async (roomName, username) => {
        const normalizedRoomName = roomName.toLowerCase();

        // Primeiro, verifique se a sala existe. Se não, crie-a.
        if (!rooms[normalizedRoomName]) {
            rooms[normalizedRoomName] = new Set();
            console.log(`Sala "${roomName}" não existia e foi criada por ${username} ao entrar.`);
            // Opcional: emitir um evento 'room-created' para outros clientes também, se desejar notificação global
            // io.emit('room-created', roomName);
        }

        // Deixar todas as salas antigas, exceto o próprio socket.id (que é uma "sala" privada)
        for (const room of socket.rooms) {
            if (room !== socket.id) { // Não queremos sair do próprio socket.id
                socket.leave(room);
                const currentRoomSet = rooms[room];
                if (currentRoomSet) {
                    currentRoomSet.delete(socket.id); // Remove o socket.id do conjunto da sala anterior
                }
            }
        }

        // Adicionar o utilizador ao mapeamento global (se ainda não estiver lá, ou atualizar)
        users[socket.id] = username;
        
        // Junta o socket à nova sala
        socket.join(normalizedRoomName);
        rooms[normalizedRoomName].add(socket.id); // Adiciona o socket.id ao conjunto da nova sala

        console.log(`Utilizador ${username} entrou na sala: ${normalizedRoomName}`);
        socket.emit('room-joined', roomName); // Envia o nome ORIGINAL da sala para o frontend (para exibir)
        io.to(normalizedRoomName).emit('user-connected', username); // Emite para a sala que um novo utilizador se conectou

        // Carrega as últimas 50 mensagens antigas para a sala recém-entrada
        const historicalMessages = await Message.find({ room: normalizedRoomName })
                                                    .sort({ timestamp: 1 }) // Ordena do mais antigo para o mais novo
                                                    .limit(50); // Limita às últimas 50 mensagens
        socket.emit('previous-messages', historicalMessages); // Envia as mensagens históricas para o cliente

        await emitActiveRooms(); // Atualiza a lista de salas para todos os clientes
    });

    // Evento para um cliente solicitar a lista de salas ativas
    socket.on('request-active-rooms', async () => {
        await emitActiveRooms();
    });
});

// Define a porta em que o servidor irá escutar.
// process.env.PORT é uma variável de ambiente que o Render.com injeta.
// Se não estiver definida (ex: ao rodar localmente), usa a porta 3000.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
