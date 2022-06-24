import express,{json} from "express";
import cors from "cors";
import dotenv from "dotenv";
import {MongoClient, ObjectId} from "mongodb";
import joi from "joi";
import dayjs from "dayjs";


dotenv.config();

const app=express();

app.use([json(),cors()]);

const mongoClient = new MongoClient(process.env.URL_MONGODB);

const participantsSchema=joi.object({
    name:joi.string().required().min(1),
})

async function conectionMongoClient (){
    await mongoClient.connect();
    return mongoClient.db("api-uol");
}

function closeMongoClient(){
    mongoClient.close();
}

async function generateArrayNames(db){
    const participants=await db.collection('participants').find().toArray();
    const userNames= participants.map(participant=>participant.name);
    return new Array(...userNames);
}

app.post('/participants',async(req,res)=>{
    const objName=req.body;
    const validation= participantsSchema.validate(objName);
    if (validation.error) {
        const message=validation.error.details[0].message;
        return res.status(422).send(message);
    }
    try{
        const db= await conectionMongoClient();
        
        const userName= await db.collection("participants").findOne({name:objName.name});
        if(userName){
            res.status(409).send(`O nome ${objName.name} já está sendo utilizado!`);
            closeMongoClient();
            return;
        }
        await db.collection("participants").insertOne({
            name:objName.name,
            lastStatus: Date.now(),
        });
        res.sendStatus(201);
        closeMongoClient();

    }catch(error){
        res.status(500).send(error);
        closeMongoClient();
    }
});

app.get('/participants', async(req,res)=>{
    try{
        const db= await conectionMongoClient();
        const participants= await db.collection("participants").find().toArray();
        res.send(participants);
        closeMongoClient();
    }catch(error){
        res.status(500).send(error);
    }
});

app.post('/messages', async(req,res)=>{

    const message={...req.body,from:req.headers.user};
    try{
        const db= await conectionMongoClient();
        const userNamesArray= await generateArrayNames(db);
        const messagesSchema= joi.object({
            to:joi.string().min(1).required(),
            text:joi.string().min(1).required(),
            type:joi.string().valid('message','private_message').required(),
            from: joi.string().valid(...userNamesArray).required(),
        });

        const validation = messagesSchema.validate(message);
        
        if(validation.error){
            res.status(422).send(validation.error.details[0].message)
            closeMongoClient();
            return;
        }

        await db.collection('messages').insertOne({
            to:message.to,
            text:message.text,
            type:message.type,
            from:message.from,
            time:dayjs().format('HH:mm:ss'),
        })

        res.sendStatus(201);
        closeMongoClient();
        return;

    }catch(error){
        closeMongoClient();
        return res.status(500).send(error);
    }
    
});

app.get('/messages', async(req,res)=>{
    let limit= parseInt(req.query.limit);
    const userName=req.headers.user;
    
    try{
        const db= await conectionMongoClient();
        if(!limit) limit=(await db.collection('message').find({}).toArray()).length;
        const query={
            $or: [
                {type:'message'},
                {type:'private_message',to:userName},
                {type:'private_message',from:userName},
            ]
        };
        const options={
            sort:{time:-1},
            limit,
        }
        const messages=await db.collection('messages').find(query,options).toArray();
        res.send(messages);
        closeMongoClient();
    }catch(error){
        res.status(500).send(error);
        closeMongoClient();
    }

});

app.listen(process.env.PORT,()=>{console.log(`Server is running on port ${process.env.PORT}`)});