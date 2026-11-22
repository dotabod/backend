interface SocketBroadcastTarget {
  emit: (event: string, ...args: unknown[]) => unknown
}

export interface GsiSocketServer {
  fetchSockets: () => Promise<unknown[]>
  to: (room: string) => SocketBroadcastTarget
}
