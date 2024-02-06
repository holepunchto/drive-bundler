const sodium = require('sodium-native')

module.exports = !!sodium.crypto_secretstream_xchacha20poly1305_push
