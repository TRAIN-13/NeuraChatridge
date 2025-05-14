import express from "express";
import dotenv from "dotenv";
import session from "express-session";      // 1. استيراد الحزمة
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config(); // تحميل المتغيرات من .env

const app = express();

// 2. إعداد الجلسة قبل أي راوت
app.use(session({
  secret: process.env.SESSION_SECRET || "test-secret", // استبدل بقيمة قوية في الإنتاج
  resave: false,                // لا تعيد حفظ الجلسة إذا لم تتغير
  saveUninitialized: false,      // لا تحفظ الجلسة الجديدة لو بدون بيانات
  cookie: {
    secure: false,              // false في الاختبار (HTTP)، true في الإنتاج (HTTPS)
    maxAge: 1000 * 60 * 60      // صلاحية الجلسة: ساعة واحدة
  }
}));

app.use(express.json());        // 3. جسم الطلب بصيغة JSON
app.use(express.static("public")); 
app.use("/api", chatRoutes);    // 4. الراوتات

export default app;