// ./src/app.js
import express from "express";
import dotenv from "dotenv";
import session from "express-session"; 
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config(); // get Vars from .env

const app = express();

// 2. Setup the session
app.use(session({
  secret: process.env.SESSION_SECRET || "test-secret", // Must change in real use
  resave: false,                // don't save it agein without changes
  saveUninitialized: false,      // don't save the session if data empty
  cookie: {
    httpOnly: true,                                // dosn't read from JS
    sameSite: "lax",  
    secure: false,              // false in tests(HTTP)، true in real (HTTPS)
    maxAge: 1000 * 60 * 60      // صلاحية الجلسة: ساعة واحدة
  }
}));

app.use(express.json());        // 3. Requist body in JSON
app.use(express.static("public")); 
app.use("/api", chatRoutes);    // 4.

export default app;