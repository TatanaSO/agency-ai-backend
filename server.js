const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
const path = require('path');

dotenv.config();
const app = express();

app.use(cors({
        origin: [
                    'http://localhost:5173',
                    'http://localhost:4173',
                    'https://agency-hub-ny.netlify.app',
                    /\.netlify\.app$/
                ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
});

// CREDIT SYSTEM CONFIG
const CREDITS_FILE = path.join(__dirname, 'credits.json');
const TOKEN_COSTS = {
        'viral-clone': {
                    tokens: 50,
                    label: 'Clonador Viral (Whisper + GPT-4o)',
                    description: 'Transcripcion real + analisis forense + guion completo'
        },
        'strategy': {
                    tokens: 20,
                    label: 'Estrategia Semanal (GPT-4o)',
                    description: 'Matriz de contenido con 5 ideas personalizadas'
        },
        'flyer-copy': {
                    tokens: 15,
                    label: 'Copy de Flyer (GPT-4o)',
                    description: 'Textos profesionales para evento'
        },
        'dalle-flyer': {
                    tokens: 35,
                    label: 'Fondo DALL-E 3 (HD 9:16)',
                    description: 'Imagen fotorrealista 8K para flyer'
        }
};

const PLANS = {
        starter: { name: 'Starter', tokens: 1000, price: 49 },
        pro: { name: 'Pro', tokens: 3500, price: 129 },
        agency: { name: 'Agency', tokens: 10000, price: 299 }
};

function loadCredits() {
        try {
                    return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
        } catch {
                    const defaults = {
                                    lacancha: { balance: 1000, plan: 'starter', transactions: [] },
                                    smeat: { balance: 1000, plan: 'starter', transactions: [] }
                    };
                    fs.writeFileSync(CREDITS_FILE, JSON.stringify(defaults, null, 2));
                    return defaults;
        }
}

function saveCredits(data) {
        fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
}

function deductTokens(brand, operation, details = '') {
        const cost = TOKEN_COSTS[operation];
        if (!cost) return { success: false, error: 'Operacion desconocida' };

    const credits = loadCredits();
        if (!credits[brand]) credits[brand] = { balance: 0, plan: 'starter', transactions: [] };

    const remaining = credits[brand].balance - cost.tokens;
        if (remaining < 0) {
                    return {
                                    success: false,
                                    error: 'Saldo insuficiente. Recarga tokens para continuar.',
                                    balance: credits[brand].balance,
                                    cost: cost.tokens
                    };
        }

    credits[brand].balance = remaining;
        credits[brand].transactions = [
            {
                            date: new Date().toISOString(),
                            operation: cost.label,
                            cost: cost.tokens,
                            balance: remaining,
                            details
            },
                    ...(credits[brand].transactions || []).slice(0, 49)
                ];

    saveCredits(credits);
        return { success: true, cost: cost.tokens, balance: remaining };
}

// TOKEN ENDPOINTS
app.get('/api/tokens/balance/:brand', (req, res) => {
        const credits = loadCredits();
        const brand = req.params.brand;
        const data = credits[brand] || { balance: 0, plan: 'starter', transactions: [] };

            res.json({
                        balance: data.balance,
                        plan: data.plan,
                        planInfo: PLANS[data.plan] || PLANS.starter,
                        transactions: data.transactions.slice(0, 10),
                        costs: TOKEN_COSTS,
                        plans: PLANS
            });
});

app.post('/api/tokens/add', (req, res) => {
        const { brand, tokens, plan } = req.body;
        if (!brand || !tokens) return res.status(400).json({ error: 'brand y tokens son requeridos' });

             const credits = loadCredits();
        if (!credits[brand]) credits[brand] = { balance: 0, plan: 'starter', transactions: [] };

             credits[brand].balance += parseInt(tokens);
        if (plan) credits[brand].plan = plan;

             credits[brand].transactions = [
                 {
                                 date: new Date().toISOString(),
                                 operation: 'Recarga Manual',
                                 cost: -tokens,
                                 balance: credits[brand].balance,
                                 details: `Admin: +${tokens} tokens`
                 },
                         ...(credits[brand].transactions || []).slice(0, 49)
                     ];

             saveCredits(credits);
        res.json({ success: true, balance: credits[brand].balance, brand });
});

app.get('/api/tokens/pricing', (req, res) => {
        res.json({ costs: TOKEN_COSTS, plans: PLANS });
});

// AUDIO UTILS
async function downloadAudioBuffer(audioUrl) {
        try {
                    const response = await fetch(audioUrl, {
                                    headers: {
                                                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                                                        'Referer': 'https://www.tiktok.com/'
                                    }
                    });
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return Buffer.from(await response.arrayBuffer());
        } catch (err) {
                    console.warn('[Audio] Descarga fallo:', err.message);
                    return null;
        }
}

async function transcribeAudio(audioBuffer) {
        try {
                    const file = await toFile(audioBuffer, 'video.mp4', { type: 'audio/mp4' });
                    const t = await openai.audio.transcriptions.create({
                                    file,
                                    model: 'whisper-1',
                                    language: 'es',
                                    response_format: 'text'
                    });
                    return t || null;
        } catch (err) {
                    console.warn('[Whisper] Fallo:', err.message);
                    return null;
        }
}

async function scrapeVideo(url) {
        try {
                    if (url.includes('tiktok.com')) {
                                    const res = await fetch('https://www.tikwm.com/api/?url=' + url);
                                    const json = await res.json();
                                    if (json?.data) {
                                                        const d = json.data;
                                                        return {
                                                                                title: d.title || '',
                                                                                view_count: d.play_count || null,
                                                                                like_count: d.digg_count || null,
                                                                                comment_count: d.comment_count || null,
                                                                                repost_count: d.share_count || null,
                                                                                audio_url: d.music_info?.play || d.wmplay || d.play || null,
                                                                                video_url: d.play || null,
                                                                                duration: d.duration || null
                                                        };
                                    }
                    }
                    return { title: 'Solo TikTok soportado', view_count: 0 };
        } catch (err) {
                    return { title: 'Unknown', view_count: null };
        }
}

app.post('/api/viral-cloner', async (req, res) => {
        const { url, brand, objective } = req.body;
        if (!url) return res.status(400).json({ error: 'URL requerida' });
        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

             const tokenCheck = deductTokens(brand, 'viral-clone', url);
        if (!tokenCheck.success) {
                    return res.status(402).json({
                                    error: tokenCheck.error,
                                    balance: tokenCheck.balance,
                                    cost: tokenCheck.cost,
                                    code: 'INSUFFICIENT_TOKENS'
                    });
        }

             try {
                         const videoData = await scrapeVideo(url);
                         let realTranscript = null;

            const audioUrl = videoData.audio_url || videoData.video_url;
                         if (audioUrl) {
                                         const buffer = await downloadAudioBuffer(audioUrl);
                                         if (buffer?.length > 0) realTranscript = await transcribeAudio(buffer);
                         }

            const views = videoData.view_count || 0;
                         const likes = videoData.like_count || 0;
                         const comments = videoData.comment_count || 0;
                         const shares = videoData.repost_count || 0;

            const engagementRate = views > 0 ? (((likes + comments + shares) / views) * 100).toFixed(2) : '0.00';
                         const likeToViewRatio = views > 0 ? ((likes / views) * 100).toFixed(2) : '0.00';
                         const commentToLikeRatio = likes > 0 ? ((comments / likes) * 100).toFixed(2) : '0.00';
                         const shareViralCoeff = views > 0 ? ((shares / views) * 1000).toFixed(2) : '0.00';

            let performanceTier = 'Micro-Viral';
                         if (views > 10000000) performanceTier = 'MEGA-VIRAL 10M+';
                         else if (views > 1000000) performanceTier = 'Super-Viral 1M+';
                         else if (views > 100000) performanceTier = 'Top-Viral 100K+';
                         else if (views > 10000) performanceTier = 'Viral-Local 10K+';

            const brandContext = brand === 'lacancha' 
                ? 'La Cancha: Sede de la seleccion colombia en NY, eventos, tejo, rumba. Colombianos/latinos en NY.' 
                            : 'S.Meat & Hueso: Restaurante Asador NY. All you can eat, fuego, lena. Foodies en NY.';

            const guionContext = realTranscript 
                ? `TRANSCRIPCION REAL (Whisper):\n${realTranscript}` 
                            : `METADATA - Titulo: ${videoData.title}`;

            const systemPrompt = `Eres el mejor Clonador Viral del mundo. Transcriptor Forense + Director Creativo. FORMULA DE PUNTUACION (OBLIGATORIA): - Like/View (40pts): >5%=40, >2%=28, >0.5%=16, <0.5%=8 - Comment (30pts): ratio >8%=30, >4%=22, >1%=14, <1%=6 - Share (30pts): coeff >5=30, >2=22, >0.5=12, <0.5=5 Responde UNICAMENTE JSON: { "originalScript": "Guion completo palabra por palabra, de inicio a fin", "clonedScript": "Clon completo, mismo largo, adaptado a la marca", "psychology": "Tecnica viral especifica identificada", "viralScore": 0, "scoringBreakdown": { "likeViewScore": "XX/40 - razon", "commentScore": "XX/30 - razon", "shareScore": "XX/30 - razon" }, "predictiveFeedback": ["feedback 1", "feedback 2", "feedback 3"], "shotList": ["Toma 1", "Toma 2", "Toma 3", "Toma 4", "Toma 5"], "storyboard": [{ "time": "0s-3s", "camera": "", "action": "", "audio": "", "text": "" }], "copySEO": { "caption": "", "hashtags": [] } }`;

            const completion = await openai.chat.completions.create({
                            model: 'gpt-4o',
                            temperature: 0.55,
                            response_format: { type: 'json_object' },
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: `Marca: ${brandContext}\nObjetivo: ${objective}\nMetricas: Views=${views}, Likes=${likes}, Comments=${comments}, Shares=${shares}\nEngagement=${engagementRate}% | Like/View=${likeToViewRatio}% | Comment/Like=${commentToLikeRatio}% | Share Coeff=${shareViralCoeff}\nTier: ${performanceTier}\n\n${guionContext}` }
                                            ]
            });

            const aiPayload = JSON.parse(completion.choices[0].message.content);

            res.json({
                            stats: {
                                                views, likes, comments, shares,
                                                engagementRate: parseFloat(engagementRate),
                                                likeToViewRatio: parseFloat(likeToViewRatio),
                                                commentToLikeRatio: parseFloat(commentToLikeRatio),
                                                shareViralCoeff: parseFloat(shareViralCoeff),
                                                performanceTier,
                                                transcriptSource: realTranscript ? 'whisper_real' : 'metadata'
                            },
                            tokens: { cost: tokenCheck.cost, balance: tokenCheck.balance },
                            ...aiPayload
            });

             } catch (err) {
                         console.error('[viral-cloner]', err);
                         res.status(500).json({ error: err.message });
             }
});

app.post('/api/strategy', async (req, res) => {
        const { brand, eventType, date, extraContext } = req.body;
        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

             const tokenCheck = deductTokens(brand, 'strategy', eventType);
        if (!tokenCheck.success) {
                    return res.status(402).json({
                                    error: tokenCheck.error,
                                    balance: tokenCheck.balance,
                                    cost: tokenCheck.cost,
                                    code: 'INSUFFICIENT_TOKENS'
                    });
        }

             try {
                         const brandContext = brand === 'lacancha' ? 'La Cancha (eventos latinos NY)' : 'S.Meat & Hueso (restaurante asador NY)';
                         const completion = await openai.chat.completions.create({
                                         model: 'gpt-4o',
                                         temperature: 0.7,
                                         response_format: { type: 'json_object' },
                                         messages: [
                                             { role: 'system', content: 'Matriz de Contenido. JSON: { "funnelDistribution": {}, "strategy": [] }' },
                                             { role: 'user', content: `Marca: ${brandContext}\nEvento: ${eventType}` }
                                                         ]
                         });

            const data = JSON.parse(completion.choices[0].message.content);
                         res.json({ ...data, tokens: { cost: tokenCheck.cost, balance: tokenCheck.balance } });
             } catch (err) {
                         res.status(500).json({ error: err.message });
             }
});

app.post('/api/flyer-copy', async (req, res) => {
        const { brand, eventType, discount, targetAudience } = req.body;
        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

             const tokenCheck = deductTokens(brand, 'flyer-copy', eventType);
        if (!tokenCheck.success) {
                    return res.status(402).json({
                                    error: tokenCheck.error,
                                    balance: tokenCheck.balance,
                                    cost: tokenCheck.cost,
                                    code: 'INSUFFICIENT_TOKENS'
                    });
        }

             try {
                         const brandContext = brand === 'lacancha' ? 'La Cancha' : 'S.Meat & Hueso';
                         const completion = await openai.chat.completions.create({
                                         model: 'gpt-4o',
                                         temperature: 0.8,
                                         response_format: { type: 'json_object' },
                                         messages: [
                                             { role: 'system', content: 'Copywriter. JSON: { "topDate": "", "cursiveHeadline": "", "mainArtist": "", "prices": {}, "callToAction": "", "promptImagen": "" }' },
                                             { role: 'user', content: `Marca: ${brandContext}\nEvento: ${eventType}` }
                                                         ]
                         });

            const data = JSON.parse(completion.choices[0].message.content);
                         res.json({ ...data, tokens: { cost: tokenCheck.cost, balance: tokenCheck.balance } });
             } catch (err) {
                         res.status(500).json({ error: err.message });
             }
});

app.post('/api/dalle-flyer', async (req, res) => {
        const { eventType, brand } = req.body;
        if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'API key no configurada' });

             const tokenCheck = deductTokens(brand, 'dalle-flyer', eventType);
        if (!tokenCheck.success) {
                    return res.status(402).json({
                                    error: tokenCheck.error,
                                    balance: tokenCheck.balance,
                                    cost: tokenCheck.cost,
                                    code: 'INSUFFICIENT_TOKENS'
                    });
        }

             try {
                         const brandStyle = brand === 'lacancha' ? 'Urban latin club' : 'Premium steakhouse';
                         const prompt = `${brandStyle} Event: ${eventType}. NO TEXT. 8K poster vertical.`;

            const response = await openai.images.generate({
                            model: 'dall-e-3',
                            prompt,
                            n: 1,
                            size: '1024x1792'
            });

            res.json({ imageUrl: response.data[0].url, tokens: { cost: tokenCheck.cost, balance: tokenCheck.balance } });
             } catch (err) {
                         res.status(500).json({ error: err.message });
             }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log('Agency Backend V5 on PORT ' + PORT));
