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
    try {
      var searchInput = await page.$('input[type="search"], input[name="search"], input[name="q"], input[placeholder*="earch"], input[aria-label*="earch"]')
      if (searchInput) {
        await searchInput.fill(quantity ? quantity + ' ' + itemDescription : itemDescription)
        await page.waitForTimeout(300)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(3000)
        console.log('Search results URL:', page.url())
      } else {
        console.log('No search input found, trying site navigation')
        result.status = 'partial'
        result.message = 'Logged in but could not find search field. You may need to search manually.'
        result.cartUrl = page.url()
        return result
      }
    } catch (searchErr) {
      console.error('Search error:', searchErr.message)
      result.status = 'partial'
      result.message = 'Logged in but search failed: ' + searchErr.message
      return result
    }

    // Check for payment page after search
    currentUrl = page.url()
    if (currentUrl.includes('checkout') || currentUrl.includes('payment')) {
      result.status = 'partial'
      result.message = 'Stopped — detected payment page'
      return result
    }

    // Step 4: Click first product result
    console.log('Looking for product results')
    try {
      var productLink = await page.$('a[href*="product"], a[href*="item"], .product a, .product-card a, .item a, [data-product] a')
      if (productLink) {
        await productLink.click()
        await page.waitForTimeout(2000)
        console.log('Product page URL:', page.url())
      } else {
        console.log('No product link found, checking if results are inline')
      }
    } catch (productErr) {
      console.error('Product click error:', productErr.message)
    }

    // Check for payment page
    currentUrl = page.url()
    if (currentUrl.includes('checkout') || currentUrl.includes('payment')) {
      result.status = 'partial'
      result.message = 'Stopped — detected payment page'
      return result
    }

    // Step 5: Set quantity if specified
    if (quantity) {
      try {
        var qtyInput = await page.$('input[name="quantity"], input[name="qty"], input[type="number"], input[id="quantity"], input[id="qty"]')
        if (qtyInput) {
          await qtyInput.fill('')
          await qtyInput.fill(String(quantity))
          await page.waitForTimeout(300)
          console.log('Set quantity to:', quantity)
        }
      } catch (qtyErr) {
        console.error('Quantity error:', qtyErr.message)
      }
    }

    // Step 6: Add to cart
    console.log('Looking for Add to Cart button')
    try {
      var addToCartBtn = await page.$('button:has-text("Add to Cart"), button:has-text("Add to cart"), button:has-text("Add To Cart"), button:has-text("ADD TO CART"), button[name="add"], input[value*="Add to Cart"], a:has-text("Add to Cart"), button:has-text("Add"), [data-action="add-to-cart"]')
      if (addToCartBtn) {
        await addToCartBtn.click()
        await page.waitForTimeout(2000)
        console.log('Clicked Add to Cart')
      } else {
        console.log('No Add to Cart button found')
        result.status = 'partial'
        result.message = 'Found product but could not find Add to Cart button. You may need to add it manually.'
        result.cartUrl = page.url()
        var pageContent = await page.textContent('body')
        result.cartSummary = pageContent ? pageContent.substring(0, 500) : ''
        return result
      }
    } catch (cartErr) {
      console.error('Add to cart error:', cartErr.message)
    }

    // Step 7: Navigate to cart
    console.log('Navigating to cart')
    try {
      var cartLink = await page.$('a[href*="cart"], a[href*="basket"], a:has-text("Cart"), a:has-text("View Cart"), a:has-text("Go to Cart"), button:has-text("View Cart"), button:has-text("Go to Cart")')
      if (cartLink) {
        await cartLink.click()
        await page.waitForTimeout(2000)
      } else {
        // Try common cart URLs
        var baseUrl = new URL(websiteUrl)
        var cartUrls = [
          baseUrl.origin + '/cart',
          baseUrl.origin + '/basket',
          baseUrl.origin + '/shopping-cart'
        ]
        for (var i = 0; i < cartUrls.length; i++) {
          if (cartUrls[i].includes('checkout') || cartUrls[i].includes('payment')) continue
          try {
            await page.goto(cartUrls[i])
            await page.waitForTimeout(1500)
            var pageText = await page.textContent('body')
            if (pageText && (pageText.toLowerCase().includes('cart') || pageText.toLowerCase().includes('basket'))) {
              break
            }
          } catch (e) {
            continue
          }
        }
      }

      // Check for payment page
      currentUrl = page.url()
      if (currentUrl.includes('checkout') || currentUrl.includes('payment')) {
        result.status = 'partial'
        result.message = 'Stopped — detected payment page'
        return result
      }

      // Get cart info
      result.cartUrl = page.url()
      var title = await page.title()
      var bodyText = await page.textContent('body')
      result.cartSummary = (title || '') + '\n' + (bodyText ? bodyText.substring(0, 500) : '')
      result.status = 'success'
      result.message = 'Cart ready'
      console.log('Cart URL:', result.cartUrl)
    } catch (navErr) {
      console.error('Cart navigation error:', navErr.message)
      result.status = 'partial'
      result.message = 'Item may have been added to cart but could not navigate to cart page.'
      result.cartUrl = page.url()
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

  var websiteUrl = credResult.data.website_url
  console.log('Username length:', credResult.data.encrypted_username ? 'has value' : 'empty')
  console.log('Login URL from DB:', credResult.data.login_url)
  var loginUrl = credResult.data.login_url || websiteUrl
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
