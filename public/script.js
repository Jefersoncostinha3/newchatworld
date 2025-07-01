const socket = io();
let myUsername = null;
let mediaRecorder;
let audioChunks = [];
let currentRoom = 'Público'; // Inicialmente na sala padrão 'Público'
let selectedImageBase64 = null; // NOVO: Para armazenar a imagem Base64 selecionada

// Referências aos elementos do DOM
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const mainChatLayout = document.getElementById('main-chat-layout');
const chatMainContent = document.getElementById('chat-main-content');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerError = document.getElementById('register-error');
const startRecordBtn = document.getElementById('start-record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const audioPreview = document.getElementById('audio-preview');
const createRoomInput = document.getElementById('create-room-name');
const joinRoomInput = document.getElementById('join-room-name');
const currentRoomDisplay = document.getElementById('current-room');
const activeRoomsList = document.getElementById('active-rooms-list');
const sendButton = document.getElementById('send-button'); // Certifique-se de ter um id="send-button" no seu HTML
// NOVO: Referências aos elementos de imagem
const imageUploadInput = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const clearImageBtn = document.getElementById('clear-image-btn');


// --- Funções de Utilitário ---
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function addMessage(message) {
    if (!messagesDiv) {
        console.error("messagesDiv não encontrado!");
        return;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('message-item');

    let content = '';

    if (message.type === 'text') {
        content = `<span class="username">${message.username}:</span> <span class="text-message">${message.message}</span>`;
    } else if (message.type === 'audio') {
        // Criar um blob a partir do base64 para o áudio
        const audioBlob = b64toBlob(message.audio, 'audio/webm'); // Supondo webm, ajuste se for diferente
        const audioUrl = URL.createObjectURL(audioBlob);
        content = `<span class="username">${message.username}:</span> <audio controls src="${audioUrl}"></audio>`;
    } else if (message.type === 'image') { // NOVO: Lida com mensagens de imagem
        content = `<span class="username">${message.username}:</span><br><img src="${message.image}" alt="Imagem enviada">`;
        if (message.message) { // Se houver um texto junto com a imagem
            content += `<p class="text-message">${message.message}</p>`;
        }
    }

    messageElement.innerHTML = `
        <div class="message-content">
            ${content}
            <span class="timestamp">${formatTimestamp(message.timestamp)}</span>
        </div>
    `;

    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight; // Rolagem automática
}

function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }

    const blob = new Blob(byteArrays, { type: contentType });
    return blob;
}

function updateActiveRoomsList(rooms) {
    if (activeRoomsList) {
        activeRoomsList.innerHTML = ''; // Limpa a lista existente
        if (Object.keys(rooms).length === 0) {
            const li = document.createElement('li');
            li.textContent = 'Nenhuma sala ativa no momento.';
            activeRoomsList.appendChild(li);
        } else {
            for (const roomName in rooms) {
                const li = document.createElement('li');
                li.textContent = `${roomName} (${rooms[roomName].length} usuários)`;
                li.classList.add('room-item');
                li.dataset.roomName = roomName; // Armazena o nome original da sala
                li.addEventListener('click', () => {
                    socket.emit('join-room', roomName, myUsername);
                });
                activeRoomsList.appendChild(li);
            }
        }
    }
}


// --- Eventos de Autenticação ---
document.getElementById('show-register').addEventListener('click', () => {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
    registerError.textContent = ''; // Limpa erro ao alternar
});

document.getElementById('show-login').addEventListener('click', () => {
    registerContainer.style.display = 'none';
    loginContainer.style.display = 'block';
    loginError.textContent = ''; // Limpa erro ao alternar
});

document.getElementById('register-button').addEventListener('click', async () => {
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value.trim();

    if (!username || !password) {
        registerError.textContent = 'Por favor, preencha todos os campos.';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            alert('Usuário registrado com sucesso! Por favor, faça login.');
            registerContainer.style.display = 'none';
            loginContainer.style.display = 'block';
            loginError.textContent = '';
        } else {
            registerError.textContent = data.message || 'Erro no registro.';
        }
    } catch (error) {
        console.error('Erro de rede ou servidor:', error);
        registerError.textContent = 'Erro ao conectar ao servidor.';
    }
});

document.getElementById('login-button').addEventListener('click', async () => {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!username || !password) {
        loginError.textContent = 'Por favor, preencha todos os campos.';
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
            myUsername = username;
            loginContainer.style.display = 'none';
            mainChatLayout.style.display = 'flex'; // ou 'block', dependendo do seu layout
            document.getElementById('current-user').textContent = `Conectado como: ${myUsername}`;
            socket.emit('join-room', currentRoom, myUsername); // Entra na sala padrão após o login
        } else {
            loginError.textContent = data.message || 'Erro no login.';
        }
    } catch (error) {
        console.error('Erro de rede ou servidor:', error);
        loginError.textContent = 'Erro ao conectar ao servidor.';
    }
});

// --- Lógica do Chat ---

// Função de envio de mensagem (TEXTO OU IMAGEM)
sendButton.addEventListener('click', () => {
    const messageText = messageInput.value.trim();

    if (selectedImageBase64) {
        // Enviar imagem
        socket.emit('chat-message', {
            username: myUsername,
            room: currentRoom,
            type: 'image',
            image: selectedImageBase64,
            message: messageText // Permite enviar texto junto com a imagem (opcional)
        });
        selectedImageBase64 = null; // Limpa a imagem selecionada
        imageUploadInput.value = ''; // Limpa o input de arquivo
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
        messageInput.value = ''; // Limpa o input de texto
    } else if (messageText) {
        // Enviar texto
        socket.emit('chat-message', {
            username: myUsername,
            room: currentRoom,
            type: 'text',
            message: messageText
        });
        messageInput.value = '';
    } else {
        // Caso nenhum texto nem imagem seja selecionado
        alert('Por favor, digite uma mensagem ou selecione uma imagem para enviar.');
    }
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendButton.click(); // Dispara o clique do botão de envio
    }
});


// NOVO: Lidar com a seleção de imagem
imageUploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            selectedImageBase64 = e.target.result; // Armazena a imagem em Base64
            imagePreview.src = selectedImageBase64;
            imagePreviewContainer.style.display = 'flex'; // Mostra a pré-visualização (flex para alinhar)
            messageInput.focus(); // Coloca o foco no input de texto para adicionar uma legenda
        };
        reader.readAsDataURL(file); // Converte o arquivo para Base64
    } else {
        selectedImageBase64 = null;
        imagePreviewContainer.style.display = 'none';
        imagePreview.src = '#';
    }
});

// NOVO: Limpar imagem selecionada
clearImageBtn.addEventListener('click', () => {
    selectedImageBase64 = null;
    imageUploadInput.value = ''; // Limpa o input de arquivo
    imagePreviewContainer.style.display = 'none';
    imagePreview.src = '#';
});


// --- Lógica de Gravação de Áudio ---
if (startRecordBtn && stopRecordBtn && audioPreview) {
    startRecordBtn.addEventListener('click', async () => {
        audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result.split(',')[1]; // Pega apenas a parte Base64
                    socket.emit('chat-message', {
                        username: myUsername,
                        room: currentRoom,
                        type: 'audio',
                        audio: base64Audio
                    });
                    audioPreview.src = URL.createObjectURL(audioBlob);
                    audioPreview.style.display = 'block';
                    // Opcional: Limpar a stream do microfone
                    stream.getTracks().forEach(track => track.stop());
                };
            };
            mediaRecorder.start();
            startRecordBtn.style.display = 'none';
            stopRecordBtn.style.display = 'inline-block';
            audioPreview.style.display = 'none'; // Esconde a pré-visualização durante a gravação
        } catch (error) {
            console.error('Erro ao acessar o microfone:', error);
            alert('Não foi possível acessar o microfone. Verifique as permissões.');
        }
    });

    stopRecordBtn.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            startRecordBtn.style.display = 'inline-block';
            stopRecordBtn.style.display = 'none';
        }
    });
}


// --- Lógica de Salas ---
document.getElementById('create-room-btn').addEventListener('click', () => {
    const roomName = createRoomInput.value.trim();
    if (roomName) {
        socket.emit('create-room', roomName, myUsername);
        createRoomInput.value = '';
    } else {
        alert('Por favor, digite um nome para a sala.');
    }
});

document.getElementById('join-room-btn').addEventListener('click', () => {
    const roomName = joinRoomInput.value.trim();
    if (roomName) {
        socket.emit('join-room', roomName, myUsername);
        joinRoomInput.value = '';
    } else {
        alert('Por favor, digite o nome da sala para entrar.');
    }
});


// --- Escutas de Eventos do Socket.IO ---
socket.on('chat-message', (message) => {
    // Apenas adiciona a mensagem se for para a sala atual
    if (message.room.toLowerCase() === currentRoom.toLowerCase()) {
        addMessage(message);
    }
});

socket.on('previous-messages', (messages) => {
    messagesDiv.innerHTML = ''; // Limpa mensagens antigas
    messages.forEach(msg => addMessage(msg));
});

socket.on('user-connected', (username) => {
    // Mensagens de conexão/desconexão só são exibidas para a sala em que o evento ocorreu
    // e se o usuário está nela. O server já garante que só emite para a sala correta.
    addMessage({ username: 'Sistema', message: `${username} se conectou.`, type: 'text', room: currentRoom });
});

socket.on('user-disconnected', (username) => {
    addMessage({ username: 'Sistema', message: `${username} se desconectou.`, type: 'text', room: currentRoom });
});

socket.on('room-created', (roomName) => {
    // Isso será acionado para o criador da sala.
    // O ideal é que o criador já entre automaticamente na sala.
    // addMessage({ username: 'Sistema', message: `Sala "${roomName}" criada.`, type: 'text', room: currentRoom });
    socket.emit('join-room', roomName, myUsername); // Tenta entrar na sala recém-criada
});

socket.on('room-joined', (roomName) => {
    if (currentRoomDisplay && messagesDiv) {
        currentRoom = roomName; // Atualiza a sala atual no frontend
        currentRoomDisplay.textContent = `Sala atual: ${roomName}`;
        // A mensagem de "Você entrou na sala" é adicionada *após* o histórico ser carregado
        // para evitar que ela seja sobreposta ou apareça antes.
        // A mensagem em si é adicionada na `addMessage` na função `previous-messages`
        // Ou você pode adicionar aqui, dependendo da ordem desejada:
        // addMessage({ username: 'Sistema', message: `Você entrou na sala "${roomName}".`, type: 'text', room: roomName });
    }
});

socket.on('room-error', (message) => {
    // Garante que a mensagem de erro é exibida na sala atual
    addMessage({ username: 'Sistema (Erro)', message: message, type: 'text', room: currentRoom });
});

socket.on('login-error', (message) => {
    if (loginError && mainChatLayout && registerContainer && loginContainer) {
        loginError.textContent = message;
        mainChatLayout.style.display = 'none';
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    }
});

socket.on('active-rooms-list', (rooms) => {
    console.log('Salas ativas recebidas:', rooms);
    updateActiveRoomsList(rooms);
});


// --- Inicialização da Interface ---
document.addEventListener('DOMContentLoaded', () => {
    if (loginContainer && mainChatLayout) {
        loginContainer.style.display = 'block';
        mainChatLayout.style.display = 'none';
        registerContainer.style.display = 'none';
    }
    socket.emit('request-active-rooms'); // Pede a lista de salas ativas ao carregar
});