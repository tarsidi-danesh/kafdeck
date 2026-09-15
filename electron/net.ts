import dns from 'node:dns'
import net from 'node:net'
import tls from 'node:tls'
import type { ISocketFactory } from 'kafkajs'

const KEEP_ALIVE_DELAY = 60000
const NAMESERVER_TIMEOUT = 2000

type LookupAddress = { address: string; family: number }

// Split-horizon setups (a corporate VPN alongside a normal uplink) hand the
// system resolver several nameservers where only one knows the internal zone.
// getaddrinfo and the default c-ares path both take the first answer they get,
// so an NXDOMAIN from a public nameserver makes an internal broker look dead.
// Asking each nameserver in turn finds the one that can actually answer.
function resolveViaNameservers(hostname: string): Promise<LookupAddress> {
  const servers = dns.getServers()

  return servers.reduce<Promise<LookupAddress>>(
    (attempt, server) =>
      attempt.catch(
        () =>
          new Promise<LookupAddress>((resolve, reject) => {
            const resolver = new dns.Resolver({ timeout: NAMESERVER_TIMEOUT, tries: 1 })
            try {
              resolver.setServers([server])
            } catch {
              reject(new Error(`unusable nameserver ${server}`))
              return
            }
            resolver.resolve4(hostname, (error, addresses) => {
              if (!error && addresses?.length) {
                resolve({ address: addresses[0], family: 4 })
                return
              }
              resolver.resolve6(hostname, (error6, addresses6) => {
                if (!error6 && addresses6?.length) resolve({ address: addresses6[0], family: 6 })
                else reject(error6 ?? error ?? new Error(`no answer from ${server}`))
              })
            })
          }),
      ),
    Promise.reject(new Error('no nameservers configured')),
  )
}

// Passed to net/tls so every broker connection resolves the same way, which also
// covers the hostnames the cluster reports in its own metadata.
export const resilientLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, options as dns.LookupOneOptions, (error, address, family) => {
    if (!error) {
      callback(null, address, family)
      return
    }
    resolveViaNameservers(hostname).then(
      (resolved) =>
        options.all
          ? callback(null, [resolved])
          : callback(null, resolved.address, resolved.family),
      () => callback(error, ''),
    )
  })
}

export function createSocketFactory(): ISocketFactory {
  return ({ host, port, ssl, onConnect }) => {
    const socket = ssl
      ? tls.connect(
          { host, port, lookup: resilientLookup, ...(net.isIP(host) ? {} : { servername: host }), ...ssl },
          onConnect,
        )
      : net.connect({ host, port, lookup: resilientLookup }, onConnect)

    socket.setKeepAlive(true, KEEP_ALIVE_DELAY)
    return socket
  }
}
