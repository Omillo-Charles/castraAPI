import cookieParser from "cookie-parser";
import express from "express";
import authRouter from "./routes/auth.routes.js";
import prisma from "./database/neon.js";

const app = express();

app.use(express.json())
app.use(cookieParser())
app.use(express.urlencoded({extended: true}))

app.use("/api/v1/auth", authRouter)

app.get("/", (req, res)=>{
  res.send({
    "title": "The Castra Collection ExpressJS Backend API",
    "body": "Welcome to the Castra Collection ExpressJS Backend API"
  })
})

async function connectDB() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

async function startServer() {
  await connectDB();

  app.listen(5500, () => {
    console.log("The Castra Collection ExpressJS Backend API is running on http://localhost:5500");
  });
}

startServer();

export default app;