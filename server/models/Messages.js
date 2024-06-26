const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
    conversationId: {
        type: String,
    },
    senderId: {
        type: String,
    },
    message: {
        type: String,
    },
});

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;