// server.js - ติดตั้งผ่าน npm install express socket.io cors
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // เก็บไฟล์ index.html ไว้ในโฟลเดอร์ public

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ความจำชั่วคราวเก็บ PIN 6 หลักของโลก/เซิร์ฟเวอร์ที่เปิดอยู่
const activeSessions = new Map(); // PIN -> { ipPort, players, lastSeen }

// 1. API สำหรับให้ Minecraft Add-on ยิง Heartbeat + พิกัดเข้ามา
app.post('/api/heartbeat', (req, res) => {
    const { pin, ipPort, players } = req.body;
    
    if (!pin || pin.length !== 6) {
        return res.status(400).json({ success: false, error: "Invalid PIN" });
    }

    // อัปเดต/สร้าง Session ใหม่พร้อมเวลา Heartbeat ล่าสุด
    activeSessions.set(pin, {
        ipPort: ipPort || "Local World",
        players: players || [],
        lastSeen: Date.now()
    });

    res.json({ success: true, message: "Heartbeat received" });
});

// 2. ระบบ Auto-Cleanup: ลบ PIN อัตโนมัติหากเกมปิดเกิน 15 วินาที
setInterval(() => {
    const now = Date.now();
    for (const [pin, session] of activeSessions.entries()) {
        if (now - session.lastSeen > 15000) {
            console.log(`[Auto-Clean] Session PIN ${pin} expired or world closed.`);
            activeSessions.delete(pin);
            // แจ้งเตือนผู้เล่นบนหน้าเว็บให้หลุดการเชื่อมต่อ
            io.to(pin).emit('session-closed', { reason: "โลก/เซิร์ฟเวอร์ถูกปิด หรือขาดการเชื่อมต่อ" });
        }
    }
}, 5000);

// 3. WebSocket สำหรับผู้เล่นบนหน้าเว็บมือถือ
io.on('connection', (socket) => {
    
    // ตรวจสอบ PIN และ IP
    socket.on('verify-pin', ({ mode, pin, ipPort, playerName }, callback) => {
        const session = activeSessions.get(pin);
        
        if (!session) {
            return callback({ success: false, error: "ไม่พบรหัส 6 หลักนี้ หรือโลกเปิดอยู่ถูกปิดไปแล้ว" });
        }

        if (mode === 'server' && session.ipPort !== ipPort) {
            return callback({ success: false, error: "IP / Port ไม่ตรงกับห้องของรหัสนี้" });
        }

        socket.join(pin);
        socket.playerName = playerName;
        socket.sessionPin = pin;

        console.log(`[Connect] ${playerName} Joined Session PIN: ${pin}`);
        callback({ success: true, message: "เชื่อมต่อสำเร็จ!" });
    });

    socket.on('disconnect', () => {
        console.log(`[Disconnect] User disconnected: ${socket.playerName || socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Voice Server running on port ${PORT}`);
});
