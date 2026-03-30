const { createClient } = require('@supabase/supabase-js')

// CSV parser that handles quoted fields with commas
function parseCSV(text) {
  var lines = text.split(/\r?\n/).filter(function(line) { return line.trim() !== '' })
  if (lines.length < 2) return []

  function splitRow(row) {
    var fields = []
    var current = ''
    var inQuotes = false
    for (var i = 0; i < row.length; i++) {
      var ch = row[i]
      if (ch === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  var headers = splitRow(lines[0]).map(function(h) { return h.toLowerCase().replace(/['"]/g, '').replace(/_/g, ' ').trim() })
  var rows = []
  for (var i = 1; i < lines.length; i++) {
    var values = splitRow(lines[i])
    if (values.length !== headers.length) continue
    var obj = {}
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[j]
    }
    rows.push(obj)
  }
  return rows
}

// Find a column value by trying multiple name variations
function findColumn(row, variations) {
  for (var i = 0; i < variations.length; i++) {
    var key = variations[i]
    if (row[key] !== undefined && row[key] !== '') return row[key]
  }
  return null
}

// Parse a number from a string, stripping $ and commas
function parseNum(val) {
  if (val === null || val === undefined) return NaN
  var cleaned = String(val).replace(/[$,]/g, '').trim()
  return parseFloat(cleaned)
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
  var csvText = body.csvText

  if (!userId || !csvText) {
    return res.status(400).json({ error: 'Missing userId or csvText' })
  }

  try {
    var supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // STEP 1 — Parse CSV
    var parsedRows = parseCSV(csvText)
    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'Could not parse any data from the CSV. Check the file format.' })
    }

    // STEP 2 — Sanitize column names
    parsedRows = parsedRows.map(function(row) {
      var cleanRow = {}
      Object.keys(row).forEach(function(key) {
        var cleanKey = key.trim().toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/\s+/g, '_')
        cleanRow[cleanKey] = typeof row[key] === 'string'
          ? row[key].trim()
          : row[key]
      })
      return cleanRow
    })

    // Debug: log sanitized sample
    console.log('Sample row:', parsedRows[0])
    console.log('Column names:', Object.keys(parsedRows[0]))
    console.log('First row qty:', parsedRows[0].quantity)
    console.log('First row price:', parsedRows[0].sale_price)
    console.log('First row revenue:', parseFloat(parsedRows[0].quantity) * parseFloat(parsedRows[0].sale_price))

    // STEP 3 — Calculate revenue (deduplicated by date + item)
    var revenueMap = {}
    var laborMap = {}
    var uniqueItemsSet = {}
    var dates = []

    parsedRows.forEach(function(row, index) {
      var qty = parseFloat(row.quantity || row.qty || 1) || 1
      var price = parseFloat(row.sale_price || row.price || 0) || 0
      var hours = parseFloat(row.hours_worked || 0) || 0
      var rate = parseFloat(row.hourly_rate || 0) || 0

      if (index < 3) {
        console.log('Row ' + index + ': qty=' + qty + ' price=' + price + ' revenue=' + (qty * price) + ' hours=' + hours + ' rate=' + rate + ' labor=' + (hours * rate))
      }

      // Revenue: deduplicate by date + item_name
      var revenueKey = (row.date || '') + '_' + (row.item_name || row.item || '')
      if (!revenueMap[revenueKey]) {
        revenueMap[revenueKey] = qty * price
      }

      // Labor: deduplicate by date + staff + shift
      var laborKey = (row.date || '') + '_' + (row.staff || '') + '_' + (row.shift || '')
      if (!laborMap[laborKey]) {
        laborMap[laborKey] = hours * rate
      }

      // Items
      var itemVal = row.item_name || row.item || row.product || row.menu_item || row.description || row.name || null
      if (itemVal) uniqueItemsSet[itemVal] = true

      // Dates
      var dateVal = row.date || row.order_date || row.sale_date || row.transaction_date || row.day || null
      if (dateVal) {
        var d = new Date(dateVal)
        if (!isNaN(d.getTime())) dates.push(d)
      }
    })

    var totalRevenue = Object.values(revenueMap).reduce(function(sum, val) { return sum + val }, 0)
    var totalLaborCost = Object.values(laborMap).reduce(function(sum, val) { return sum + val }, 0)

    console.log('Revenue entries (deduplicated):', Object.keys(revenueMap).length)
    console.log('Labor entries (deduplicated):', Object.keys(laborMap).length)
    console.log('Total revenue:', totalRevenue)
    console.log('Total labor cost:', totalLaborCost)

    var uniqueItems = Object.keys(uniqueItemsSet)

    // Build item quantities map (deduplicated same as revenue)
    var itemQuantities = {}
    parsedRows.forEach(function(row) {
      var name = row.item_name || row.item || row.product || row.menu_item || null
      var qty = parseFloat(row.quantity || row.qty || 1) || 1
      var dateItemKey = (row.date || '') + '_' + (name || '')
      // Only count each date+item combo once (matches revenue dedup)
      if (name && !itemQuantities['__seen_' + dateItemKey]) {
        if (!itemQuantities[name]) itemQuantities[name] = 0
        itemQuantities[name] += qty
        itemQuantities['__seen_' + dateItemKey] = true
      }
    })
    // Remove tracking keys
    Object.keys(itemQuantities).forEach(function(k) {
      if (k.indexOf('__seen_') === 0) delete itemQuantities[k]
    })

    console.log('Item quantities:', itemQuantities)

    // Calculate labor cost % and net margin
    var laborCostPercent = totalRevenue > 0
      ? ((totalLaborCost / totalRevenue) * 100).toFixed(1) + '%'
      : 'Add shift data'

    var netMargin = totalRevenue > 0 && totalLaborCost > 0
      ? (((totalRevenue - totalLaborCost) / totalRevenue) * 100).toFixed(1) + '%'
      : 'Upload more data'

    var dateRange = 'Unknown'
    if (dates.length > 0) {
      dates.sort(function(a, b) { return a - b })
      var earliest = dates[0].toISOString().split('T')[0]
      var latest = dates[dates.length - 1].toISOString().split('T')[0]
      dateRange = earliest + ' to ' + latest
    }

    // Get restaurant name from profile
    var profileResult = await supabase
      .from('profiles')
      .select('restaurant_name')
      .eq('id', userId)
      .single()

    var restaurantName = (profileResult.data && profileResult.data.restaurant_name) || 'your restaurant'

    // STEP 3 — Call OpenRouter with Claude Haiku
    var csvSample = csvText.split(/\r?\n/).slice(0, 11).join('\n')

    var aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://doughboy.vercel.app',
        'X-Title': 'Doughboy'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        messages: [
          {
            role: 'system',
            content: 'You are Doughboy, an AI profit agent for independent restaurants. Analyze this restaurant sales data and provide specific actionable insights. Always give exact dollar amounts. Be warm and direct like a knowledgeable friend.'
          },
          {
            role: 'user',
            content: 'Here is the sales data summary for ' + restaurantName + ':\n' +
              '- Total rows of data: ' + parsedRows.length + '\n' +
              '- Date range: ' + dateRange + '\n' +
              '- Total revenue found: $' + totalRevenue.toLocaleString() + '\n' +
              '- Unique menu items: ' + uniqueItems.slice(0, 30).join(', ') + '\n\n' +
              'Raw CSV sample (first 10 rows):\n' + csvSample + '\n\n' +
              'Please provide:\n' +
              '1. A one paragraph daily insight (warm, specific, dollar amounts)\n' +
              '2. Estimated food cost % if detectable, otherwise say what data is needed\n' +
              '3. Top 3 observations about this data\n' +
              '4. One immediate action they should take today\n\n' +
              'Format your response as JSON with these exact keys: dailyInsight, foodCostPercent, topObservations, immediateAction'
          }
        ],
        max_tokens: 800
      })
    })

    var aiData = await aiResponse.json()
    var aiContent = (aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content) || '{}'

    // STEP 4 — Parse AI response, extract JSON robustly
    var parsed = {}
    try {
      var jsonMatch = aiContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found')
      }
    } catch (e) {
      console.log('AI JSON parse failed, raw content:', aiContent)
      parsed = {
        dailyInsight: aiContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(),
        foodCostPercent: null,
        topObservations: ['Data uploaded successfully', 'Add ingredient costs for deeper analysis', 'Ask me specific questions about your menu'],
        immediateAction: 'Review your top selling items and check their margins'
      }
    }

    // STEP 5 — Store in Supabase
    await supabase
      .from('csv_data')
      .insert({
        user_id: userId,
        raw_data: {
          totalRows: parsedRows.length,
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalLaborCost: parseFloat(totalLaborCost.toFixed(2)),
          laborCostPercent: laborCostPercent,
          netMargin: netMargin,
          uniqueItems: uniqueItems,
          itemQuantities: itemQuantities,
          dateRange: dateRange
        },
        parsed_summary: parsed
      })

    // Return to frontend
    return res.status(200).json({
      success: true,
      metrics: {
        revenue: totalRevenue.toFixed(2),
        foodCostPercent: 'Data needed',
        laborCostPercent: laborCostPercent,
        netMargin: netMargin
      },
      dateRange: dateRange,
      uniqueItems: uniqueItems,
      dailyInsight: parsed.dailyInsight || '',
      topObservations: parsed.topObservations || [],
      immediateAction: parsed.immediateAction || ''
    })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
