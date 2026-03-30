import { google } from 'googleapis';
import http from 'http';
import url from 'url';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars (or source .env.executive)');
  process.exit(1);
}
const REDIRECT_URI = 'http://localhost:3333';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
});

console.log('AUTH_URL=' + authUrl);

const server = http.createServer(async (req, res) => {
  const query = url.parse(req.url, true).query;
  if (query.code) {
    try {
      const { tokens } = await oauth2Client.getToken(query.code);
      const rt = tokens.refresh_token;
      console.log('REFRESH_TOKEN=' + rt);
      import('fs').then(fs => fs.writeFileSync('local-only/tokens/gmail-refresh-token.txt', rt));
      res.end('Done! You can close this tab.');
      server.close();
    } catch (err) {
      console.error('Error getting token:', err.message);
      res.end('Error: ' + err.message);
    }
  }
}).listen(3333, () => {
  console.log('SERVER_READY=true');
});
