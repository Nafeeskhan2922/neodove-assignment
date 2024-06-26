const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose');
const io = require('socket.io')(8080, {
    cors: {
        origin: 'http://localhost:3000',
    }
});


 //connect db
require('./db/connection');

//import file

const Users = require('./models/Users');
const Conversations = require('./models/Conversations');
const Messages = require('./models/Messages');
const { Socket } = require('socket.io');


//app use
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cors());


const port = process.env.PORT || 8000;

//socket.io 

let users = [];
io.on('connection', socket => {
    console.log('user connected', socket.id)
    socket.on('addUser', userId => {
        const isUserExist = users.find(user => user.userId === userId);
        if (!isUserExist){
            const user = {userId, socketId: socket.id};
            users.push(user);
            io.emit('getUsers', users);
        }
    });
    socket.on('sendMessage', async ({senderId, receiverId, message, conversationId}) => {
        const receiver = users.find(user => user.userId === receiverId);
        const sender = users.find(user => user.userId === senderId);
        const user = await Users.findById(senderId);
        if (receiver){
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
                senderId,
                receiverId,
                message,
                conversationId,
                user: {id: user._id, fullName: user.fullName, email: user.email}
            });
        }else{
            io.to(sender.socketId).emit('getMessage', {
                senderId,
                receiverId,
                message,
                conversationId,
                user: {id: user._id, fullName: user.fullName, email: user.email}
            });
        }
    });
    socket.on('disconnect', () => {
       users = users.filter(user => user.socketId !== socket.id);
       io.emit('getUsers', users);


    });
    // io.emit('getUsers', socket.userId);
});

//routes
app.get('/', (req, res) => {
    res.send('welcome')
}) 

app.post('/api/register', async (req, res, next) => {
    try{
        const{fullName, email, password} = req.body;
        if(!fullName || !email || !password){
            res.status(400).send('Please fill all required fields');
        }else{
            const isAlreayExist = await Users.findOne({email});
            if(isAlreayExist) {
                res.status(400).send('User alreay exists');
            }else{
                const newUser = new Users({fullName, email});
                bcryptjs.hash(password, 10, (err, hashedPassword) => {
                    newUser.set('password', hashedPassword);
                    newUser.save();
                    next();
                })
                return res.status(200).send('User registerd successfully');s
            }
        }
    }catch(error){
        console.log(error, 'Error');

    }
})

app.post('/api/login', async function (req, res, next) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                res.status(400).send('Please fill all required fields');
            } else {
                const user = await Users.findOne({ email });
                if (!user) {
                    res.status(400).send('User email or password is incorrect');
                } else {
                    const validateUser = await bcryptjs.compare(password, user.password);
                    if (!validateUser) {
                        res.status(400).send('User email or password is incorrect');
                    } else {
                        const payload = {
                            userId: user.id,
                            email: user.email
                        };
                        const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';
                        jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
                            await Users.updateOne({ _id: user._id }, {
                                $set: { token }
                            });
                            user.save();
                            return res.status(200).json({ user: {id: user._id, email: user.email, fullName: user.fullName }, token: user.token });

                        });
                    }
                }

            }
        } catch (error) {
            console.log(error, 'Error');
        }
    })

app.post('/api/conversation', async (req, res) => {
    try {
        const [senderId, receiverId] = req.body;
        const newConversation = new Conversations ({members: [senderId, receiverId]});
        await newConversation.save();
        res.status(200).send('Conversation created successfully');
    } catch (error) {
        console.log(error, 'Error')
    }
})



app.get('/api/conversations/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Find conversations where the provided userId is a member
        const conversations = await Conversations.find({ members: { $in: [userId] } });
        
        // Map each conversation to get user data for the other member
        const conversationUserData = await Promise.all(conversations.map(async (conversation) => {
            // Find the ID of the other member in the conversation
            const receiverId = conversation.members.find(member => member !== userId);
            
            // Validate receiverId as a valid ObjectId
            if (!mongoose.Types.ObjectId.isValid(receiverId)) {
                // Handle invalid receiverId (e.g., log an error or skip this conversation)
                console.error('Invalid receiverId:', receiverId);
                return null; // Or handle it in a way appropriate to your application
            }
            
            // Find user data for the other member
            const user = await Users.findById(receiverId);
            
            // Return user data and conversation ID
            return { user: {receiverId: user._id, email: user.email, fullName: user.fullName }, conversationId: conversation._id };
        }));
        
        // Filter out null values (if any)
        const validConversationUserData = conversationUserData.filter(userData => userData !== null);
        
        // Send the conversation user data as JSON response
        res.status(200).json(validConversationUserData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// app.post('/api/message', async (req, res) => {
//     try {
//         const {conversationId, senderId, message, receiverId= ''} = req.body;
//         if(!senderId || !message) return res.status(400).send('Please fill all required fields');
//         if (!conversationId && receiverId){
//             const newConversation = new Conversations({members: [senderId, receiverId]});
//             await newConversation.save();
//             const newMessage = new Messages({conversationId: newConversation._id, senderId, message,});
//             await newMessage.save();
//             return res.status(200).send('Message send seccessfully');

//         }else if(!conversationId && !receiverId){
//             return res.status(400).send('Please fill all required fields')
//         }
//         const newMessage = new Messages({conversationId, senderId, message});
//         await newMessage.save();
//         res.status(200).send('Message sent successfully');
//     } catch (error) {
//         console.log(error, 'Error')
//     }
// })

app.post('/api/message', async (req, res) => {
    try {
        const { conversationId, senderId, message, receiverId = '' } = req.body;

        if (!senderId || !message) 
            return res.status(400).send('Please fill all required fields');

        let targetConversationId = conversationId; // Initialize with provided conversationId
        
        if (!targetConversationId&& receiverId) {
            // If conversationId is not provided but receiverId is, find or create conversation
            let existingConversation = await Conversations.findOne({
                members: { $all: [senderId, receiverId] }
            });

            if (!existingConversation) {
                // If no existing conversation, create a new one
                const newConversation = new Conversations({ members: [senderId, receiverId] });
                existingConversation = await newConversation.save();
            }

            // Assign the conversation ID for the message
            targetConversationId = existingConversation._id;
        }

        // Create and save the message with the determined conversationId
        const newMessage = new Messages({ conversationId: targetConversationId, senderId, message });
        await newMessage.save();

        return res.status(200).send('Message sent successfully');
        
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).send('Internal Server Error');
    }
});


app.get('/api/message/:conversationId', async (req, res) => {
    try {

        const checkMessages = async (conversationId) => {
            const messages = await Messages.find({conversationId});
            const messageUserData = Promise.all(messages.map(async (message) => {
                const user = await Users.findById(message.senderId);
                return {user: {id: user._id, email: user.email, fullName: user.fullName}, message: message.message}
            }));
            res.status(200).json(await messageUserData);
        }
        const conversationId = req.params.conversationId;
        if(conversationId === 'new'){
            const checkConversation = await Conversations.find({members: {$all: [req.query.senderId, req.query.receiverId]}});
            if (checkConversation.length > 0){
                checkMessages(checkConversation[0]._id)
            }else{
                return res.status(200).json([]);

            }
        }else{
            checkMessages(conversationId);

        }
    } catch (error) {
        console.log(error, 'Error')

    }
})
// app.get('/api/message/:conversationId', async (req, res) => {
//     try {
//         const checkMessages = async (conversationId) => {
//             const messages = await Messages.find({ conversationId });
//             const messageUserData = Promise.all(messages.map(async (message) => {
//                 const user = await Users.findById(message.senderId);
//                 return { user: { id: user._id, email: user.email, fullName: user.fullName }, message: message.message };
//             }));
//             res.status(200).json(await messageUserData);
//         }
        
//         const conversationId = req.params.conversationId;
        
//         if (conversationId === 'new') {
//             const checkConversation = await Conversations.find({ members: { $all: [req.query.senderId, req.query.receiverId] } });
//             if (checkConversation.length > 0) {
//                 checkMessages(checkConversation[0]._id);
//             } else {
//                 return res.status(200).json([]);
//             }
//         } else {
//             checkMessages(conversationId);
//         }
//     } catch (error) {
//         console.log(error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// });


app.get('/api/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const users = await Users.find({_id: {$ne: userId}});
        const usersData = Promise.all(users.map(async (user) => {
            return {user: {email: user.email, fullName: user.fullName, receiverId: user._id}}
        }));
        res.status(200).json(await usersData);
    } catch (error) {
        console.log(error, 'Error')

    }
})




app.listen(port, () => {
    console.log('listening on port ' + port);
})