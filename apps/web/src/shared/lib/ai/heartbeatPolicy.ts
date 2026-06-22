const HEARTBEAT_DISABLED_REASON = 'memory-policy-first mode'

export function isHeartbeatEnabled() {
  return process.env.AI_HEARTBEAT_ENABLED === 'true'
}

export function getHeartbeatDisabledReason() {
  return HEARTBEAT_DISABLED_REASON
}
