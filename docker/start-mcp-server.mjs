#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const configPath =
  process.env.START_MCP_SERVERS_FILE || '/config/start-mcp-servers.json'
const serverName = process.argv[2]

const fail = (message) => {
  console.error(`[start-mcp-server] ${message}`)
  process.exit(2)
}

const expandEnv = (value, fieldName) => {
  if (typeof value !== 'string') return value

  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    const envValue = process.env[name]
    if (!envValue) {
      fail(`${fieldName} references missing environment variable ${name}`)
    }
    return envValue
  })
}

if (!serverName || serverName === '--help' || serverName === '-h') {
  fail(`usage: start-mcp-server <server-name>`)
}

let config
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'))
} catch (error) {
  fail(`unable to read ${configPath}: ${error.message}`)
}

const servers = config.servers || {}
const server = servers[serverName]
if (!server) {
  fail(
    `unknown server "${serverName}". Available: ${
      Object.keys(servers).join(', ') || '(none)'
    }`,
  )
}

const transport = server.transport || 'streamableHttp'
if (!['streamableHttp', 'sse'].includes(transport)) {
  fail(
    `server "${serverName}" has unsupported transport "${transport}". Use "streamableHttp" or "sse".`,
  )
}

const url = expandEnv(server.url, `${serverName}.url`)
if (!url) {
  fail(`server "${serverName}" is missing url`)
}

const args = []
if (transport === 'streamableHttp') {
  args.push('--streamableHttp', url)
} else {
  args.push('--sse', url)
}

const logLevel = server.logLevel || process.env.SUPERGATEWAY_LOG_LEVEL || 'none'
args.push('--logLevel', logLevel)

if (server.oauth2BearerEnv) {
  const token = process.env[server.oauth2BearerEnv]
  if (!token) {
    fail(
      `server "${serverName}" requires environment variable ${server.oauth2BearerEnv}`,
    )
  }
  args.push('--oauth2Bearer', token)
} else if (server.oauth2Bearer) {
  args.push('--oauth2Bearer', expandEnv(server.oauth2Bearer, 'oauth2Bearer'))
}

for (const [name, value] of Object.entries(server.headers || {})) {
  args.push('--header', `${name}: ${expandEnv(value, `headers.${name}`)}`)
}

for (const [name, envName] of Object.entries(server.headerEnv || {})) {
  const value = process.env[envName]
  if (!value) {
    fail(`server "${serverName}" requires environment variable ${envName}`)
  }
  args.push('--header', `${name}: ${value}`)
}

if (Array.isArray(server.extraArgs)) {
  args.push(...server.extraArgs.map((arg) => expandEnv(String(arg), 'extraArgs')))
}

const childEnv = {
  ...process.env,
  ...(server.env || {}),
}

const forcedProtocolVersion = server.forceProtocolVersion
const child = spawn('supergateway', args, {
  stdio: forcedProtocolVersion ? ['pipe', 'pipe', 'inherit'] : 'inherit',
  env: childEnv,
})

if (forcedProtocolVersion) {
  let buffer = ''

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk

    while (true) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) break

      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)

      if (!line.trim()) {
        child.stdin.write('\n')
        continue
      }

      try {
        const message = JSON.parse(line)
        if (message?.method === 'initialize') {
          message.params = message.params || {}
          message.params.protocolVersion = forcedProtocolVersion
        }
        child.stdin.write(JSON.stringify(message) + '\n')
      } catch {
        child.stdin.write(line + '\n')
      }
    }
  })

  process.stdin.on('end', () => {
    if (buffer.length) {
      child.stdin.write(buffer)
    }
    child.stdin.end()
  })

  child.stdout.pipe(process.stdout)
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
  }
  process.exit(code ?? 1)
})
