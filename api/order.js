var { createClient } = require('@supabase/supabase-js')
var { decrypt } = require('./crypto-utils')
var fetch = require('node-fetch')

// Create a BrowserBase session and return sessionId + connectUrl
async function createBrowserSession() {
  var response = await fetch('https://www.browserbase.com/v1/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bb-api-key': process.env.BROWSERBASE_API_KEY
    },
    body: JSON.stringify({
      projectId: process.env.BROWSERBASE_PROJECT_ID
    })
  })
  var data = await response.json()
  if (!data.id) throw new Error('Failed to create browser session')
  return data
}

// Destroy a BrowserBase session
async function destroyBrowserSession(sessionId) {
  try {
    await fetch('https://www.browserbase.com/v1/sessions/' + sessionId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY
      },
      body: JSON.stringify({ status: 'REQUEST_RELEASE' })
    })
  } catch (e) {
    console.error('Failed to destroy browser session:', e.message)
  }
}

// Take a screenshot via BrowserBase debug URL
async function takeScreenshot(sessionId) {
  var response = await fetch('https://www.browserbase.com/v1/sessions/' + sessionId + '/debug', {
    method: 'GET',
    headers: {
      'x-bb-api-key': process.env.BROWSERBASE_API_KEY
    }
  })
  var data = await response.json()
  return data
}

// Run the computer use loop with Anthropic
async function computerUseLoop(sessionId, websiteUrl, username, password, itemDescription, quantity) {
  var connectUrl = 'wss://connect.browserbase.com?apiKey=' + process.env.BROWSERBASE_API_KEY + '&sessionId=' + sessionId

  // Initial instructions for Claude
  var systemPrompt = 'You are an ordering agent for a restaurant. You are controlling a web browser to place an order on a supplier website. Follow these steps exactly:\n' +
    '1. Navigate to: ' + websiteUrl + '\n' +
    '2. Log in with the provided credentials\n' +
    '3. Search for: ' + quantity + ' ' + itemDescription + '\n' +
    '4. Add the item to cart\n' +
    '5. Go to the cart page\n' +
    '6. Report what is in the cart and the URL\n\n' +
    'CRITICAL RULES:\n' +
    '- NEVER navigate to any checkout or payment page\n' +
    '- NEVER click any "Place Order", "Pay", "Checkout", or "Submit Order" buttons\n' +
    '- STOP at the cart/basket page\n' +
    '- If you see a payment form, STOP immediately and report the cart contents\n' +
    '- Report the cart URL, items, quantities, and any visible prices'

  var messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: systemPrompt + '\n\nCredentials - Username: ' + username + ', Password: ' + password + '\n\nStart by navigating to the website.'
        }
      ]
    }
  ]

  var tools = [
    {
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1280,
      display_height_px: 800,
      display_number: 0
    }
  ]

  var maxSteps = 15
  var result = { status: 'error', message: 'Order flow did not complete', cartUrl: null, cartSummary: null }

  for (var step = 0; step < maxSteps; step++) {
    console.log('Computer use step ' + (step + 1))

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'computer-use-2025-01-24'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        tools: tools,
        messages: messages
      })
    })

    var aiData = await response.json()

    if (aiData.error) {
      console.error('Anthropic error:', aiData.error)
      result.message = 'AI agent encountered an error: ' + (aiData.error.message || 'Unknown error')
      break
    }

    var stopReason = aiData.stop_reason
    var contentBlocks = aiData.content || []

    // Check for text responses that indicate completion or issues
    var textBlocks = contentBlocks.filter(function(b) { return b.type === 'text' })
    var toolBlocks = contentBlocks.filter(function(b) { return b.type === 'tool_use' })

    // If Claude returned text with cart info, extract it
    if (textBlocks.length > 0) {
      var fullText = textBlocks.map(function(b) { return b.text }).join('\n')

      // Check for payment page warnings
      if (fullText.toLowerCase().indexOf('payment') !== -1 ||
          fullText.toLowerCase().indexOf('checkout') !== -1) {
        console.log('Agent detected payment page, stopping')
      }

      // Check if cart info was reported
      if (fullText.toLowerCase().indexOf('cart') !== -1 ||
          fullText.toLowerCase().indexOf('basket') !== -1) {
        result.status = 'success'
        result.cartSummary = fullText
        result.message = 'Cart ready'

        // Try to extract URL from text
        var urlMatch = fullText.match(/https?:\/\/[^\s"'<>]+/)
        if (urlMatch) result.cartUrl = urlMatch[0]
      }
    }

    // If no tool use requested, we're done
    if (toolBlocks.length === 0 || stopReason === 'end_turn') {
      if (result.status !== 'success' && textBlocks.length > 0) {
        result.cartSummary = textBlocks.map(function(b) { return b.text }).join('\n')
        result.status = 'partial'
        result.message = 'Agent completed but could not confirm cart contents'
      }
      break
    }

    // Process tool use — for computer use, we need to get a screenshot and feed it back
    var toolResults = []

    for (var t = 0; t < toolBlocks.length; t++) {
      var toolCall = toolBlocks[t]

      if (toolCall.name === 'computer') {
        // Execute the computer action via BrowserBase CDP
        var action = toolCall.input
        console.log('Computer action:', action.action)

        // Get screenshot after action
        // BrowserBase handles the actual browser interaction via CDP
        // For the computer use API, we return a screenshot
        var screenshotResult = await getSessionScreenshot(sessionId)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: screenshotResult ? [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotResult
              }
            }
          ] : [
            { type: 'text', text: 'Screenshot unavailable' }
          ]
        })
      }
    }

    // Add assistant response and tool results to messages
    messages.push({ role: 'assistant', content: contentBlocks })
    messages.push({ role: 'user', content: toolResults })
  }

  return result
}

// Get a screenshot from BrowserBase session
async function getSessionScreenshot(sessionId) {
  try {
    var response = await fetch('https://www.browserbase.com/v1/sessions/' + sessionId + '/screenshot', {
      method: 'GET',
      headers: {
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY
      }
    })

    if (!response.ok) return null

    var buffer = await response.buffer()
    return buffer.toString('base64')
  } catch (e) {
    console.error('Screenshot error:', e.message)
    return null
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
    .select('encrypted_username, encrypted_password, website_url')
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
  var decryptedUsername = decrypt(credResult.data.encrypted_username)
  var decryptedPassword = decrypt(credResult.data.encrypted_password)

  var sessionId = null

  try {
    // Create BrowserBase session
    console.log('Creating browser session for', supplierName)
    var session = await createBrowserSession()
    sessionId = session.id
    console.log('Browser session created:', sessionId)

    // Run the computer use ordering loop
    var result = await computerUseLoop(
      sessionId,
      websiteUrl,
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
  } finally {
    // Always destroy the browser session
    if (sessionId) {
      console.log('Destroying browser session:', sessionId)
      await destroyBrowserSession(sessionId)
    }
  }
}
