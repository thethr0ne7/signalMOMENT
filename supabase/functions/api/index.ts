import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const encoder = new TextEncoder()

type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value))
}

async function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData)
  const receivedHash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  if (!receivedHash || !authDate) throw new Error('Malformed Telegram initData')
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 300) throw new Error('Expired Telegram initData')

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = await hmac(encoder.encode('WebAppData'), botToken)
  if (hex(await hmac(secretKey, dataCheckString)) !== receivedHash) throw new Error('Invalid Telegram signature')

  const rawUser = params.get('user')
  if (!rawUser) throw new Error('Telegram user missing')
  return JSON.parse(rawUser) as TelegramUser
}

function bearer(req: Request) {
  const value = req.headers.get('Authorization') || ''
  return value.startsWith('Bearer ') ? value.slice(7) : null
}

async function signSession(sessionId: string, nonce: string, seed: number, secret: string) {
  return hex(await hmac(encoder.encode(secret), `${sessionId}.${nonce}.${seed}`))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const sessionSecret = Deno.env.get('SESSION_SIGNING_SECRET')!
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const path = new URL(req.url).pathname.replace(/^\/api/, '') || '/'

  try {
    if (req.method === 'POST' && path === '/auth/telegram') {
      const { initData } = await req.json()
      const telegramUser = await verifyTelegramInitData(initData, botToken)
      const email = `telegram-${telegramUser.id}@signalmoment.invalid`

      const { data: user, error: userError } = await admin.from('users').upsert({
        telegram_user_id: telegramUser.id,
        username: telegramUser.username ?? null,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name ?? null,
        photo_url: telegramUser.photo_url ?? null,
        language_code: telegramUser.language_code ?? null,
        is_premium: telegramUser.is_premium ?? false,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'telegram_user_id' }).select().single()
      if (userError) throw userError

      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const existingAuthUser = listed.users.find((candidate) => candidate.email === email)
      if (!existingAuthUser) {
        const { error: createAuthError } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { telegram_user_id: String(telegramUser.id), app_user_id: user.id },
        })
        if (createAuthError) throw createAuthError
      } else {
        await admin.auth.admin.updateUserById(existingAuthUser.id, {
          user_metadata: { telegram_user_id: String(telegramUser.id), app_user_id: user.id },
        })
      }

      const { data: tokenData, error: tokenError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
      if (tokenError) throw tokenError
      await admin.from('events').insert({ event_type: 'user_authenticated', actor_user_id: user.id })
      return json({ user, token_hash: tokenData.properties.hashed_token, verification_type: 'magiclink' })
    }

    const accessToken = bearer(req)
    if (!accessToken) return json({ error: 'Unauthorized' }, 401)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken)
    if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401)
    const appUserId = authData.user.user_metadata.app_user_id as string | undefined
    if (!appUserId) return json({ error: 'Application identity missing' }, 401)

    if (req.method === 'POST' && path === '/chains') {
      const { inviterToken } = await req.json().catch(() => ({}))
      if (inviterToken) {
        const { data: inviter } = await admin.from('chain_members')
          .select('chain_id,user_id,depth,chains!inner(status,expires_at)')
          .eq('share_token', inviterToken).single()
        const parentChain = Array.isArray(inviter?.chains) ? inviter?.chains[0] : inviter?.chains
        if (!inviter || !parentChain || parentChain.status !== 'active' || new Date(parentChain.expires_at) <= new Date()) {
          return json({ error: 'Chain unavailable' }, 409)
        }

        const depth = inviter.depth + 1
        const { data: member, error: joinError } = await admin.from('chain_members').upsert({
          chain_id: inviter.chain_id,
          user_id: appUserId,
          inviter_user_id: inviter.user_id,
          depth,
        }, { onConflict: 'chain_id,user_id' }).select('share_token').single()
        if (joinError) throw joinError

        const { data: members } = await admin.from('chain_members').select('depth').eq('chain_id', inviter.chain_id)
        await admin.from('chains').update({
          participant_count: members?.length ?? 1,
          max_depth: Math.max(...(members ?? []).map((item) => item.depth)),
        }).eq('id', inviter.chain_id)
        await admin.from('events').insert({
          event_type: 'chain_joined', actor_user_id: appUserId, chain_id: inviter.chain_id,
          payload: { inviter_user_id: inviter.user_id, depth },
        })
        const { data: chain } = await admin.from('chains').select('*').eq('id', inviter.chain_id).single()
        return json({ chain: { ...chain, share_token: member.share_token } })
      }

      const { data: chain, error } = await admin.from('chains').insert({ creator_id: appUserId }).select().single()
      if (error) throw error
      const { data: member, error: memberError } = await admin.from('chain_members')
        .insert({ chain_id: chain.id, user_id: appUserId, depth: 0 }).select('share_token').single()
      if (memberError) throw memberError
      await admin.from('events').insert({ event_type: 'chain_created', actor_user_id: appUserId, chain_id: chain.id })
      return json({ chain: { ...chain, share_token: member.share_token } }, 201)
    }

    const chainMatch = path.match(/^\/chains\/([0-9a-f-]+)$/)
    if (req.method === 'GET' && chainMatch) {
      const { data: chain, error } = await authClient.from('chains')
        .select('*, chain_members(user_id,inviter_user_id,depth,best_result,joined_at), results(score,accuracy,success,user_id,created_at)')
        .eq('id', chainMatch[1]).single()
      if (error) return json({ error: 'Chain not found' }, 404)
      return json({ chain })
    }

    if (req.method === 'POST' && path === '/game-sessions') {
      const { chainId } = await req.json()
      const { data: member } = await admin.from('chain_members').select('chain_id')
        .eq('chain_id', chainId).eq('user_id', appUserId).maybeSingle()
      if (!member) return json({ error: 'Not a chain member' }, 403)

      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const sessionId = crypto.randomUUID()
      const nonce = crypto.randomUUID()
      const signature = await signSession(sessionId, nonce, seed, sessionSecret)
      const { data: gameSession, error } = await admin.from('game_sessions').insert({
        id: sessionId, chain_id: chainId, user_id: appUserId, seed, nonce, signature,
        status: 'started', started_at: new Date().toISOString(),
      }).select().single()
      if (error) throw error
      await admin.from('events').insert({
        event_type: 'session_created', actor_user_id: appUserId, chain_id: chainId, session_id: gameSession.id,
      })
      return json({ session: gameSession }, 201)
    }

    const resultMatch = path.match(/^\/game-sessions\/([0-9a-f-]+)\/results$/)
    if (req.method === 'POST' && resultMatch) {
      const { score, accuracy, success, clientDurationMs, nonce, signature } = await req.json()
      const { data: gameSession } = await admin.from('game_sessions').select('*')
        .eq('id', resultMatch[1]).eq('user_id', appUserId).single()
      if (!gameSession || gameSession.status !== 'started') return json({ error: 'Invalid session' }, 409)

      const expected = await signSession(gameSession.id, gameSession.nonce, gameSession.seed, sessionSecret)
      const finishedAt = new Date()
      const serverDurationMs = finishedAt.getTime() - new Date(gameSession.started_at).getTime()
      const reasons: string[] = []
      if (nonce !== gameSession.nonce || signature !== expected) reasons.push('signature')
      if (serverDurationMs < 12000 || serverDurationMs > 22000) reasons.push('server_duration')
      if (clientDurationMs < 12000 || clientDurationMs > 22000) reasons.push('client_duration')
      if (score < 0 || score > 15 || accuracy < 0 || accuracy > 100) reasons.push('bounds')
      const suspicious = reasons.length > 0

      const { data: result, error } = await admin.from('results').insert({
        session_id: gameSession.id, chain_id: gameSession.chain_id, user_id: appUserId,
        score, accuracy, success, client_duration_ms: clientDurationMs,
        server_duration_ms: serverDurationMs, suspicious,
      }).select().single()
      if (error) throw error

      await admin.from('game_sessions').update({
        status: 'finished', finished_at: finishedAt.toISOString(), suspicious,
        suspicious_reason: reasons.join(',') || null,
      }).eq('id', gameSession.id)
      if (!suspicious) {
        const { data: currentMember } = await admin.from('chain_members').select('best_result')
          .eq('chain_id', gameSession.chain_id).eq('user_id', appUserId).single()
        if (currentMember?.best_result == null || score > currentMember.best_result) {
          await admin.from('chain_members').update({ best_result: score })
            .eq('chain_id', gameSession.chain_id).eq('user_id', appUserId)
        }
        const { data: best } = await admin.from('results').select('score')
          .eq('chain_id', gameSession.chain_id).eq('suspicious', false)
          .order('score', { ascending: false }).limit(1).maybeSingle()
        await admin.from('chains').update({ best_result: best?.score ?? 0 }).eq('id', gameSession.chain_id)
      }
      await admin.from('events').insert({
        event_type: 'result_recorded', actor_user_id: appUserId,
        chain_id: gameSession.chain_id, session_id: gameSession.id,
        payload: { result_id: result.id, suspicious },
      })
      return json({ result })
    }

    if (req.method === 'GET' && path === '/users/me/activity') {
      const { data: events, error } = await authClient.from('events')
        .select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return json({ events })
    }

    return json({ error: 'Not found' }, 404)
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Internal error' }, 500)
  }
})
