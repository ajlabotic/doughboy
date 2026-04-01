var { createClient } = require('@supabase/supabase-js')
var { encrypt, decrypt } = require('./crypto-utils')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var body = req.body || {}
  var method = body.method
  var userId = body.userId

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' })
  }

  var supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  try {
    // ===== SAVE =====
    if (method === 'save') {
      var supplierName = body.supplierName
      var websiteUrl = body.websiteUrl
      var loginUrl = body.loginUrl
      var username = body.username
      var password = body.password

      if (!supplierName || !username || !password) {
        return res.status(400).json({ error: 'Missing supplier name, username, or password' })
      }

      var encryptedUsername = encrypt(username)
      var encryptedPassword = encrypt(password)

      var result = await supabase
        .from('supplier_credentials')
        .upsert({
          user_id: userId,
          supplier_name: supplierName,
          website_url: websiteUrl || '',
          login_url: loginUrl || '',
          encrypted_username: encryptedUsername,
          encrypted_password: encryptedPassword,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,supplier_name',
          ignoreDuplicates: false
        })

      if (result.error) {
        console.error('Supplier save error:', result.error)
        return res.status(500).json({ success: false, error: result.error.message })
      }

      return res.status(200).json({ success: true, message: 'Supplier saved' })
    }

    // ===== LIST =====
    if (method === 'list') {
      var listResult = await supabase
        .from('supplier_credentials')
        .select('supplier_name, website_url, login_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      return res.status(200).json({
        success: true,
        suppliers: listResult.data || []
      })
    }

    // ===== DELETE =====
    if (method === 'delete') {
      var supplierToDelete = body.supplierName

      if (!supplierToDelete) {
        return res.status(400).json({ error: 'Missing supplier name' })
      }

      var deleteResult = await supabase
        .from('supplier_credentials')
        .delete()
        .eq('user_id', userId)
        .eq('supplier_name', supplierToDelete)

      if (deleteResult.error) {
        console.error('Supplier delete error:', deleteResult.error)
        return res.status(500).json({ success: false, error: deleteResult.error.message })
      }

      return res.status(200).json({ success: true, message: 'Supplier removed' })
    }

    // ===== GET (server-side only, returns decrypted credentials) =====
    if (method === 'get') {
      var supplierToGet = body.supplierName

      if (!supplierToGet) {
        return res.status(400).json({ error: 'Missing supplier name' })
      }

      var getResult = await supabase
        .from('supplier_credentials')
        .select('encrypted_username, encrypted_password, website_url, login_url')
        .eq('user_id', userId)
        .eq('supplier_name', supplierToGet)
        .maybeSingle()

      if (!getResult.data) {
        return res.status(404).json({ error: 'Supplier not found' })
      }

      var decryptedUsername = decrypt(getResult.data.encrypted_username)
      var decryptedPassword = decrypt(getResult.data.encrypted_password)

      return res.status(200).json({
        success: true,
        username: decryptedUsername,
        password: decryptedPassword,
        websiteUrl: getResult.data.website_url,
        loginUrl: getResult.data.login_url
      })
    }

    return res.status(400).json({ error: 'Invalid method. Use save, list, delete, or get.' })

  } catch (error) {
    console.error('Supplier credentials error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
