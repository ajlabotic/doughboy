const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, message } = req.body || {}

  if (!userId || !message) {
    return res.status(400).json({ error: 'Missing userId or message' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // Fetch user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('chat_questions_used, chat_questions_limit, first_name, restaurant_name')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
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

  // Placeholder response — real OpenRouter integration in Phase 4
  const reply = 'I am getting ready to analyze your data. Upload your POS CSV first and I will have real insights for you.'

  // Increment usage counter
  await supabase
    .from('profiles')
    .update({
      chat_questions_used: profile.chat_questions_used + 1
    })
    .eq('id', userId)

  return res.status(200).json({
    reply,
    limitReached: false,
    used: profile.chat_questions_used + 1,
    limit: profile.chat_questions_limit
  })
}
