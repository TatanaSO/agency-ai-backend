const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI, toFile } = require('openai');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

dotenv.config();
const app = express();
app.use(cors()); // Permissive CORS for mobile access
app.use(express.json());

const CREDITS_FILE = path.join(__dirname, 'credits.json');

function loadCredits() {
    try {
          return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
    } catch (err) {
          return { lacancha: { balance: 1000, plan: 'starter' } };
    }
}

function saveCredits(data) {
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/tokens/balance/:brand', (req, res) => {
    const credits = loadCredits();
    const brand = req.params.brand;
    const data = credits[brand] || { balance: 1000, plan: 'starter' };
    res.json(data);
});

app.get('/api/tokens/pricing', (req, res) => {
    res.json({
          costs: { 'viral-clone': { tokens: 50 }, 'strategy': { tokens: 20 }, 'flyer-copy': { tokens: 10 }, 'dalle-flyer': { tokens: 30 } },
          plans: { starter: { name: 'Starter', tokens: 1000, price: 49 }, pro: { name: 'Pro', tokens: 3500, price: 129 } }
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log('Server running'));
