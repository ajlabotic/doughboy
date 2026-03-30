export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://doughboy.vercel.app',
        'X-Title': 'Doughboy'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        messages: [
          {
            role: 'user',
            content: 'Say exactly this and nothing else: Doughboy is connected.'
          }
        ],
        max_tokens: 20
      })
    })

    const data = await response.json()
    const message = data.choices?.[0]?.message?.content

    return res.status(200).json({ success: true, message })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}
