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
  var overhead = body.overhead

  if (!userId || !overhead) {
    return res.status(400).json({ error: 'Missing userId or overhead' })
  }

  try {
    var supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    console.log('Saving overhead for user:', userId)
    console.log('Overhead data:', JSON.stringify(overhead))

    var result = await supabase
      .from('overhead_costs')
      .upsert({
        user_id: userId,
        monthly_rent: overhead.rent || 0,
        monthly_utilities: overhead.utilities || 0,
        monthly_insurance: overhead.insurance || 0,
        monthly_supplies: overhead.supplies || 0,
        monthly_other: overhead.other || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false
      })

    if (result.error) {
      console.error('Overhead save error:', result.error)
      return res.status(500).json({ success: false, error: result.error })
    }

    var totalMonthly = (overhead.rent || 0) + (overhead.utilities || 0) +
      (overhead.insurance || 0) + (overhead.supplies || 0) + (overhead.other || 0)
    var weeklyOverhead = totalMonthly / 4.33

    console.log('Total monthly:', totalMonthly)
    console.log('Weekly overhead:', weeklyOverhead)

    return res.status(200).json({
      success: true,
      totalMonthly: totalMonthly,
      weeklyOverhead: weeklyOverhead
    })

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
