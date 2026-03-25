const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const youtubedl = require('youtube-dl-exec');
const { Readable } = require('stream');
const { toFile } = require('openai');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Descarga el audio del video en memoria, sin guardarlo en disco
async function downloadAudioBuffer(audioUrl) {
  try {
    const response = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.tiktok.com/'
      }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.warn('No se pudo descargar audio:', err.message);
    return null;
  }
}

// Transcribir audio con OpenAI Whisper
async function transcribeAudio(audioBuffer, filename) {
  try {
    const file = await toFile(audioBuffer, filename, { type: 'audio/mp4' });
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'es',
      response_format: 'verbose_json',
      timestamp_granularities: ['word']
    });
    return transcription.text || '';
  } catch (err) {
    console.warn('Whisper fallo:', err.message);
    return null;
  }
}

async function scrapeVideo(url) {
  try {
    if (url.includes('tiktok.com')) {
      const res = await fetch('https://www.tikwm.com/api/?url=' + url);
      const json = await res.json();
      if (json && json.data) {
        const d = json.data;
        return {
          title: d.title || '',
          description: d.title + '\n' + (d.content_desc || []).join(' '),
          tags: [],
          view_count: d.play_count || null,
          like_count: d.digg_count || null,
          comment_count: d.comment_count || null,
          repost_count: d.share_count || null,
          // Audio/Video URLs de tikwm
          audio_url: d.music_info?.play || d.wmplay || d.play || null,
          video_url: d.play || null,
          duration: d.duration || null
        };
      }
    }

    const output = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      skipDownload: true,
    });
    return {
      title: output.title || '',
      description: output.description || '',
      tags: output.tags || [],
      view_count: output.view_count || null,
      like_count: output.like_count || null,
      comment_count: output.comment_count || null,
      repost_count: output.repost_count || null,
      audio_url: output.url || null,
      video_url: output.url || null,
      duration: output.duration || null
    };
  } catch (error) {
    return { title: 'Unknown', description: 'Bloqueo anti-scraping/URL privada.', tags: [], view_count: null, like_count: null, comment_count: null, repost_count: null };
  }
}

// Clonador Viral V4 -> Transcripcion Real + Auditoria Forense + Clonacion Completa
app.post('/api/viral-cloner', async (req, res) => {
  const { url, brand, objective } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('pon_tu_llave_aqui')) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada.' });
  }

  try {
    console.log('[V4] Scrapeando video:', url);
    const videoData = await scrapeVideo(url);
    
    // *** PASO 1: TRANSCRIPCION REAL CON WHISPER ***
    let realTranscript = null;
    let transcriptSource = 'metadata';
    
    // Intentar transcribir audio real si tenemos URL
    const audioTargetUrl = videoData.audio_url || videoData.video_url;
    if (audioTargetUrl && process.env.OPENAI_API_KEY) {
      console.log('[V4] Descargando audio para Whisper...');
      const audioBuffer = await downloadAudioBuffer(audioTargetUrl);
      if (audioBuffer && audioBuffer.length > 0) {
        console.log('[V4] Transcribiendo con Whisper (' + (audioBuffer.length / 1024).toFixed(0) + 'KB)...');
        realTranscript = await transcribeAudio(audioBuffer, 'video.mp4');
        if (realTranscript) {
          transcriptSource = 'whisper_real';
          console.log('[V4] Transcripcion Whisper OK: ' + realTranscript.substring(0, 80) + '...');
        }
      }
    }

    // *** PASO 2: CALCULAR METRICAS REALES ***
    const views = videoData.view_count || 0;
    const likes = videoData.like_count || 0;
    const comments = videoData.comment_count || 0;
    const shares = videoData.repost_count || 0;
    
    const engagementRate = views > 0 ? (((likes + comments + shares) / views) * 100).toFixed(2) : '0.00';
    const likeToViewRatio = views > 0 ? ((likes / views) * 100).toFixed(2) : '0.00';
    const commentToLikeRatio = likes > 0 ? ((comments / likes) * 100).toFixed(2) : '0.00';
    const shareViralCoeff = views > 0 ? ((shares / views) * 1000).toFixed(2) : '0.00';
    
    let performanceTier = 'Micro-Viral';
    if (views > 10000000) performanceTier = 'MEGA-VIRAL (10M+)';
    else if (views > 1000000) performanceTier = 'Super-Viral (1M+)';
    else if (views > 100000) performanceTier = 'Top-Viral (100K+)';
    else if (views > 10000) performanceTier = 'Viral-Local (10K+)';

    const realMetricsContext = 
      '=== DATOS ANALITICOS REALES ===\n' +
      'Vistas: ' + views.toLocaleString() + '\n' +
      'Likes: ' + likes.toLocaleString() + '\n' +
      'Comentarios: ' + comments.toLocaleString() + '\n' +
      'Compartidos: ' + shares.toLocaleString() + '\n' +
      'Engagement Rate: ' + engagementRate + '% (benchmark: >3% exitoso, >6% viral)\n' +
      'Like/View Ratio: ' + likeToViewRatio + '% (>5% = muy resonante)\n' +
      'Comment/Like Ratio: ' + commentToLikeRatio + '% (>5% = genera debate)\n' +
      'Share Viral Coeff: ' + shareViralCoeff + '/1000views (>3 = altamente compartible)\n' +
      'Clasificacion: ' + performanceTier + '\n' +
      'Duracion: ' + (videoData.duration ? videoData.duration + 's' : 'desconocida') + '\n';

    // *** PASO 3: CONTEXTO DEL GUION (REAL O DEDUCCION) ***
    const guionContext = realTranscript 
      ? '=== TRANSCRIPCION REAL DEL AUDIO (Whisper) ===\n' + realTranscript + '\n\n[FUENTE: Transcripcion real del audio del video]'
      : '=== METADATA DEL VIDEO (Deduccion) ===\nTitulo: ' + videoData.title + '\nDescripcion: ' + videoData.description + '\nTags: ' + (videoData.tags || []).join(', ') + '\n\n[FUENTE: Metadata - audio no disponible para transcripcion directa]';
    
    const brandContext = brand === 'lacancha' 
      ? 'La Cancha: Sede de la seleccion colombia en NY, eventos, tejo, rumba. Audiencia: Colombianos y latinos en NY buscando fiesta y futbol.'
      : 'S.Meat & Hueso: Restaurante Asador en NY. Audiencia: Foodies en NY buscando carne al carbon, lena y experiencia all you can eat.';

    const systemPrompt = `Eres el mejor Clonador Viral del mundo. Eres: Transcriptor Forense, Analista de Viralidad, Director Creativo y Filmmaker.

MISION CRITICA:
Debes clonar el video viral COMPLETAMENTE, de inicio a fin, palabra por palabra, adaptado al 100% a nuestra marca.

REGLAS ABSOLUTAS:
1. El "originalScript" debe contener el guion COMPLETO del video de inicio a fin, sin omitir nada. Si tienes la transcripcion real de Whisper, usala EXACTA. Si solo tienes metadata, DEDUCE el guion completo de forma plausible basandote en el titulo, descripcion y estilo del video.
2. El "clonedScript" debe ser igualmente completo - mismo largo, misma estructura, mismos beats emocionales, pero 100% adaptado a nuestra marca/objetivo. CADA linea del original debe tener su equivalente en el clon. No acortes nada.
3. El viralScore se calcula con formula ponderada REAL:
   - Like/View sub-score (40pts): ratio >5% = 40pts, >2% = 28pts, >0.5% = 16pts, <0.5% = 8pts
   - Comment Engagement (30pts): comment/like >8% = 30pts, >4% = 22pts, >1% = 14pts, <1% = 6pts
   - Share Viral (30pts): shares/1000views >5 = 30pts, >2 = 22pts, >0.5 = 12pts, <0.5 = 5pts
4. predictiveFeedback debe ser hiper-especifico al guion real analizado.
5. El storyboard debe tener tantas filas como segmentos naturales tenga el video (minimo 5 filas, idealmente 8-12).

Responde UNICAMENTE en JSON:
{
  "originalScript": "TRANSCRIPCION COMPLETA DE INICIO A FIN. Cada palabra del video. No omitir nada. Si es deduccion, hazla plausible y completa.",
  "clonedScript": "CLON COMPLETO con la misma extension. Cada line del original tiene su equivalente adaptado. Objetivo de marca integrado naturalmente.",
  "psychology": "Tecnica especifica que made this video viral (nombrarla exactamente) y como se adapta al ADN de la marca.",
  "viralScore": 0,
  "scoringBreakdown": {
    "likeViewScore": "XX/40 pts - razon basada en el ${likeToViewRatio}% ratio real",
    "commentScore": "XX/30 pts - razon basada en el ${commentToLikeRatio}% ratio real",
    "shareScore": "XX/30 pts - razon basada en el ${shareViralCoeff} coeff real"
  },
  "predictiveFeedback": [
    "Feedback 1 anclado en la debilidad mas clara de las metricas reales",
    "Feedback 2 con tecnica concreta y timing exacto (ej: segundo 2-4)",
    "Feedback 3 con una mejora especifica al guion clonado"
  ],
  "shotList": ["Toma 1: equipo y angulo exacto", "Toma 2...", "Toma 3...", "Toma 4...", "Toma 5..."],
  "storyboard": [
    { "time": "0s - 3s", "camera": "Angulo exacto", "action": "Que ocurre fisicamente", "audio": "Locucion exacta palabra por palabra del clon", "text": "Texto exacto en pantalla" },
    { "time": "3s - 7s", "camera": "...", "action": "...", "audio": "...", "text": "..." },
    { "time": "7s - 12s", "camera": "...", "action": "...", "audio": "...", "text": "..." },
    { "time": "12s - 18s", "camera": "...", "action": "...", "audio": "...", "text": "..." },
    { "time": "18s - Final", "camera": "...", "action": "...", "audio": "...", "text": "..." }
  ],
  "copySEO": {
    "caption": "Caption completo con estructura AIDA optimizado para la plataforma",
    "hashtags": ["#nyc", "#..."]
  }
}`;

    console.log('[V4] Enviando a GPT-4o para clonacion completa...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.55,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'MARCA:\n' + brandContext + '\n\nOBJETIVO:\n' + (objective || 'Conocimiento de marca / Atraccion organica') + '\n\n' + realMetricsContext + '\n\n' + guionContext + '\n\nClona el video de inicio a fin, completo.' }
      ],
    });

    const aiPayload = JSON.parse(completion.choices[0].message.content);
    
    res.json({
      stats: {
        views: videoData.view_count,
        likes: videoData.like_count,
        comments: videoData.comment_count,
        shares: videoData.repost_count,
        engagementRate: parseFloat(engagementRate),
        likeToViewRatio: parseFloat(likeToViewRatio),
        commentToLikeRatio: parseFloat(commentToLikeRatio),
        shareViralCoeff: parseFloat(shareViralCoeff),
        performanceTier,
        transcriptSource // 'whisper_real' o 'metadata'
      },
      ...aiPayload
    });

  } catch (error) {
    console.error('Error en Viral Cloner V4:', error);
    res.status(500).json({ error: error.message || 'Error procesando el guion.' });
  }
});

// Estrategia Endpoint V2
app.post('/api/strategy', async (req, res) => {
  const { brand, eventType, date, extraContext } = req.body;
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('pon_tu_llave_aqui')) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada.' });
  }

  try {
    const brandContext = brand === 'lacancha' 
      ? 'La Cancha: Sede seleccion colombia NY, fiestas, futbol, tejo.'
      : 'S.Meat & Hueso: Restaurante Asador NY, all you can eat, fuego, lena.';

    const systemPrompt = `Eres un equipo de Estrategia Publicitaria Digital de alto nivel.
Disena una Matriz de Contenido basada en el embudo completo (Top: Alcance, Middle: Educacion, Bottom: Venta) para el evento dado. Genera exactamente 5 ideas.

Responde UNICAMENTE en JSON:
{
  "funnelDistribution": { "top": "40", "middle": "40", "bottom": "20" },
  "strategy": [
    { "phase": "Top/Mid/Bottom", "day": "Dia de la semana", "type": "Formato", "title": "Hook o Concepto Central", "description": "Como se ejecuta" }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Marca: ' + brandContext + '\nEvento: ' + eventType + '\nFechas: ' + date + '\nCondiciones: ' + extraContext }
      ],
    });

    res.json(JSON.parse(completion.choices[0].message.content));

  } catch (error) {
    console.error('Error en Strategy V2:', error);
    res.status(500).json({ error: error.message || 'Error procesando la estrategia.' });
  }
});

// Flyer Copy Endpoint V3
app.post('/api/flyer-copy', async (req, res) => {
  const { brand, eventType, discount, targetAudience } = req.body;
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada.' });

  try {
    const brandContext = brand === 'lacancha' ? 'La Cancha (Eventos Latinos, Conciertos Urbano/Salsa, Rumba)' : 'S.Meat & Hueso (Restaurante Asador VIP, Noches de Artistas)';
    const systemPrompt = `Eres un Copywriter y Director de Arte Experto.
Genera textos estructurados para un Flyer de Concierto/Promocion de nivel Premium.

Responde UNICAMENTE en JSON:
{
  "topDate": "Fecha iconica corta (Ej. SAB 21 FEBRERO)",
  "topTime": "Hora o texto corto (Ej. 9PM DOORS OPEN)",
  "cursiveHeadline": "Frase en cursiva (Ej. Celebrando Amor & Amistad)",
  "mainArtist": "ARTISTA PRINCIPAL EN MAYUSCULAS GIGANTES",
  "djsOrExtras": "Info Secundaria o DJs (Ej. DJS INVITADOS: MANCHO, GEORGE, LEXX)",
  "prices": {
    "vip": "Precio VIP (Ej. GOLDEN VIP $80)",
    "general": "Precio General (Ej. GENERAL $40)"
  },
  "footerNotes": "Restricciones (Ej. 21+ STRICT DRESS CODE | VALET PARKING)",
  "callToAction": "Llamado y Tel (Ej. INFO & RESERVAS: 718-496-1252)",
  "promptImagen": "Background visual"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Marca: ' + brandContext + '\nConcepto: ' + eventType + '\nOfertas/Precios: ' + discount + '\nAudiencia: ' + targetAudience + '\n\nEstructura el arte final para el flyer.' }
      ],
    });

    res.json(JSON.parse(completion.choices[0].message.content));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error procesando el Copy.' });
  }
});

// MasterFlyer DALL-E 3 Background Endpoint
app.post('/api/dalle-flyer', async (req, res) => {
  const { eventType, brand } = req.body;
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada.' });

  try {
    const brandStyle = brand === 'lacancha' 
      ? 'Urban latin superclub, red and black aesthetics, laser beams, stage smoke, vibrant neon red glowing volumetric lights.'
      : 'Premium steakhouse VIP lounge, golden and black aesthetics, elegant glowing gold particles, luxurious cinematic stage.';

    const prompt = 'Design an ultra-premium, photorealistic advertising flyer BACKGROUND ONLY.\nTheme: ' + brandStyle + '\nEvent Vibe: ' + eventType + '\nCRITICAL RULES:\n1. ABSOLUTELY NO TEXT OR TYPOGRAPHY AT ALL. ZERO WORDS.\n2. NO PEOPLE OR CHARACTERS.\n3. Keep the center-bottom area dark/empty to place an artist portrait later.\n4. Fill the edges and top with cinematic 3D lighting, stage smoke, laser effects, or golden sparks.\n5. Hyper-realistic, 8k resolution, Unreal Engine 5 render style. Poster vertical format.';

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1792',
      quality: 'hd',
    });

    res.json({ imageUrl: response.data[0].url });
  } catch (error) {
    console.error('DALL-E Error:', error);
    res.status(500).json({ error: error.message || 'Error al generar la imagen.' });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 Agente Backend V4 Whisper+Forense corriendo en http://localhost:${PORT}`));
