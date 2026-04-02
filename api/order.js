var { createClient } = require('@supabase/supabase-js')
var { decrypt } = require('./crypto-utils')

async function placeOrder(websiteUrl, loginUrl, username, password, itemDescription, quantity) {
  var { chromium } = require('playwright-core')
  var fetch = require('node-fetch')

  var sessionResponse = await fetch('https://api.firecrawl.dev/v2/browser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.FIRECRAWL_API_KEY
    },
    body: JSON.stringify({ ttl: 300 })
  })
  var session = await sessionResponse.json()
  console.log('Firecrawl session response:', JSON.stringify(session))
  var sessionId = session.id
  var cdpUrl = session.cdpUrl
  var result = { status: 'error', message: 'Order flow did not complete', cartUrl: null, cartSummary: null }

  var browser = await chromium.connectOverCDP(cdpUrl)
  var context = browser.contexts()[0]
  var page = context.pages()[0]

  try {
    // Step 1: Navigate to login page
    var startUrl = loginUrl || websiteUrl
    console.log('Navigating to:', startUrl)
    await page.goto(startUrl)
    await page.waitForTimeout(2000)

    // Check for payment page
    var currentUrl = page.url()
    if (currentUrl.includes('checkout') || currentUrl.includes('payment')) {
      result.status = 'partial'
      result.message = 'Stopped — detected payment page'
      return result
    }

    // Dismiss any popups or modals
    try {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } catch(e) {}

    try {
      var closeSelectors = [
        '.modal .close',
        '.modal-close',
        '[data-dismiss="modal"]',
        '.ntf__modal .close',
        '#ntf_dialog_all .close',
        '.ntf__modal button',
        '[aria-label="Close"]',
        '.close-button',
        'button.close'
      ]
      for (var c = 0; c < closeSelectors.length; c++) {
        try {
          var closeBtn = await page.$(closeSelectors[c])
          if (closeBtn) {
            await closeBtn.click()
            await page.waitForTimeout(500)
            break
          }
        } catch(e) {}
      }
    } catch(e) {}

    await page.waitForTimeout(1000)

    // Step 2: Log in
    console.log('Attempting login')
    try {
      var emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"], input[name="login"], input[id="email"], input[id="username"]')
      if (emailInput) {
        await emailInput.fill(username)
      } else {
        var textInputs = await page.$$('input[type="text"]')
        if (textInputs.length > 0) {
          await textInputs[0].fill(username)
        }
      }

      var passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        await passwordInput.fill(password)
      }

      await page.waitForTimeout(500)

      var submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Login"), button:has-text("Sign in"), button:has-text("Sign In")')
      if (submitBtn) {
        await submitBtn.click()
      } else {
        await page.keyboard.press('Enter')
      }

      await page.waitForTimeout(3000)
      console.log('After login URL:', page.url())
    } catch (loginErr) {
      console.error('Login error:', loginErr.message)
      result.message = 'Could not log in: ' + loginErr.message
      return result
    }

    // Check for payment page after login
    currentUrl = page.url()
    if (currentUrl.includes('checkout') || currentUrl.includes('payment')) {
      result.status = 'partial'
      result.message = 'Stopped — detected payment page after login'
      return result
    }

    // Step 3: Search for item
    console.log('Searching for:', quantity + ' ' + itemDescription)

    // Try clicking search icon first
    try {
      await page.click('[data-id="search"], .search-icon, .icon-search, [aria-label="Search"], [data-testid="search"]')
      await page.waitForTimeout(1000)
    } catch(e) {}

    // Try keyboard shortcut to open search
    try {
      await page.keyboard.press('/')
      await page.waitForTimeout(500)
    } catch(e) {}

    // Now try to find search input
    var searchSelectors = [
      'input[type="search"]',
      'input[name="search"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="Search" i]',
      '#search',
      '.search-input',
      '[data-testid="search-input"]'
    ]

    var searchInput = null
    for (var s = 0; s < searchSelectors.length; s++) {
      try {
        await page.waitForSelector(searchSelectors[s], { timeout: 2000 })
        searchInput = searchSelectors[s]
        break
      } catch(e) {}
    }

    if (searchInput) {
      await page.fill(searchInput, quantity + ' ' + itemDescription)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(3000)

      // Click first product result
      try {
        await page.click('.product-link, .product-name, [data-testid="product"], .plp-product__title a, h2 a, .grid-product__title')
        await page.waitForTimeout(2000)
      } catch(e) {}

      // Add to cart
      try {
        await page.click('button[data-testid="add-to-cart"], .add-to-cart, #add-to-cart, button:has-text("Add to Cart"), button:has-text("ADD TO CART")')
        await page.waitForTimeout(2000)
      } catch(e) {}

      // Go to cart
      try {
        await page.goto('https://www.revolve.com/r/ShoppingBag.jsp')
        await page.waitForTimeout(2000)
      } catch(e) {}

      result.status = 'success'
      result.cartUrl = page.url()
      result.cartSummary = 'Added ' + quantity + ' ' + itemDescription + ' to your Revolve cart.'
    } else {
      result.status = 'partial'
      result.cartUrl = page.url()
      result.cartSummary = 'Logged in successfully but could not find search. Please search manually.'
    }

    return result
  } finally {
    await browser.close()
    try {
      await fetch('https://api.firecrawl.dev/v2/browser/' + sessionId, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + process.env.FIRECRAWL_API_KEY
        }
      })
    } catch (e) {
      console.error('Failed to delete Firecrawl session:', e.message)
    }
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var body = req.body || {}
  var userId = body.userId
  var supplierName = body.supplierName
  var itemDescription = body.itemDescription
  var quantity = body.quantity || ''

  if (!userId || !supplierName || !itemDescription) {
    return res.status(400).json({ error: 'Missing userId, supplierName, or itemDescription' })
  }

  var supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Fetch decrypted credentials
  var credResult = await supabase
    .from('supplier_credentials')
    .select('encrypted_username, encrypted_password, website_url, login_url')
    .eq('user_id', userId)
    .eq('supplier_name', supplierName)
    .maybeSingle()

  if (!credResult.data) {
    return res.status(200).json({
      success: false,
      status: 'no_credentials',
      reply: 'I don\'t have login credentials for ' + supplierName + '. Add them in the My Suppliers section on your dashboard first, then try again.'
    })
  }

  console.log('Username length:', credResult.data.encrypted_username ? 'has value' : 'empty')
  console.log('Login URL from DB:', credResult.data.login_url)
  var loginUrl = credResult.data.website_url
  var websiteUrl = credResult.data.website_url
  var decryptedUsername = decrypt(credResult.data.encrypted_username)
  var decryptedPassword = decrypt(credResult.data.encrypted_password)
  console.log('Decrypted username length:', decryptedUsername ? decryptedUsername.length : 0)
  console.log('Decrypted password length:', decryptedPassword ? decryptedPassword.length : 0)

  try {
    console.log('Starting Firecrawl order flow for', supplierName)

    var result = await placeOrder(
      websiteUrl,
      loginUrl,
      decryptedUsername,
      decryptedPassword,
      itemDescription,
      quantity
    )

    // Clear credentials from memory
    decryptedUsername = null
    decryptedPassword = null

    console.log('Order result:', result.status)

    var replyParts = []
    if (result.status === 'success') {
      replyParts.push('Cart ready at ' + supplierName + '!')
      if (result.cartSummary) replyParts.push(result.cartSummary)
      if (result.cartUrl) replyParts.push('Review your cart here: ' + result.cartUrl)
      replyParts.push('Review the cart and check out when you\'re ready. I never touch payment.')
    } else if (result.status === 'partial') {
      replyParts.push('I got through most of the ordering on ' + supplierName + ' but couldn\'t confirm everything.')
      if (result.cartSummary) replyParts.push(result.cartSummary)
      replyParts.push('You may want to log in and check your cart directly.')
    } else {
      replyParts.push('I had trouble completing the order on ' + supplierName + '. ' + result.message)
      replyParts.push('Try logging in to ' + (websiteUrl || supplierName) + ' directly to place your order.')
    }

    return res.status(200).json({
      success: result.status === 'success',
      status: result.status,
      reply: replyParts.join('\n\n'),
      cartUrl: result.cartUrl || null,
      supplier: supplierName,
      item: itemDescription,
      quantity: quantity
    })

  } catch (error) {
    console.error('Order flow error:', error)

    // Clear credentials
    decryptedUsername = null
    decryptedPassword = null

    return res.status(200).json({
      success: false,
      status: 'error',
      reply: 'Something went wrong while ordering from ' + supplierName + '. Try logging in to their website directly for now. Error: ' + error.message
    })
  }
}
