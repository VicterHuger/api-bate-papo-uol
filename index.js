import express,{json} from "express";
import cors from "cors";
import dotenv from "dotenv";
import {MongoClient, ObjectId} from "mongodb";
import joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

dotenv.config();

const app=express();

app.use([json(),cors()]);

const mongoClient = new MongoClient(process.env.URL_MONGODB);

const participantsSchema=joi.object({
    name:joi.string().required().min(1),
})

async function generateMessageSchema(array){
    return joi.object({
        to:joi.string().min(1).required(),
        text:joi.string().min(1).required(),
        type:joi.string().valid('message','private_message').required(),
        from: joi.string().valid(...array).required(),
    });
}

async function conectionMongoClient (){
    await mongoClient.connect();
    return mongoClient.db("api-uol");
}

function closeMongoClient(){
    mongoClient.close();
}

async function generateArrayNames(db){
    const participants=await db.collection('participants').find().toArray();
    const userNames= participants.map(participant=>stripHtml(participant.name).result.trim());
    return new Array(...userNames);
}

app.post('/participants',async(req,res)=>{
    const objName=req.body;
    const name=stripHtml(objName.name).result.trim();
    const validation= participantsSchema.validate(objName);
    if (validation.error) {
        const message=validation.error.details[0].message;
        return res.status(422).send(message);
    }
    try{
        const db= await conectionMongoClient();
        
        const userName= await db.collection("participants").findOne({name});
        if(userName){
            res.status(409).send(`O nome ${name} já está sendo utilizado!`);
            closeMongoClient();
            return;
        }
        await db.collection("participants").insertOne({
            name,
            lastStatus: Date.now(),
        });
        await db.collection("messages").insertOne({
            from: name,
            to: 'Todos', 
            text: 'entra na sala...',
            type: 'status', 
            time: dayjs().format('HH:mm:ss')
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
        
        const messagesSchema= await generateMessageSchema(userNamesArray);
        
        const validation = messagesSchema.validate(message,{ abortEarly: false});
        
        if(validation.error){
            const errorMessages=validation.error.details.map(item=>item.message);
            res.status(422).send(errorMessages);
            closeMongoClient();
            return;
        }
        
        await db.collection('messages').insertOne({
            to:stripHtml(message.to).result.trim(),
            text:stripHtml(message.text).result.trim(),
            type:stripHtml(message.type).result.trim(),
            from:stripHtml(message.from).result.trim(),
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
    const userName=stripHtml(req.headers.user).result.trim();
    
    
    try{
        const db= await conectionMongoClient();
        if(!limit) limit=(await db.collection('message').find({}).toArray()).length;
        const query={
            $or: [
                {type:'message'},
                {type:'status'},
                {type:'private_message',to:userName},
                {type:'private_message',from:userName},
            ]
        };
        const options={
            limit,
            sort:{_id:-1},
        }
        const messages= (await db.collection('messages').find(query,options).toArray()).reverse();
        res.send(messages);
        closeMongoClient();
    }catch(error){
        res.status(500).send(error);
        closeMongoClient();
    }

});

app.post('/status', async(req,res)=>{
    
    const userName=stripHtml(req.headers.user).result.trim();
    
    if(!userName) return res.status(404).send('Campo header inválido!')
    try{
        const db= await conectionMongoClient();
        const participant= await db.collection('participants').find({name:userName}).toArray();
        if(participant.length===0) {
            closeMongoClient();
            return res.sendStatus(404);
        }
        await db.collection('participants')
            .updateOne(
                {name:userName},
                {$set:{lastStatus:Date.now()}}
            );
        res.sendStatus(200);
        closeMongoClient();
    }catch(error){
        res.status(500).send(error);
        closeMongoClient();
    }
});

app.delete('/messages/:id_da_mensagem', async(req,res)=>{
    const id=req.params.id_da_mensagem;
    if(id.length!==24) return res.status(404).send('O id fornecido não é válido!');
    const userName=stripHtml(req.headers.user).result.trim();
    
    try{
        const db=await conectionMongoClient();
        const message=await db.collection('messages').findOne({_id: new ObjectId(id)});
        if(!message){
            return res.status(404).send('O id fornecido não é válido!');
        }
        if(userName!==message.from){
            return res.status(401).send('Este usuário não é o dono da mensagem!');
        }
        await db.collection('messages').deleteOne({_id: new ObjectId(id)});
        res.sendStatus(200);
        closeMongoClient();
    }catch(error){
        res.status(500).send(error);
        closeMongoClient();
    }
});

app.put('/messages/:id_da_mensagem', async(req,res)=>{
    const message={...req.body,from:req.headers.user};
    const id=req.params.id_da_mensagem;
    if(id.length!==24) return res.status(404).send('O id fornecido não é válido!');
    try{
        const db= await conectionMongoClient();
        const userNamesArray= await generateArrayNames(db);
        const messagesSchema= await generateMessageSchema(userNamesArray);
        const validation = messagesSchema.validate(message, { abortEarly: false });
        
        if(validation.error){
            const errorMessages=validation.error.details.map(item=>item.message);
            res.status(422).send(errorMessages);
            closeMongoClient();
            return;
        }

        const messageDb=await db.collection('messages').findOne({_id: new ObjectId(id)});
        if(!messageDb) {
            closeMongoClient();
            return res.status(404).send('O id fornecido não é válido!');
        }
        if(messageDb.from!==message.from){
            closeMongoClient();
            return res.status(401).send('Este usuário não é o dono da mensagem!');
        } 

        await db.collection('messages').updateOne(
                {
                    _id: messageDb._id
                },
                {
                    $set:
                    {
                        to:stripHtml(message.to).result.trim(),
                        text:stripHtml(message.text).result.trim(),
                        type:stripHtml(message.type).result.trim(),
                        from:stripHtml(message.from).result.trim(),
                        time:dayjs().format('HH:mm:ss'),
                    }
                });
        res.sendStatus(200);
    }catch(error){
        res.status(500).send(error);
    }
})

setInterval(async()=>{
  try{
    const db=await conectionMongoClient();
    const participantsNames= await generateArrayNames(db);    
    const participantsDeleted= await db.collection('participants').deleteMany({
        lastStatus:{
            $lt:(Date.now()-10000)
        }
    });
    
    if(participantsDeleted.deletedCount>0){
        const participantsAfterDeleted= await generateArrayNames(db);
        participantsNames.forEach(async participant=>{
            if(!participantsAfterDeleted.includes(participant)){
                return db.collection('messages').insertOne({
                    from: participant,
                    to: 'Todos', 
                    text: 'sai da sala...', 
                    type: 'status',
                    time: dayjs().format('HH:mm:ss'),
                })
            }
        })
    }
    
  }catch(error){
    closeMongoClient();
    console.log(error);
  }
},15000);

app.listen(process.env.PORT,()=>{console.log(`Server is running on port ${process.env.PORT}`)});