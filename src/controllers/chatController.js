// src/controllers/chatController.js
import { createThread, addMessage, streamThread } from '../services/openaiService.js';

export async function chatStream(req, res) {
  // 1. إعداد SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders?.();

    try {
        // 2. تحقّق من محتوى body
        const { content } = req.body;
        if (!Array.isArray(content)) {
            return res.status(400).json({ error: "Content must be an array of MessageContent blocks" });
        }
    
        // 3. دمج النصوص الواردة في مصفوفة content إلى نص واحد
        const contentText = content
            .filter(c => typeof c.text === 'string')
            .map(c => c.text)
            .join('\n');
    
        // 4. احصل على threadId من الجلسة أو أنشئ واحداً جديداً
        let threadId = req.session.threadId;
        if (!threadId) {
            threadId = await createThread();
            req.session.threadId = threadId;
            console.log(`🆕 New thread created: ${threadId}`);
        }
    
        // 5. أضف رسالة المستخدم إلى الخيط
        await addMessage(threadId, contentText);
    
        // 6. شغّل الاستريم على الثريد الحالي
        streamThread(threadId, {
            onTextDelta: chunk => {
                res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
            },
            onEnd: () => {
                res.write("event: end\ndata: done\n\n");
                res.end();
            },
            onError: err => {
                console.error("Stream error:", err);
                // تنظيف threadId عند الخطأ لمنع حالته المعلقة
                delete req.session.threadId;
                res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            }
        });
        
    
        } catch (err) {
            console.error("Controller error:", err);
            // في حالة الخطأ، إنهِ الجلسة لضمان إعادة إنشاء thread جديد لاحقًا
            delete req.session.threadId;
            res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }
}

// (اختياري) دالة لإنهاء الجلسة من جهة العميل
export function endSession(req, res) {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: "Failed to end session" });
        }
        res.json({ message: "Session ended successfully" });
    });
}