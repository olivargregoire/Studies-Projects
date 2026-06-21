const http = require('http');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

//pool = few tcp connections open to the database, and we can use them to query the database without havign to reopen one that is costly. 
const pool = new Pool({
    host: process.env.PGHOST || 'postgres',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'greg',
    password: process.env.PGPASSWORD || 'greg',
    database: process.env.PGDATABASE || 'my_database',
});


const server = http.createServer(async (req, res) => {
    console.log(req.url)
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok' }));
    }

    if (req.url === '/db') {
        try {
            const result = await pool.query(
                'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;'
            );
            const databases = result.rows.map((row) => row.datname);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ databases }));
        } catch (err) {
            console.error('DB query failed:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'database unreachable' }));
        }
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from Node server 1\n');
});

server.listen(PORT, () => console.log(`Listening on :${PORT}`));
