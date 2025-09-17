// app.js
const http = require('http');

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Node app</title>
    </head>
    <body>
      <h1>Hello from Node.js App</h1>
      <p>Node.js application is running</p>
      <p>Current time: ${new Date().toISOString()}</p>
    </body>
    </html>
  `);
});

server.listen(3000, '127.0.0.1', () => {
  console.log('Server running at http://127.0.0.1:3000/');
});
