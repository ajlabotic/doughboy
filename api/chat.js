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

  // Fetch latest CSV data for context
  const { data: csvData } = await supabase
    .from('csv_data')
    .select('raw_data, parsed_summary')
    .eq('user_id', userId)
    .order('upload_date', { ascending: false })
    .limit(1)
    .single()

  let reply

  if (csvData) {
    // Call OpenRouter with restaurant data context
    try {
      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
              content: 'You are Doughboy, an AI profit agent for independent restaurants. You have access to this restaurant\'s sales data. Always give specific dollar amounts. Never give generic advice. Speak like a knowledgeable friend, not a corporate consultant. The restaurant owner is an expert at their craft — your job is to handle the numbers.'
            },
            {
              role: 'user',
              content: 'Restaurant: ' + (profile.restaurant_name || 'Unknown') + '\n' +
                'Latest data summary: ' + JSON.stringify(csvData.raw_data) + '\n' +
                'AI analysis: ' + JSON.stringify(csvData.parsed_summary) + '\n\n' +
                'Owner\'s question: ' + message
            }
          ],
          max_tokens: 400
        })
      })

      const aiData = await aiResponse.json()
      reply = (aiData.choices && aiData.choices[0] && aiData.choices[0].message && aiData.choices[0].message.content)
        || 'I had trouble processing that. Could you try rephrasing your question?'
    } catch (err) {
      reply = 'I had trouble connecting right now. Please try again in a moment.'
    }
  } else {
    reply = 'Upload your POS CSV first and I will have real insights for you.'
  }

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
