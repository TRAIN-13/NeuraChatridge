// src/controllers/chatController.js
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { sanitizeError } from '../utils/errorUtils.js';

/**
 * يعيد جميع الرسائل في thread واحد، بعد التحقق من صلاحية userId.
 * POST /api/fetch-messages
 */
export async function fetchMessages(req, res) {
    try {
        const { threadId, userId } = req.body;
        validateFetchInput(threadId, userId);

        const threadData = await getThreadData(threadId);
        verifyOwnership(threadData.userId, userId);

        const messages = await retrieveAndFormatMessages(threadId);
        return res.status(200).json({ messages });

    } catch (err) {
        const safe = sanitizeError(err);
        const status = err.statusCode || 500;
        return res.status(status).json({ error: safe });
    }
}

/**
 * يتأكد من أن threadId و userId مرّرا في الجسم
 */
function validateFetchInput(threadId, userId) {
    if (!threadId || !userId) {
        const err = new Error('threadId and userId are required');
        err.statusCode = 400;
        throw err;
    }
}

/**
 * يجيب بيانات الثريد أو يرمي 404 لو لم يجد
 */
async function getThreadData(threadId) {
    const ref  = doc(db, 'threads', threadId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        const err = new Error('Thread not found');
        err.statusCode = 404;
        throw err;
    }
    return snap.data();
}

/**
 * يتحقق من أن صاحب الثريد يطابق الـ userId
 */
function verifyOwnership(ownerId, userId) {
    if (ownerId && ownerId !== userId) {
        const err = new Error('Forbidden');
        err.statusCode = 403;
        throw err;
    }
}

/**
 * يجلب الرسائل من الفرعية ويطبّق عليها التهيئة والترتيب
 */
async function retrieveAndFormatMessages(threadId) {
    const msgsRef = collection(db, 'threads', threadId, 'messages');
    const snapshot = await getDocs(msgsRef);

    return snapshot.docs
        .map(docSnap => mapDocToMessage(docSnap.data()))
        .sort((a, b) => a.receivedAt - b.receivedAt);
}

/**
 * يحول كائن Firestore إلى نموذج رسالة جاهز للإرسال
 */
function mapDocToMessage(data) {
    const contentRaw = data.content;
    const content = typeof contentRaw === 'object'
        ? contentRaw.content ?? ''
        : contentRaw ?? '';

    const ts = data.receivedAt;
    const receivedAt = (ts && typeof ts.toMillis === 'function')
        ? ts.toMillis()
        : (typeof ts === 'number' ? ts : Date.now());

    return {
        author: data.author ?? 'assistant',
        content,
        receivedAt
    };
}
