const venom = require('venom-bot');
const qrcode = require('qrcode-terminal');
const sqlite3 = require('sqlite3').verbose();

const SESSION_NAME = 'chauffeur-bot';
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        time TEXT,
        guest_name TEXT,
        contact TEXT,
        pick_up TEXT,
        drop_off TEXT,
        service_type TEXT,
        vehicle_type TEXT,
        status TEXT
    )`);
});

const pendingJobs = {};

venom.create({
    session: SESSION_NAME,
    qrCode: (base64Qr, asciiQR) => {
        qrcode.generate(asciiQR, { small: true });
    }
}).then((client) => {
    console.log('Client is ready!');

    client.onMessage((message) => {
        if (message.isMe) return;

        const chatId = message.from;

        if (pendingJobs[chatId]) {
            const response = message.body.toLowerCase();
            if (response === 'yes') {
                const job = pendingJobs[chatId];
                db.run(
                    `INSERT INTO jobs (date, time, guest_name, contact, pick_up, drop_off, service_type, vehicle_type, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`,
                    [job.date, job.time, job.guest_name, job.contact, job.pick_up, job.drop_off, job.service_type, job.vehicle_type],
                    function(err) {
                        if (err) {
                            console.error(err);
                            client.sendText(chatId, 'Error saving job.');
                        } else {
                            client.sendText(chatId, `Job accepted. ID: ${this.lastID}`);
                        }
                    }
                );
                delete pendingJobs[chatId];
            } else if (response === 'no') {
                client.sendText(chatId, 'Job declined.');
                delete pendingJobs[chatId];
            } else {
                client.sendText(chatId, 'Please reply with "yes" or "no".');
            }
        } else {
            if (message.body.startsWith('Date:')) {
                const lines = message.body.split('\n');
                const data = {};
                lines.forEach(line => {
                    const [key, value] = line.split(':').map(s => s.trim());
                    if (key && value) {
                        data[key] = value;
                    }
                });
                pendingJobs[chatId] = data;
                client.sendText(chatId, 'Do you accept this job? Reply "yes" or "no".');
            } else if (message.body.startsWith('/changetime')) {
                const parts = message.body.split(' ');
                if (parts.length >= 3) {
                    const jobId = parts[1];
                    const newTime = parts[2];
                    db.run(`UPDATE jobs SET time = ? WHERE id = ?`, [newTime, jobId], function(err) {
                        if (err) {
                            console.error(err);
                            client.sendText(chatId, 'Error updating time.');
                        } else if (this.changes === 0) {
                            client.sendText(chatId, 'Job not found.');
                        } else {
                            client.sendText(chatId, 'Time updated successfully.');
                        }
                    });
                } else {
                    client.sendText(chatId, 'Usage: /changetime <job_id> <new_time>');
                }
            } else if (message.body.startsWith('/cancelled')) {
                const parts = message.body.split(' ');
                if (parts.length >= 2) {
                    const jobId = parts[1];
                    db.run(`DELETE FROM jobs WHERE id = ?`, [jobId], function(err) {
                        if (err) {
                            console.error(err);
                            client.sendText(chatId, 'Error cancelling job.');
                        } else if (this.changes === 0) {
                            client.sendText(chatId, 'Job not found.');
                        } else {
                            client.sendText(chatId, 'Job cancelled successfully.');
                        }
                    });
                } else {
                    client.sendText(chatId, 'Usage: /cancelled <job_id>');
                }
            } else {
                client.sendText(chatId, 'I only understand job messages and commands.');
            }
        }
    });
}).catch((error) => console.error(error));