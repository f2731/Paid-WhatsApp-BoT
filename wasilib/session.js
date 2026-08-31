const {
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    Browsers,
    useMultiFileAuthState
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../kaif');
const { useMongoDBAuthState } = require('./mongoAuth');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

async function kaif_connectSession(usePairingCode = false, customSessionId = null) {
    const sessionId = customSessionId || config.sessionId || 'kaif_session';
    console.log(`🔌 Connecting to session: ${sessionId}`);

    let state, saveCreds;
    let usedMongo = false;

    if (config.mongoDbUrl) {
        if (mongoose.connection.readyState !== 1) {
            let waitCount = 0;
            while (mongoose.connection.readyState !== 1 && waitCount < 10) {
                await new Promise(r => setTimeout(r, 500));
                waitCount++;
            }
        }

        if (mongoose.connection.readyState === 1) {
            try {
                console.log(`💾 Using MongoDB session storage for: ${sessionId}`);
                const auth = await useMongoDBAuthState(sessionId);
                state = auth.state;
                saveCreds = auth.saveCreds;
                usedMongo = true;
            } catch (e) {
                console.error(`⚠️ MongoDB Auth State initialization error: ${e.message}`);
            }
        }
    }

    if (!usedMongo) {
        console.log(`📁 Using local multi-file session storage for: ${sessionId}`);
        const sessionPath = path.join(process.cwd(), sessionId);
        const auth = await useMultiFileAuthState(sessionPath);
        state = auth.state;
        saveCreds = auth.saveCreds;
    }

    let version;
    try {
        const v = await fetchLatestWaWebVersion();
        version = v.version;
    } catch (e) {
        version = [2, 3000, 1017531287];
    }

    const socketOptions = {
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        retryRequestDelayMs: 5000,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 60000,
    };

    const kaif_sock = makeWASocket(socketOptions);

    return { kaif_sock, saveCreds };
}

function kaif_normalizePhone(num) {
    if (!num) return '';
    let cleaned = String(num).replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('03') && cleaned.length === 11) {
        cleaned = '92' + cleaned.slice(1);
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = '92' + cleaned.slice(1);
    } else if (cleaned.length === 10 && cleaned.startsWith('3')) {
        cleaned = '92' + cleaned;
    }
    return cleaned;
}

async function kaif_requestPairingCode(kaif_sock, phoneNumber) {
    if (!kaif_sock) throw new Error('No active session socket to request a pairing code from.');
    if (kaif_sock.authState?.creds?.registered) {
        throw new Error('Session is already registered/connected. Pairing code is not needed.');
    }
    const cleanNumber = kaif_normalizePhone(phoneNumber);
    if (!cleanNumber || cleanNumber.length < 6) {
        throw new Error('Please provide a valid phone number with country code (e.g. 923453684061 or 03453684061).');
    }
    const code = await kaif_sock.requestPairingCode(cleanNumber);
    return code;
}

async function kaif_clearSession(customSessionId = null) {
    const sessionId = customSessionId || config.sessionId || 'kaif_session';

    if (config.mongoDbUrl && mongoose.connection.readyState === 1) {
        try {
            const { useMongoDBAuthState } = require('./mongoAuth');
            const { clearState } = await useMongoDBAuthState(sessionId);
            if (clearState) {
                await clearState();
                console.log(`🗑️ Session cleared from MongoDB: ${sessionId}`);
            }
        } catch (e) {
            console.error(`MongoDB clearState error: ${e.message}`);
        }
    }

    const sessionPath = path.join(process.cwd(), sessionId);
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`🗑️ Local session directory cleared: ${sessionPath}`);
        } catch (err) {
            console.error(`Error deleting local session folder: ${err.message}`);
        }
    }
}

module.exports = { kaif_connectSession, kaif_clearSession, kaif_requestPairingCode };