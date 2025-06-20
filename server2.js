const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// صارفین اور پیغامات کی ہسٹری اسٹور کرنے کے لیے
let users = {}; // { username: { password, clientId } }
let messageHistory = [];

const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile('index.html', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading page');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', socket => {
    const clientId = uuidv4();
    socket.clientId = clientId;
    console.log(`New client connected: ${clientId}`);

    socket.on('message', message => {
        const data = JSON.parse(message.toString('utf8'));

        if (data.type === 'signup') {
            const { username, password } = data;
            if (users[username]) {
                socket.send(JSON.stringify({ type: 'error', message: 'Username already exists' }));
            } else {
                users[username] = { password, clientId }; // سادہ متن میں پاس ورڈ اسٹور کریں
                socket.username = username;
                socket.send(JSON.stringify({ type: 'signup_success', message: 'Signed up successfully' }));
                // پرانے پیغامات بھیجیں
                messageHistory.forEach(msg => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'history', ...msg }));
                    }
                });
                socket.send(JSON.stringify({ type: 'system', message: `Welcome to the chat, ${username}!` }));
            }
        } else if (data.type === 'login') {
            const { username, password } = data;
            if (users[username] && users[username].password === password) {
                users[username].clientId = clientId;
                socket.username = username;
                socket.send(JSON.stringify({ type: 'login_success', message: 'Logged in successfully' }));
                // پرانے پیغامات بھیجیں
                messageHistory.forEach(msg => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: 'history', ...msg }));
                    }
                });
                socket.send(JSON.stringify({ type: 'system', message: `Welcome back, ${username}!` }));
            } else {
                socket.send(JSON.stringify({ type: 'error', message: 'Invalid username or password' }));
            }
        } else if (data.type === 'message') {
            if (!socket.username) {
                socket.send(JSON.stringify({ type: 'error', message: 'Please sign up or log in first' }));
                return;
            }
            const msgObject = {
                clientId,
                username: socket.username,
                message: data.message,
                timestamp: new Date().toISOString()
            };
            messageHistory.push(msgObject);
            // پیغام کا مواد لاگ نہیں کیا جائے گا
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'message', ...msgObject }));
                }
            });
        }
    });

    socket.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
    });
});

server.listen(8080, () => {
    console.log('Server running at http://localhost:8080');
});