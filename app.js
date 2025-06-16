const { Client } = require('whatsapp-web.js');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const SESSION_FILE_PATH = './session.json';
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

let sessionData;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

const client = new Client({ session: sessionData });

client.on('authenticated', (session) => {
    sessionData = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), (err) => {
        if (err) console.error(err);
    });
});

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

const pendingJobs = {};

client.on('message', async msg => {
    if (msg.fromMe) return;

    const chatId = msg.from;

    if (pendingJobs[chatId]) {
        const response = msg.body.toLowerCase();
        if (response === 'yes') {
            const job = pendingJobs[chatId];
            db.run(
                `INSERT INTO jobs (date, time, guest_name, contact, pick_up, drop_off, service_type, vehicle_type, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted')`,
                [job.date, job.time, job.guest_name, job.contact, job.pick_up, job.drop_off, job.service_type, job.vehicle_type],
                function(err) {
                    if (err) {
                        console.error(err);
                        msg.reply('Error saving job.');
                    } else {
                        msg.reply(`Job accepted. ID: ${this.lastID}`);
                    }
                }
            );
            delete pendingJobs[chatId];
        } else if (response === 'no') {
            msg.reply('Job declined.');
            delete pendingJobs[chatId];
        } else {
            msg.reply('Please reply with "yes" or "no".');
        }
    } else {
        if (msg.body.startsWith('Date:')) {
            const lines = msg.body.split('\n');
            const data = {};
            lines.forEach(line => {
                const [key, value] = line.split(':').map(s => s.trim());
                if (key && value) {
                    data[key] = value;
                }
            });
            pendingJobs[chatId] = data;
            msg.reply('Do you accept this job? Reply "yes" or "no".');
        } else if (msg.body.startsWith('/changetime')) {
            const parts = msg.body.split(' ');
            if (parts.length >= 3) {
                const jobId = parts[1];
                const newTime = parts[2];
                db.run(`UPDATE jobs SET time = ? WHERE id = ?`, [newTime, jobId], function(err) {
                    if (err) {
                        console.error(err);
                        msg.reply('Error updating time.');
                    } else if (this.changes === 0) {
                        msg.reply('Job not found.');
                    } else {
                        msg.reply('Time updated successfully.');
                    }
                });
            } else {
                msg.reply('Usage: /changetime <job_id> <new_time>');
            }
        } else if (msg.body.startsWith('/cancelled')) {
            const parts = msg.body.split(' ');
            if (parts.length >= 2) {
                const jobId = parts[1];
                db.run(`DELETE FROM jobs WHERE id = ?`, [jobId], function(err) {
                    if (err) {
                        console.error(err);
                        msg.reply('Error cancelling job.');
                    } else if (this.changes === 0) {
                        msg.reply('Job not found.');
                    } else {
                        msg.reply('Job cancelled successfully.');
                    }
                });
            } else {
                msg.reply('Usage: /cancelled <job_id>');
            }
        } else {
            msg.reply('I only understand job messages and commands.');
        }
    }
});

client.initialize();