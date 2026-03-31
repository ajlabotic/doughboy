var crypto = require('crypto')

var ALGORITHM = 'aes-256-gcm'

function encrypt(text) {
  var key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'hex')
  var iv = crypto.randomBytes(16)
  var cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  var encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  var authTag = cipher.getAuthTag().toString('hex')
  return iv.toString('hex') + ':' + authTag + ':' + encrypted
}

function decrypt(encryptedText) {
  var key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, 'hex')
  var parts = encryptedText.split(':')
  var iv = Buffer.from(parts[0], 'hex')
  var authTag = Buffer.from(parts[1], 'hex')
  var encrypted = parts[2]
  var decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  var decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

module.exports = { encrypt: encrypt, decrypt: decrypt }
