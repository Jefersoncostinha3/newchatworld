// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    message: {
        type: String, // Para mensagens de texto
        required: false // Pode ser nulo se for áudio ou imagem
    },
    audio: {
        type: String, // Para áudio em base64
        required: false // Pode ser nulo se for texto ou imagem
    },
    image: { // <--- NOVO CAMPO PARA IMAGEM
        type: String, // Armazenará a imagem em Base64
        required: false // Pode ser nulo se for texto ou áudio
    },
    room: {
        type: String,
        required: true,
        trim: true,
        lowercase: true // Garante que o nome da sala é salvo em minúsculas
    },
    type: {
        type: String, // 'text', 'audio' ou 'image'
        enum: ['text', 'audio', 'image'], // <--- ATUALIZADO
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Adiciona um índice para a sala para buscas mais rápidas
MessageSchema.index({ room: 1, timestamp: -1 });

module.exports = mongoose.model('Message', MessageSchema);