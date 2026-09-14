const {
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../wasi');
const { useMongoDBAuthState } = require('./mongoAuth');

async function wasi_connectSession(usePairingCode = false, customSessionId = null) {

    const sessionId = customSessionId || config.sessionId || 'wasi_session';
    console.log(`🔌 Connecting to session: ${sessionId}`);

    const { state, saveCreds } = await useMongoDBAuthState(sessionId);

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
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 10000,
    };


    const wasi_sock = makeWASocket(socketOptions);

    // PAIRING CODE LOGIC FOR HEROKU LOGS
    const phoneNumber = config.PHONE_NUMBER || process.env.PHONE_NUMBER;
    if (!wasi_sock.authState.creds.registered && phoneNumber) {
        setTimeout(async () => {
            try {
                let cleanedNum = phoneNumber.replace(/[^0-9]/g, '');
                let code = await wasi_sock.requestPairingCode(cleanedNum);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`====================================`);
                console.log(`🔑 YOUR PAIRING CODE IS: ${code}`);
                console.log(`====================================`);
            } catch (err) {
                console.log("❌ Error generating pairing code:", err);
            }
        }, 3000);
    }

    return { wasi_sock, saveCreds };
}


async function wasi_clearSession(customSessionId = null) {
    const sessionId = customSessionId || config.sessionId || 'wasi_session';
    const { useMongoDBAuthState } = require('./mongoAuth');

    // Instantiate with the specific session ID to get the correct model
    const { clearState } = await useMongoDBAuthState(sessionId);
    if (clearState) {
        await clearState();
        console.log(`🗑️ Session cleared from MongoDB: ${sessionId}`);
    }
}

module.exports = { wasi_connectSession, wasi_clearSession };
