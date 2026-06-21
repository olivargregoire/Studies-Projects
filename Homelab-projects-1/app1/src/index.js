const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok' }));
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from a very simple Node server\n');
});

server.listen(PORT, () => console.log(`Listening on :${PORT}`));
