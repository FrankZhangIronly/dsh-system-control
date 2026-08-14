// dsh-system-control — 宿主半（node half）
// 注册 /system RPC 通道（authority: loopback，非本机自动 403）：
//   restart -> appExit(42)   关闭窗口后由 DSH Web.ps1 循环重新拉起
//   shutdown -> appExit(0)   优雅退出
//   status  -> { exitAvailable }   供客户端自检退出通道（无害）
// handler 签名由 dsh-client-connection 的 rpcFetchHandler 约束：
//   (endpoint, payload, signal) => Promise<RpcResult>

const RESTART_EXIT_CODE = 42

const inject = ['connection']

function apply(ctx) {
  const connection = ctx.get('connection')
  if (connection === undefined) {
    console.error('[system-control] connection service unavailable; /system channel not registered')
    return
  }

  const handler = async (endpoint) => {
    const action = typeof endpoint === 'string' ? endpoint : ''
    const exit = ctx.get('appExit')

    if (action === 'status') {
      return {
        ok: true,
        value: { exitAvailable: typeof exit === 'function', exitType: typeof exit },
      }
    }

    const code = action === 'shutdown' ? 0 : action === 'restart' ? RESTART_EXIT_CODE : undefined
    if (code === undefined) {
      return { ok: false, error: { code: 'internal', message: `unknown endpoint ${action}`, details: {} } }
    }
    if (typeof exit !== 'function') {
      return { ok: false, error: { code: 'internal', message: 'no process-exit channel (appExit unavailable)', details: {} } }
    }

    const timer = ctx.get('timer')
    const fire = () => exit(code)
    if (timer !== undefined && typeof timer.timeout === 'function') {
      // 先返回 ack，稍后再退出，保证 HTTP 响应先刷回浏览器
      timer.timeout(fire, 80)
    } else {
      fire()
    }
    return { ok: true, value: { accepted: true, code } }
  }

  ctx.effect(
    () => connection.rpc.handle('/system', handler, { authority: 'loopback' }),
    'system-control: /system rpc channel',
  )
}

export { apply, inject }
export default { apply, inject }
