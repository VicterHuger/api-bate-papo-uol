import express,{json} from "express";
import cors from "cors";
import dotenv from "dotenv";
import {MongoClient, ObjectId} from "mongodb";
import joi from "joi";

const app=express();

app.use([json(),cors()]);



app.listen(5000,()=>{console.log("Server is running on port 5000")});