/** QUIC 服务节点信息(GET /integrated/quic_servers 返回) — 镜像 rs QuicServerInfo */
interface QuicServerInfo {
  index: number;
  address: string;
}

/** NAT UDP 打洞端口(GET /integrated/nat_udp_ports 返回) — 镜像 rs NatUdpPorts */
interface NatUdpPorts {
  v4_port_1: number;
  v6_port_1: number;
  v4_port_2: number;
  v6_port_2: number;
}

export type { QuicServerInfo, NatUdpPorts };
