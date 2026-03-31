const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')

function detectOrderIntent(message) {
  var lower = message.toLowerCase()

  var orderPatterns = [
    /(?:order|buy|purchase|get|add)\s+(\d+\s*(?:lbs?|pounds?|cases?|bags?|boxes?|units?|gallons?|oz|each|ct)?\s+)?(.+?)\s+(?:from|on|at|through)\s+(.+)/i,
    /(?:i need to order|i need to reorder|reorder|can you order)\s+(.+?)\s+(?:from|on|at|through)\s+(.+)/i,
    /add\s+(.+?)\s+to\s+(?:my\s+)?(.+?)\s+cart/i
  ]

  for (var i = 0; i < orderPatterns.length; i++) {
    var match = lower.match(orderPatterns[i])
    if (match) {
      if (i === 0) {
        return {
          isOrder: true,
          quantity: (match[1] || '').trim(),
          item: (match[2] || '').trim(),
          supplier: (match[3] || '').trim().replace(/[.!?]+$/, '')
        }
      } else if (i === 1) {
        return {
          isOrder: true,
          quantity: '',
          item: (match[1] || '').trim(),
          supplier: (match[2] || '').trim().replace(/[.!?]+$/, '')
        }
      } else {
        return {
          isOrder: true,
          quantity: '',
          item: (match[1] || '').trim(),
          supplier: (match[2] || '').trim().replace(/[.!?]+$/, '')
        }
      }
    }
  }

  var hasOrderWord = /\b(order|reorder|buy|purchase)\b/.test(lower)
  var hasFromWord = /\b(from|on|at|through)\b/.test(lower)

  if (hasOrderWord && hasFromWord) {
    var fromMatch = lower.match(/(?:from|on|at|through)\s+([a-z0-9\s]+?)(?:\s*$|[.!?])/)
    var supplierName = fromMatch ? fromMatch[1].trim() : null
    var itemMatch = lower.match(/(?:order|reorder|buy|purchase)\s+(.+?)(?:\s+from|\s+on|\s+at|\s+through)/i)
    var item = itemMatch ? itemMatch[1].trim() : ''

    if (supplierName) {
      return {
        isOrder: true,
        quantity: '',
        item: item,
        supplier: supplierName
      }
    }
  }

  return { isOrder: false }
}

// Find the best matching supplier name from saved credentials
async function findMatchingSupplier(supabase, userId, supplierHint) {
  var result = await supabase
    .from('supplier_credentials')
    .select('supplier_name')
    .eq('user_id', userId)

  if (!result.data || result.data.length === 0) return null

  var hint = supplierHint.toLowerCase()

  // Exact match first
  for (var i = 0; i < result.data.length; i++) {
    if (result.data[i].supplier_name.toLowerCase() === hint) {
      return result.data[i].supplier_name
    }
  }

  // Partial match
  for (var j = 0; j < result.data.length; j++) {
    var name = result.data[j].supplier_name.toLowerCase()
    if (name.indexOf(hint) !== -1 || hint.indexOf(name) !== -1) {
      return result.data[j].supplier_name
    }
  }

  return null
}

function buildSystemPrompt(profile, csvData, ingredientCosts, overheadCosts, calculatedMetrics) {
  var prompt = 'You are Doughboy, an AI profit agent for independent restaurants. You have access to this restaurant\'s sales data, labor data, and food cost data. Always give specific dollar amounts. Never give generic advice. Speak like a knowledgeable friend, not a corporate consultant. If you see a margin problem, flag it immediately with the exact dollar impact. The restaurant owner is an expert at their craft. Your job is to handle the numbers so they can focus on the food and the guests.\n\n'

  prompt += 'PERSONALITY RULES:\n'
  prompt += '- Warm but direct, not a generic chatbot\n'
  prompt += '- Always lead with specific dollar amounts when possible\n'
  prompt += '- Keep answers concise, 2 to 4 sentences for simple questions, up to a short paragraph for complex analysis\n'
  prompt += '- Use the owner\'s first name occasionally\n'
  prompt += '- When you spot a problem, frame it as money they can recover, not a mistake they made\n'
  prompt += '- If you cannot answer from the data provided, say so honestly and suggest what data would help\n'
  prompt += '- Never make up numbers. If data is missing say "I would need your [specific data] to give you a real number on that."\n'
  prompt += '- Do not use markdown formatting, bullet points, or headers. Write in plain conversational sentences like a text message\n'
  prompt += '- When suggesting a price change, always include the estimated monthly impact\n'
  prompt += '- Never use em dashes\n\n'

  prompt += 'RESTAURANT CONTEXT:\n'
  prompt += '- Owner: ' + (profile.first_name || 'Owner') + '\n'
  prompt += '- Restaurant: ' + (profile.restaurant_name || 'Not specified') + '\n'
  prompt += '- Plan: ' + (profile.plan_type || 'starter') + '\n\n'

  if (csvData && csvData.raw_data) {
    prompt += 'RESTAURANT DATA:\n'
    var rawStr = JSON.stringify(csvData.raw_data)
    if (rawStr.length > 3000) {
      prompt += 'Summary: ' + JSON.stringify(csvData.parsed_summary) + '\n\n'
    } else {
      prompt += 'Raw data: ' + rawStr + '\n'
      prompt += 'Analysis: ' + JSON.stringify(csvData.parsed_summary) + '\n\n'
    }
  } else {
    prompt += 'RESTAURANT DATA:\nNo POS data uploaded yet. Answer general restaurant profitability questions and encourage the owner to upload their POS CSV for specific insights.\n\n'
  }

  var totalIngredientCost = 0
  if (ingredientCosts && ingredientCosts.length > 0) {
    prompt += 'INGREDIENT COSTS (per portion):\n'
    ingredientCosts.forEach(function(c) {
      prompt += '- ' + c.item_name + ': $' + c.cost_per_portion + '\n'
      totalIngredientCost += parseFloat(c.cost_per_portion) || 0
    })
    prompt += 'Total ingredient cost across all items: $' + totalIngredientCost.toFixed(2) + '\n'
    prompt += 'Average cost per item: $' + (totalIngredientCost / ingredientCosts.length).toFixed(2) + '\n\n'
  } else {
    prompt += 'INGREDIENT COSTS:\nNo ingredient costs entered yet. Suggest the owner use the Edit ingredient costs button on their dashboard.\n\n'
  }

  if (overheadCosts) {
    var ohItems = []
    if (overheadCosts.monthly_rent > 0) ohItems.push('Rent: $' + overheadCosts.monthly_rent + '/mo')
    if (overheadCosts.monthly_utilities > 0) ohItems.push('Utilities: $' + overheadCosts.monthly_utilities + '/mo')
    if (overheadCosts.monthly_insurance > 0) ohItems.push('Insurance: $' + overheadCosts.monthly_insurance + '/mo')
    if (overheadCosts.monthly_supplies > 0) ohItems.push('Supplies: $' + overheadCosts.monthly_supplies + '/mo')
    if (overheadCosts.monthly_other > 0) ohItems.push('Other: $' + overheadCosts.monthly_other + '/mo')
    if (ohItems.length > 0) {
      prompt += 'MONTHLY OVERHEAD:\n' + ohItems.join('\n') + '\n\n'
    } else {
      prompt += 'MONTHLY OVERHEAD:\nNo overhead costs entered yet.\n\n'
    }
  } else {
    prompt += 'MONTHLY OVERHEAD:\nNo overhead costs entered yet.\n\n'
  }

  prompt += 'INDUSTRY BENCHMARKS:\n'
  prompt += '- Target food cost: 28 to 32% of revenue\n'
  prompt += '- Target labor cost: 25 to 30% of revenue\n'
  prompt += '- Target prime cost (food + labor): 55 to 60% of revenue\n'
  prompt += '- Target net profit margin: 5 to 10%, above 10% is excellent\n'
  prompt += '- Average independent restaurant loses $2,000 to $4,000/mo in hidden margin waste\n'
  prompt += '- Flag any menu item with food cost above 32%\n'
  prompt += '- Flag any shift where labor cost exceeds 35% of that shift revenue\n\n'

  if (calculatedMetrics) {
    prompt += 'CALCULATED METRICS (use these exact numbers, do not recalculate them yourself):\n'
    prompt += '- Total revenue: $' + parseFloat(calculatedMetrics.totalRevenue).toFixed(2) + '\n'
    prompt += '- Total food cost: $' + parseFloat(calculatedMetrics.totalFoodCost).toFixed(2) + ' (' + calculatedMetrics.foodCostPct + '% of revenue)\n'
    prompt += '- Total labor cost: $' + parseFloat(calculatedMetrics.totalLaborCost).toFixed(2) + ' (' + calculatedMetrics.laborCostPct + '% of revenue)\n'
    prompt += '- Operating margin: ' + calculatedMetrics.operatingMarginPct + '% (after food and labor)\n'
    prompt += '- Monthly overhead: $' + parseFloat(calculatedMetrics.totalMonthlyOverhead).toFixed(2) + '\n'
    prompt += '- True net margin: ' + calculatedMetrics.trueNetPct + '% (after food, labor, and overhead)\n\n'
    prompt += 'CRITICAL RULE: When the owner asks about margins, food cost, labor cost, or how they are doing, use ONLY the numbers listed above. Do not do your own arithmetic. These are the same numbers displayed on their dashboard. If you calculate a different number than what is listed here, you are wrong and the number above is correct.\n'
  }

  return prompt
}

function classifyQuestion(message) {
  var lower = message.toLowerCase()
  var complexPatterns = [
    'what if', 'what would happen', 'should i', 'compare', 'analyze',
    'why is', 'why are', 'how can i improve', 'how do i fix', 'strategy',
    'recommend', 'suggestion', 'forecast', 'predict', 'break down',
    'breakdown', 'explain why', 'optimize', 'reduce', 'increase margin',
    'menu pricing', 'reprice', 'staffing', 'trend', 'over time',
    'benchmark', 'losing money', 'save money', 'cut costs', 'which dish',
    'which item', 'best seller', 'worst performer', 'overstaffed', 'understaffed'
  ]

  for (var i = 0; i < complexPatterns.length; i++) {
    if (lower.indexOf(complexPatterns[i]) !== -1) {
      return 'anthropic/claude-sonnet-4-6'
    }
  }

  if (message.length > 80) {
    return 'anthropic/claude-sonnet-4-6'
  }

  return 'anthropic/claude-haiku-4-5'
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
  var message = body.message
  var history = body.history || []

  if (!userId || !message) {
    return res.status(400).json({ error: 'Missing userId or message' })
  }

  var supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Fetch user profile
  var profileResult = await supabase
    .from('profiles')
    .select('chat_questions_used, chat_questions_limit, first_name, restaurant_name, plan_type')
    .eq('id', userId)
    .single()

  var profile = profileResult.data

  if (profileResult.error || !profile) {
    return res.status(404).json({ error: 'Profile not found' })
  }

  // Check usage limit
  if (profile.chat_questions_used >= profile.chat_questions_limit) {
    return res.status(200).json({
      reply: 'You have reached your question limit for this month. Upgrade your plan to keep the conversation going.',
      limitReached: true,
      used: profile.chat_questions_used,
      limit: profile.chat_questions_limit
    })
  }

  // Check for ordering intent before routing to OpenRouter
  var orderIntent = detectOrderIntent(message)

  if (orderIntent.isOrder && orderIntent.supplier) {
    var matchedSupplier = await findMatchingSupplier(supabase, userId, orderIntent.supplier)

    if (matchedSupplier) {
      // Route to ordering agent
      console.log('Order intent detected:', orderIntent.item, 'from', matchedSupplier)

      try {
        var orderResponse = await fetch((process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000') + '/api/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userId,
            supplierName: matchedSupplier,
            itemDescription: orderIntent.item,
            quantity: orderIntent.quantity
          })
        })

        var orderData = await orderResponse.json()

        // Increment usage counter for order requests too
        await supabase
          .from('profiles')
          .update({ chat_questions_used: profile.chat_questions_used + 1 })
          .eq('id', userId)

        return res.status(200).json({
          reply: orderData.reply || 'I started working on your order but something went wrong.',
          limitReached: false,
          used: profile.chat_questions_used + 1,
          limit: profile.chat_questions_limit,
          orderStatus: orderData.status || 'unknown',
          isOrder: true,
          supplier: matchedSupplier,
          item: orderIntent.item
        })
      } catch (orderErr) {
        console.error('Order routing error:', orderErr)
        // Fall through to normal chat if order fails
      }
    } else if (orderIntent.supplier) {
      // Supplier mentioned but no credentials saved
      await supabase
        .from('profiles')
        .update({ chat_questions_used: profile.chat_questions_used + 1 })
        .eq('id', userId)

      return res.status(200).json({
        reply: 'I\'d love to help you order from ' + orderIntent.supplier + ', but I don\'t have login credentials saved for them yet. Head to the My Suppliers section on your dashboard and add ' + orderIntent.supplier + ' first, then try again.',
        limitReached: false,
        used: profile.chat_questions_used + 1,
        limit: profile.chat_questions_limit
      })
    }
  } else if (orderIntent.isOrder && !orderIntent.supplier) {
    // Order intent but no supplier specified, let OpenRouter ask which supplier
  }

  // Gather all user context
  var csvResult = await supabase
    .from('csv_data')
    .select('raw_data, parsed_summary, upload_date')
    .eq('user_id', userId)
    .order('upload_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  var ingredientResult = await supabase
    .from('ingredient_costs')
    .select('item_name, cost_per_portion')
    .eq('user_id', userId)

  var overheadResult = await supabase
    .from('overhead_costs')
    .select('monthly_rent, monthly_utilities, monthly_insurance, monthly_supplies, monthly_other')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  var csvData = csvResult.data || null
  var ingredientCosts = ingredientResult.data || []
  var overheadCosts = overheadResult.data || null

  console.log('CSV data found:', csvData ? 'yes' : 'no')
  console.log('Ingredient costs found:', ingredientCosts ? ingredientCosts.length + ' items' : 'none')
  console.log('Overhead costs found:', overheadCosts ? 'yes' : 'no')
  if (overheadCosts) console.log('Overhead data:', JSON.stringify(overheadCosts))
  if (ingredientCosts && ingredientCosts.length > 0) console.log('Ingredient data:', JSON.stringify(ingredientCosts))

  // Pre-calculate metrics so AI uses exact dashboard numbers
  var calculatedMetrics = null

  if (csvData && csvData.raw_data && ingredientCosts && ingredientCosts.length > 0) {
    var costMap = {}
    ingredientCosts.forEach(function(item) {
      costMap[item.item_name] = parseFloat(item.cost_per_portion) || 0
    })

    var totalRevenue = 0
    var totalFoodCost = 0
    var totalLaborCost = 0
    var rawData = csvData.raw_data

    if (rawData.rows && Array.isArray(rawData.rows)) {
      rawData.rows.forEach(function(row) {
        var qty = parseFloat(row.quantity) || 0
        var price = parseFloat(row.sale_price) || 0
        var hours = parseFloat(row.hours_worked) || 0
        var rate = parseFloat(row.hourly_rate) || 0
        var itemName = row.item_name || ''
        totalRevenue += qty * price
        totalLaborCost += hours * rate
        if (costMap[itemName]) {
          totalFoodCost += costMap[itemName] * qty
        }
      })
    } else if (rawData.itemQuantities) {
      totalRevenue = parseFloat(rawData.totalRevenue) || 0
      totalLaborCost = parseFloat(rawData.totalLaborCost) || 0
      Object.keys(rawData.itemQuantities).forEach(function(itemName) {
        var qty = rawData.itemQuantities[itemName] || 0
        if (costMap[itemName]) {
          totalFoodCost += costMap[itemName] * qty
        }
      })
    }

    var totalMonthlyOverhead = 0
    if (overheadCosts) {
      totalMonthlyOverhead =
        (parseFloat(overheadCosts.monthly_rent) || 0) +
        (parseFloat(overheadCosts.monthly_utilities) || 0) +
        (parseFloat(overheadCosts.monthly_insurance) || 0) +
        (parseFloat(overheadCosts.monthly_supplies) || 0) +
        (parseFloat(overheadCosts.monthly_other) || 0)
    }

    if (totalRevenue > 0) {
      var foodCostPct = ((totalFoodCost / totalRevenue) * 100).toFixed(1)
      var laborCostPct = ((totalLaborCost / totalRevenue) * 100).toFixed(1)
      var operatingMarginPct = (100 - parseFloat(foodCostPct) - parseFloat(laborCostPct)).toFixed(1)
      var weeklyOverhead = totalMonthlyOverhead / 4.33
      var trueNetPct = (((totalRevenue - totalFoodCost - totalLaborCost - weeklyOverhead) / totalRevenue) * 100).toFixed(1)

      calculatedMetrics = {
        totalRevenue: totalRevenue,
        totalFoodCost: totalFoodCost,
        totalLaborCost: totalLaborCost,
        foodCostPct: foodCostPct,
        laborCostPct: laborCostPct,
        operatingMarginPct: operatingMarginPct,
        totalMonthlyOverhead: totalMonthlyOverhead,
        trueNetPct: trueNetPct
      }

      console.log('Calculated metrics:', JSON.stringify(calculatedMetrics))
    }
  }

  // Build system prompt
  var systemPrompt = buildSystemPrompt(profile, csvData, ingredientCosts, overheadCosts, calculatedMetrics)

  // Classify question to pick the right model
  var model = classifyQuestion(message)

  // Build messages array: system, history, new message
  var messages = [{ role: 'system', content: systemPrompt }]

  if (history && history.length > 0) {
    history.forEach(function(msg) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: msg.content })
      }
    })
  }

  messages.push({ role: 'user', content: message })

  // Call OpenRouter
  var reply

  try {
    var aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://doughboy.ai',
        'X-Title': 'Doughboy'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    })

    var aiData = await aiResponse.json()

    if (aiData.error) {
      console.error('OpenRouter error:', aiData.error)
      reply = 'I\'m having trouble connecting right now. Try again in a moment.'
    } else {
      reply = (aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content) || null
      if (!reply) {
        reply = 'I couldn\'t generate a response. Try rephrasing your question.'
      }
    }
  } catch (err) {
    console.error('OpenRouter fetch error:', err)
    reply = 'Something went wrong on my end. Try again in a moment.'
  }

  // Increment usage counter
  await supabase
    .from('profiles')
    .update({
      chat_questions_used: profile.chat_questions_used + 1
    })
    .eq('id', userId)

  return res.status(200).json({
    reply: reply,
    limitReached: false,
    used: profile.chat_questions_used + 1,
    limit: profile.chat_questions_limit
  })
}
