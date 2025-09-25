const mongoose = require('mongoose');

async function connectDb(){
    try{
        await mongoose.connect(process.env.MONGODB_URI)
        console.log(`MongoDB Connected`)
    }
    catch(err){
        console.log(`Error in Connecting MongoDB - ${err.message}`)
    }
}

module.exports = connectDb