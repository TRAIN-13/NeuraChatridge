// src/app.js
import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';

import chatRoutes from './routes/chatRoutes.js';
import { requestTracker } from './middleware/requestTracker.js';
import { errorLogger } from './middleware/errorHandler.js';

// Load environment variables from .env file
dotenv.config();

const app = express();

// If behind a proxy (e.g., Heroku, Nginx), trust first proxy for secure cookies
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// 1. Static files
app.use(express.static(path.join(process.cwd(), 'public')));

// 2. Parse incoming JSON and URL-encoded payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Session configuration (must come before routes)
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 // 1 hour
    }
  })
);

// 4. Request tracking middleware (assigns requestId and startTime)
app.use(requestTracker);

// 5. API routes
app.use('/api', chatRoutes);

// 6. Global error handler (logs and responds with 500)
app.use(errorLogger);

export default app;