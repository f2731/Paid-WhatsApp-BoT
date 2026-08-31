const {
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../wasi');
const { useMongoDBAuthState } = require('./mongoAuth');

async function wasi_connectSession(usePairingCode = true, customSessionId = null, phoneNumber = null) {
    // ----------------------------------------------------------------------------------
    // Use MongoDB Auth State directly
    // This removes the dependency on the local file system which is ephemeral on Heroku.
    // ----------------------------------------------------------------------------------

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
        printQRInTerminal: !usePairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        retryRequestDelayMs: 5000,
        keepAliveIntervalMs: 10000,
        connectTimeoutMs: 60000,
    };

    const wasi_sock = makeWASocket(socketOptions);

    // Pairing Code Request Logic
    const targetPhone = phoneNumber || process.env.PHONE_NUMBER || config.PHONE_NUMBER;
    if (usePairingCode && !wasi_sock.authState.creds.registered) {
        if (!targetPhone) {
            console.log('⚠️ Pairing Code Error: PHONE_NUMBER نہیں ملا!');
        } else {
            setTimeout(async () => {
                try {
                    const cleanNum = targetPhone.replace(/[^0-9]/g, '');
                    let code = await wasi_sock.requestPairingCode(cleanNum);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log(`\n=================================\n🔑 آپ کا Pairing Code ہے: ${code}\n=================================\n`);
                } catch (err) {
                    console.error('Pairing Code جنریٹ کرنے میں غلطی:', err.message);
                }
            }, 3000);
        }
    }

    return { masi_sock: wasi_sock, saveCreds };
}

async function wasi_clearSession(customSessionId = null) {
    const sessionId = customSessionId || config.sessionId || 'wasi_session';
    const { useMongoDBAuthState } = require('./mongoAuth');

    const { clearState } = await useMongoDBAuthState(sessionId);
    if (clearState) {
        await clearState();
        console.log(`🗑️ Session cleared from MongoDB: ${sessionId}`);
    }
}

module.exports = { wasi_connectSession, wasi_clearSession };
