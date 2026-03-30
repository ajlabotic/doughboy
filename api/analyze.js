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

  var headers = splitRow(lines[0]).map(function(h) { return h.toLowerCase().replace(/['"]/g, '').trim() })
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

    // STEP 2 — Build analysis context
    var itemVariations = ['item', 'item name', 'product', 'menu item', 'description', 'item description', 'name']
    var dateVariations = ['date', 'order date', 'sale date', 'transaction date', 'day']

    var totalRevenue = 0
    var totalLaborCost = 0
    var hasLaborData = false
    var uniqueItemsSet = {}
    var dates = []

    // Log column names for debugging
    var columnNames = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : []
    console.log('CSV column names found:', columnNames)
    console.log('First 3 rows:', JSON.stringify(parsedRows.slice(0, 3), null, 2))

    for (var i = 0; i < parsedRows.length; i++) {
      var row = parsedRows[i]
      var rowRevenue = 0

      // Approach A — multiply quantity * sale price
      var qty = parseNum(row['quantity'] || row['qty'] || row['count'] || row['units'] || row['items sold'] || row['qty sold'])
      var price = parseNum(row['sale price'] || row['price'] || row['unit price'] || row['menu price'] || row['item price'] || row['selling price'])

      if (isNaN(qty)) qty = 1
      if (!isNaN(price) && price > 0) {
        rowRevenue = qty * price
      }

      // Approach B — if Approach A gives 0, look for pre-calculated total columns
      if (rowRevenue === 0) {
        var totalVal = parseNum(row['total'] || row['amount'] || row['gross sales'] || row['revenue'] || row['net sales'] || row['sales'] || row['total sales'] || row['gross amount'] || row['net amount'])
        if (!isNaN(totalVal) && totalVal > 0) {
          rowRevenue = totalVal
        }
      }

      // Approach C — if still 0, find any numeric column that looks like dollars
      if (rowRevenue === 0) {
        for (var key in row) {
          var val = row[key]
          if (typeof val === 'string' && val.match(/^\$?\d+[\d,]*\.?\d*$/)) {
            var candidate = parseNum(val)
            if (!isNaN(candidate) && candidate > 0 && candidate < 100000) {
              rowRevenue = candidate
              break
            }
          }
        }
      }

      totalRevenue += rowRevenue

      if (i < 3) {
        console.log('Row ' + i + ' revenue:', rowRevenue, '| qty:', qty, '| price:', price)
      }

      // Labor = hours worked * hourly rate per row
      var hoursVal = parseNum(row['hours worked'] || row['hours'] || row['labor hours'] || row['shift hours'] || row['total hours'])
      var rateVal = parseNum(row['hourly rate'] || row['rate'] || row['pay rate'] || row['wage'] || row['hourly pay'] || row['hourly wage'])
      if (!isNaN(hoursVal) && !isNaN(rateVal) && hoursVal > 0 && rateVal > 0) {
        totalLaborCost += hoursVal * rateVal
        hasLaborData = true
      }

      var itemVal = findColumn(row, itemVariations)
      if (itemVal) uniqueItemsSet[itemVal] = true

      var dateVal = findColumn(row, dateVariations)
      if (dateVal) {
        var d = new Date(dateVal)
        if (!isNaN(d.getTime())) dates.push(d)
      }
    }

    var uniqueItems = Object.keys(uniqueItemsSet)
    totalRevenue = Math.round(totalRevenue * 100) / 100
    totalLaborCost = Math.round(totalLaborCost * 100) / 100

    console.log('Total revenue calculated:', totalRevenue)
    console.log('Total labor cost:', totalLaborCost)

    // Calculate labor cost % and net margin
    var laborCostPercent = null
    var netMargin = null
    if (hasLaborData && totalRevenue > 0) {
      laborCostPercent = Math.round((totalLaborCost / totalRevenue) * 100)
      netMargin = Math.round(((totalRevenue - totalLaborCost) / totalRevenue) * 100)
    }

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
          totalRevenue: totalRevenue,
          totalLaborCost: totalLaborCost,
          laborCostPercent: laborCostPercent,
          netMargin: netMargin,
          uniqueItems: uniqueItems,
          dateRange: dateRange
        },
        parsed_summary: parsed
      })

    // STEP 6 — Clean up food cost value (cap to short string)
    var foodCostClean = parsed.foodCostPercent || null
    if (typeof foodCostClean === 'string' && foodCostClean.length > 20) {
      foodCostClean = null
    }

    // Return to frontend
    return res.status(200).json({
      success: true,
      metrics: {
        revenue: totalRevenue,
        foodCostPercent: foodCostClean,
        laborCostPercent: laborCostPercent,
        netMargin: netMargin
      },
      dateRange: dateRange,
      dailyInsight: parsed.dailyInsight || '',
      topObservations: parsed.topObservations || [],
      immediateAction: parsed.immediateAction || ''
    })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
