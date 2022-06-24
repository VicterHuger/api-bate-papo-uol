import express,{json} from "express";
import cors from "cors";
import dotenv from "dotenv";
import {MongoClient, ObjectId} from "mongodb";
import joi from "joi";

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


app.listen(5000,()=>{console.log("Server is running on port 5000")});