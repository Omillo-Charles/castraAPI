import cookieParser from "cookie-parser";
import express from "express";

const app = express();

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({extended: true}))

app.get("/", (req, res)=>{
  res.send({
    "title": "The Castra Collection ExpressJS Backend API",
    "body": "Welcome to the Castra Collection ExpressJS Backend API"
  })
})

app.listen(5500, ()=>{
  console.log("The Castra Collection ExpressJS Backend API is running on http://localhost:3000")
})

export default app;