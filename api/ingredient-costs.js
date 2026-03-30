const { createClient } = require('@supabase/supabase-js')

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
  var costs = body.costs

  if (!userId || !costs || !Array.isArray(costs)) {
    return res.status(400).json({ error: 'Missing userId or costs array' })
  }

  try {
    var supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Upsert each ingredient cost
    for (var i = 0; i < costs.length; i++) {
      var item = costs[i]
      await supabase
        .from('ingredient_costs')
        .upsert({
          user_id: userId,
          item_name: item.item_name,
          cost_per_portion: item.cost_per_portion,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,item_name' })
    }

    // Fetch latest csv_data to calculate food cost %
    var csvResult = await supabase
      .from('csv_data')
      .select('raw_data')
      .eq('user_id', userId)
      .order('upload_date', { ascending: false })
      .limit(1)
      .single()

    var totalRevenue = 0
    var totalFoodCost = 0
    var laborCostPercent = 0

    if (csvResult.data && csvResult.data.raw_data) {
      var rawData = csvResult.data.raw_data
      totalRevenue = parseFloat(rawData.totalRevenue) || 0

      // Parse labor cost % from stored value
      if (rawData.laborCostPercent && typeof rawData.laborCostPercent === 'string') {
        laborCostPercent = parseFloat(rawData.laborCostPercent) || 0
      }

      // Build a cost lookup from the submitted costs
      var costLookup = {}
      costs.forEach(function(c) {
        costLookup[c.item_name] = c.cost_per_portion
      })

      // We don't have per-item quantity in raw_data summary,
      // so estimate food cost using average cost vs average price
      // totalFoodCost = sum of (cost_per_portion) for all items with costs
      // as a proportion of total items
      if (totalRevenue > 0) {
        var itemsWithCosts = costs.length
        var totalItems = (rawData.uniqueItems && rawData.uniqueItems.length) || itemsWithCosts
        var avgCost = costs.reduce(function(sum, c) { return sum + c.cost_per_portion }, 0) / itemsWithCosts
        var avgPrice = totalRevenue / (rawData.totalRows || 1)

        // Food cost % = average ingredient cost / average sale price * 100
        // weighted by coverage of items with costs entered
        var coverage = itemsWithCosts / totalItems
        var foodCostPercent = ((avgCost / avgPrice) * 100 * coverage).toFixed(1)

        // Cap at reasonable range
        if (parseFloat(foodCostPercent) > 100) foodCostPercent = 'Estimated'
        if (parseFloat(foodCostPercent) < 0) foodCostPercent = 'Estimated'

        var netMargin = (100 - laborCostPercent - parseFloat(foodCostPercent || 0)).toFixed(1)

        return res.status(200).json({
          success: true,
          foodCostPercent: foodCostPercent + '%',
          netMargin: netMargin + '%'
        })
      }
    }

    // Fallback: rough estimate from average costs
    var avgCost = costs.reduce(function(sum, c) { return sum + c.cost_per_portion }, 0) / costs.length

    return res.status(200).json({
      success: true,
      foodCostPercent: '~$' + avgCost.toFixed(2) + ' avg',
      netMargin: 'Upload more data'
    })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
