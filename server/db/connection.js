const mongoose = require('mongoose');

const url = 'mongodb://localhost:27017/';

mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(()=>console.log('connected to db' )).catch((e) => console.log('Error', e) )