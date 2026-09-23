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

/** 文件类型分组(扩展名 + MIME) — 镜像 rs FileTypeGroup */
interface FileTypeGroup {
  extensions: string[];
  mime_types: string[];
}

/** 上传文件类型白名单(GET /file_integrated/file_type_config 返回) — 镜像 rs FileTypeConfig */
interface FileTypeConfig {
  image: FileTypeGroup;
  document: FileTypeGroup;
  archive: FileTypeGroup;
  audio: FileTypeGroup;
  video: FileTypeGroup;
}

export type { QuicServerInfo, NatUdpPorts, FileTypeGroup, FileTypeConfig };
