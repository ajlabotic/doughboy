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

    // Fetch latest csv_data for item quantities and revenue
    var csvResult = await supabase
      .from('csv_data')
      .select('raw_data')
      .eq('user_id', userId)
      .order('upload_date', { ascending: false })
      .limit(1)
      .single()

    if (csvResult.data && csvResult.data.raw_data) {
      var rawData = csvResult.data.raw_data
      var itemQuantities = rawData.itemQuantities || {}
      var totalRevenue = parseFloat(rawData.totalRevenue) || 0
      var laborPercent = parseFloat(rawData.laborCostPercent) || 0

      console.log('CSV raw data:', rawData)
      console.log('Item quantities:', itemQuantities)

      // Calculate total food cost: cost_per_portion * quantity sold
      var totalFoodCost = 0
      costs.forEach(function(c) {
        var qtySold = itemQuantities[c.item_name] || 0
        var itemFoodCost = c.cost_per_portion * qtySold
        console.log(c.item_name + ': ' + qtySold + ' sold x $' + c.cost_per_portion + ' = $' + itemFoodCost)
        totalFoodCost += itemFoodCost
      })

      console.log('Total food cost:', totalFoodCost)
      console.log('Total revenue:', totalRevenue)

      var foodCostPercent = ((totalFoodCost / totalRevenue) * 100).toFixed(1)

      console.log('Food cost %:', foodCostPercent)

      var netMargin = (100 - parseFloat(foodCostPercent) - laborPercent).toFixed(1)

      return res.status(200).json({
        success: true,
        foodCostPercent: foodCostPercent + '%',
        netMargin: netMargin + '%'
      })
    }

    // Fallback if no CSV data
    return res.status(200).json({
      success: true,
      foodCostPercent: 'Upload CSV first',
      netMargin: 'Upload more data'
    })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
